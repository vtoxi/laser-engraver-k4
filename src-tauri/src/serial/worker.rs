use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::sync::mpsc::Receiver;

use tauri::{AppHandle, Emitter};

use super::connection::{
    connect_candidate_paths, handshake_connect, open_port, send_command, send_command_ex,
    send_disconnect_blind,
};
use super::protocol::*;

pub enum WorkerMsg {
    Connect {
        path: String,
        reply: std::sync::mpsc::SyncSender<Result<(), String>>,
    },
    Disconnect,
    Home,
    FanOn,
    FanOff,
    PreviewFrame {
        x: u16,
        y: u16,
        w: u16,
        h: u16,
    },
    StopPreview,
    Jog {
        x: u16,
        y: u16,
    },
    SetParams {
        speed: u16,
        power: u16,
        passes: u8,
    },
    StartJob {
        lines: Vec<Vec<bool>>,
        depth: u16,
        power: u16,
        speed: u16,
        passes: u8,
    },
    PauseJob,
    StopJob,
}

#[derive(Debug, serde::Serialize, Clone)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum WorkerEvent {
    Connected {
        port: String,
    },
    Disconnected,
    Progress {
        row: u32,
        total: u32,
        pct: f32,
    },
    JobComplete,
    Error {
        message: String,
    },
}

fn emit(app: &AppHandle, evt: WorkerEvent) {
    let _ = app.emit("serial-event", &evt);
}

pub fn run_worker(rx: Receiver<WorkerMsg>, app: AppHandle) {
    let mut port: Option<Box<dyn serialport::SerialPort>> = None;
    let cancel = Arc::new(AtomicBool::new(false));

    while let Ok(msg) = rx.recv() {
        match msg {
            WorkerMsg::Connect { path, reply } => {
                if let Some(mut old) = port.take() {
                    send_disconnect_blind(&mut old);
                }
                port = None;

                let candidates = connect_candidate_paths(&path);
                let mut result: Result<(), String> =
                    Err("No serial path candidates".to_string());
                let mut errs: Vec<String> = Vec::new();

                for cand in candidates {
                    match open_port(&cand) {
                        Ok(mut p) => match handshake_connect(&mut p, &cand) {
                            Ok(()) => {
                                std::thread::sleep(std::time::Duration::from_millis(200));
                                port = Some(p);
                                emit(&app, WorkerEvent::Connected { port: cand.clone() });
                                result = Ok(());
                                break;
                            }
                            Err(e) => errs.push(format!("{cand}: {}", e)),
                        },
                        Err(e) => errs.push(format!("{cand}: {e}")),
                    }
                }

                if result.is_err() && !errs.is_empty() {
                    result = Err(errs.join("; "));
                }

                if let Err(ref e) = result {
                    log::warn!("connect failed: {}", e);
                }
                if reply.send(result).is_err() {
                    log::error!("connect reply channel closed before send");
                }
            }
            WorkerMsg::Disconnect => {
                if let Some(ref mut p) = port {
                    let _ = send_command(p, &disconnect());
                }
                port = None;
                emit(&app, WorkerEvent::Disconnected);
            }
            WorkerMsg::Home => {
                if let Some(ref mut p) = port {
                    let _ = send_command(p, &home());
                }
            }
            WorkerMsg::FanOn => {
                if let Some(ref mut p) = port {
                    let _ = send_command(p, &fan_on());
                }
            }
            WorkerMsg::FanOff => {
                if let Some(ref mut p) = port {
                    let _ = send_command(p, &fan_off());
                }
            }
            WorkerMsg::PreviewFrame { x, y, w, h } => {
                if let Some(ref mut p) = port {
                    let _ = send_command(p, &preview_frame(x, y, w, h));
                }
            }
            WorkerMsg::StopPreview => {
                if let Some(ref mut p) = port {
                    let _ = send_command(p, &stop_preview());
                }
            }
            WorkerMsg::SetParams {
                speed,
                power,
                passes,
            } => {
                if let Some(ref mut p) = port {
                    let _ = send_command(p, &set_params(speed, power, passes));
                }
            }
            WorkerMsg::Jog { x, y } => {
                if let Some(ref mut p) = port {
                    let _ = send_command(p, &jog(x, y));
                }
            }
            WorkerMsg::StartJob {
                ref lines,
                depth,
                power,
                speed,
                passes,
            } => {
                if let Some(ref mut p) = port {
                    cancel.store(false, Ordering::SeqCst);
                    let rows = lines.len() as u32;
                    let total_lines = rows.saturating_mul(passes as u32).max(1);

                    if send_command(p, &set_params(speed, power, passes)).is_err() {
                        emit(
                            &app,
                            WorkerEvent::Error {
                                message: "SET_PARAMS failed before job".into(),
                            },
                        );
                        continue;
                    }

                    if send_command(p, &start_engrave()).is_err() {
                        emit(
                            &app,
                            WorkerEvent::Error {
                                message: "START_ENGRAVE failed".into(),
                            },
                        );
                        continue;
                    }

                    let mut done: u32 = 0;
                    'outer: for _pass in 0..passes {
                        for (row, pixels) in lines.iter().enumerate() {
                            if cancel.load(Ordering::SeqCst) {
                                break 'outer;
                            }
                            let line_buf = image_line(pixels, row as u16, depth, power);
                            let mut junk = Vec::new();
                            if send_command_ex(p, &line_buf, 6000, 3, 25, false, &mut junk).is_err() {
                                let rx = if junk.is_empty() {
                                    String::new()
                                } else {
                                    format!(
                                        " RX: {}",
                                        junk.iter()
                                            .take(16)
                                            .map(|b| format!("{:02x}", b))
                                            .collect::<Vec<_>>()
                                            .join(" ")
                                    )
                                };
                                emit(
                                    &app,
                                    WorkerEvent::Error {
                                        message: format!("Image line {row} failed (no ACK).{rx}"),
                                    },
                                );
                                break 'outer;
                            }
                            done += 1;
                            if row % 8 == 0 || row + 1 == lines.len() {
                                let pct = (done as f32 / total_lines as f32) * 100.0;
                                emit(
                                    &app,
                                    WorkerEvent::Progress {
                                        row: done,
                                        total: total_lines,
                                        pct,
                                    },
                                );
                            }
                        }
                    }

                    let _ = send_command(p, &stop_engrave());
                    emit(&app, WorkerEvent::JobComplete);
                } else {
                    emit(
                        &app,
                        WorkerEvent::Error {
                            message: "Not connected to a serial port".into(),
                        },
                    );
                }
            }
            WorkerMsg::StopJob => {
                cancel.store(true, Ordering::SeqCst);
                if let Some(ref mut p) = port {
                    let _ = send_command(p, &stop_engrave());
                }
            }
            WorkerMsg::PauseJob => {
                if let Some(ref mut p) = port {
                    let _ = send_command(p, &pause_engrave());
                }
            }
        }
    }
}
