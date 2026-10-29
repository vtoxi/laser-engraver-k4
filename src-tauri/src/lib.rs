use std::io::Cursor;
use std::sync::mpsc::RecvTimeoutError;
use std::sync::Mutex;
use std::time::Duration;

use base64::Engine;
use image::{DynamicImage, GenericImageView};
use tauri::{AppHandle, Manager, State};

mod driver_installer;
mod image_processor;
mod serial;

use image_processor::dither::{atkinson, bayer4x4, floyd_steinberg, threshold};
use image_processor::outline::foreground_outline;
use image_processor::transforms::{
    adjust, crop, flip_h, flip_v, invert, resize_exact, rotate, to_grayscale,
};
use serial::connection::{list_ports, PortInfo};
use serial::worker::{run_worker, WorkerMsg};

pub struct AppState {
    pub worker_tx: Mutex<Option<std::sync::mpsc::Sender<WorkerMsg>>>,
    pub current_image: Mutex<Option<DynamicImage>>,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub struct CropRect {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

fn default_engrave_mode() -> String {
    "raster".to_string()
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EngraveParams {
    /// IPC may send either `cropRect` (camelCase) or `crop_rect` depending on client serialization.
    #[serde(alias = "crop_rect")]
    pub crop_rect: Option<CropRect>,
    pub resize_to: Option<(u32, u32)>,
    /// `"raster"` (dithered fill) or `"outline"` (boundary of thresholded shape only).
    #[serde(default = "default_engrave_mode")]
    pub engrave_mode: String,
    pub brightness: i32,
    pub contrast: f32,
    pub threshold: u8,
    pub dither_mode: String,
    pub invert: bool,
    pub rotate_deg: u32,
    pub flip_h: bool,
    pub flip_v: bool,
    pub depth: u16,
    pub power: u16,
    pub passes: u8,
    pub speed: u16,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct ImageInfo {
    pub width: u32,
    pub height: u32,
    pub preview_b64: String,
}

fn send_to_worker(state: &State<'_, AppState>, msg: WorkerMsg) -> Result<(), String> {
    let tx = state
        .worker_tx
        .lock()
        .map_err(|_| "internal lock poisoned".to_string())?;
    let sender = tx
        .as_ref()
        .ok_or_else(|| "Serial worker not ready".to_string())?;
    sender.send(msg).map_err(|e| e.to_string())
}

fn process_image(img: &DynamicImage, params: &EngraveParams) -> Result<Vec<Vec<bool>>, String> {
    let mut processed = img.clone();
    if let Some(c) = params.crop_rect {
        let (iw, ih) = processed.dimensions();
        if c.x >= iw || c.y >= ih {
            return Err("Crop is outside the image bounds".into());
        }
        let max_w = iw - c.x;
        let max_h = ih - c.y;
        let w = c.width.max(1).min(max_w);
        let h = c.height.max(1).min(max_h);
        processed = crop(&processed, c.x, c.y, w, h);
    }
    if let Some((w, h)) = params.resize_to {
        processed = resize_exact(&processed, w, h);
    }
    if params.invert {
        processed = invert(&processed);
    }
    processed = adjust(&processed, params.brightness, params.contrast);
    if params.rotate_deg != 0 {
        processed = rotate(&processed, params.rotate_deg);
    }
    if params.flip_h {
        processed = flip_h(&processed);
    }
    if params.flip_v {
        processed = flip_v(&processed);
    }
    let gray = to_grayscale(&processed);
    let lines = if params.engrave_mode == "outline" {
        let mask = threshold(&gray, params.threshold);
        foreground_outline(&mask)
    } else {
        match params.dither_mode.as_str() {
            "floyd" => floyd_steinberg(&gray, params.threshold),
            "atkinson" => atkinson(&gray, params.threshold),
            "bayer" => bayer4x4(&gray),
            _ => threshold(&gray, params.threshold),
        }
    };
    if lines.is_empty() || lines[0].is_empty() {
        return Err("Processed image has no pixels".into());
    }
    if !lines.iter().any(|row| row.iter().any(|&on| on)) {
        return Err("Nothing to engrave (try outline threshold or raster mode)".into());
    }
    Ok(lines)
}

fn encode_preview(img: &DynamicImage, max_size: u32) -> String {
    let resized = img.thumbnail(max_size, max_size);
    let mut buf = Vec::new();
    let _ = resized.write_to(&mut Cursor::new(&mut buf), image::ImageFormat::Png);
    base64::engine::general_purpose::STANDARD.encode(&buf)
}

fn lines_to_preview_b64(lines: &[Vec<bool>], max_size: u32) -> Result<String, String> {
    let h = lines.len() as u32;
    let w = lines.first().map(|l| l.len()).unwrap_or(0) as u32;
    let mut out = image::GrayImage::new(w.max(1), h.max(1));
    for (y, row) in lines.iter().enumerate() {
        for (x, &on) in row.iter().enumerate() {
            out.put_pixel(
                x as u32,
                y as u32,
                image::Luma([if on { 0 } else { 255 }]),
            );
        }
    }
    let dyn_img = DynamicImage::ImageLuma8(out);
    Ok(encode_preview(&dyn_img, max_size))
}

#[tauri::command]
async fn list_serial_ports(show_all: bool) -> Vec<PortInfo> {
    list_ports(show_all)
}

#[tauri::command]
async fn connect_device(port_path: String, state: State<'_, AppState>) -> Result<(), String> {
    let (reply_tx, reply_rx) = std::sync::mpsc::sync_channel(1);
    send_to_worker(
        &state,
        WorkerMsg::Connect {
            path: port_path,
            reply: reply_tx,
        },
    )?;
    let raw = tokio::task::spawn_blocking(move || reply_rx.recv_timeout(Duration::from_secs(75)))
        .await
        .map_err(|e| format!("connect join: {e}"))?;
    match raw {
        Ok(Ok(())) => Ok(()),
        Ok(Err(msg)) => Err(msg),
        Err(RecvTimeoutError::Timeout) => {
            Err("Connection timed out — device did not finish handshake.".into())
        }
        Err(RecvTimeoutError::Disconnected) => Err("Serial worker stopped.".into()),
    }
}

#[tauri::command]
async fn disconnect_device(state: State<'_, AppState>) -> Result<(), String> {
    send_to_worker(&state, WorkerMsg::Disconnect)
}

#[tauri::command]
async fn machine_home(state: State<'_, AppState>) -> Result<(), String> {
    send_to_worker(&state, WorkerMsg::Home)
}

#[tauri::command]
async fn machine_jog(x: u16, y: u16, state: State<'_, AppState>) -> Result<(), String> {
    send_to_worker(&state, WorkerMsg::Jog { x, y })
}

#[tauri::command]
async fn machine_preview_frame(
    x: u16,
    y: u16,
    w: u16,
    h: u16,
    state: State<'_, AppState>,
) -> Result<(), String> {
    send_to_worker(&state, WorkerMsg::PreviewFrame { x, y, w, h })
}

#[tauri::command]
async fn machine_stop_preview(state: State<'_, AppState>) -> Result<(), String> {
    send_to_worker(&state, WorkerMsg::StopPreview)
}

#[tauri::command]
async fn machine_set_params(
    speed: u16,
    power: u16,
    passes: u8,
    state: State<'_, AppState>,
) -> Result<(), String> {
    send_to_worker(
        &state,
        WorkerMsg::SetParams {
            speed,
            power,
            passes,
        },
    )
}

#[tauri::command]
async fn machine_stop_job(state: State<'_, AppState>) -> Result<(), String> {
    send_to_worker(&state, WorkerMsg::StopJob)
}

#[tauri::command]
async fn machine_pause_job(state: State<'_, AppState>) -> Result<(), String> {
    send_to_worker(&state, WorkerMsg::PauseJob)
}

#[tauri::command]
async fn load_image(path: String, state: State<'_, AppState>) -> Result<ImageInfo, String> {
    let path_clone = path.clone();
    let img = tokio::task::spawn_blocking(move || image::open(path_clone).map_err(|e| e.to_string()))
        .await
        .map_err(|e| e.to_string())??;

    let (w, h) = img.dimensions();
    let preview_b64 = encode_preview(&img, 400);
    *state
        .current_image
        .lock()
        .map_err(|_| "internal lock poisoned".to_string())? = Some(img);
    Ok(ImageInfo {
        width: w,
        height: h,
        preview_b64,
    })
}

#[tauri::command]
async fn start_engrave_job(
    params: EngraveParams,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let img = {
        let g = state
            .current_image
            .lock()
            .map_err(|_| "internal lock poisoned".to_string())?;
        g.as_ref()
            .ok_or_else(|| "No image loaded".to_string())?
            .clone()
    };
    let lines = process_image(&img, &params)?;
    send_to_worker(
        &state,
        WorkerMsg::StartJob {
            lines,
            depth: params.depth,
            power: params.power,
            speed: params.speed,
            passes: params.passes,
        },
    )
}

#[tauri::command]
async fn generate_preview(
    params: EngraveParams,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let img = {
        let g = state
            .current_image
            .lock()
            .map_err(|_| "internal lock poisoned".to_string())?;
        g.as_ref()
            .ok_or_else(|| "No image loaded".to_string())?
            .clone()
    };
    tokio::task::spawn_blocking(move || {
        let lines = process_image(&img, &params)?;
        lines_to_preview_b64(&lines, 400)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageDimensions {
    pub width: u32,
    pub height: u32,
}

#[tauri::command]
async fn set_current_image_from_png_base64(
    base64_png: String,
    state: State<'_, AppState>,
) -> Result<ImageDimensions, String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(base64_png.trim())
        .map_err(|e| format!("invalid base64: {e}"))?;
    let img = image::load_from_memory(&bytes).map_err(|e| e.to_string())?;
    let (w, h) = img.dimensions();
    *state
        .current_image
        .lock()
        .map_err(|_| "internal lock poisoned".to_string())? = Some(img);
    Ok(ImageDimensions { width: w, height: h })
}

#[tauri::command]
async fn install_driver(app: AppHandle) -> Result<String, String> {
    driver_installer::install(&app).map_err(|e| e.to_string())
}

pub fn run() {
    let _ = env_logger::try_init();
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let (tx, rx) = std::sync::mpsc::channel::<WorkerMsg>();
            let handle = app.handle().clone();
            std::thread::spawn(move || run_worker(rx, handle));
            app.manage(AppState {
                worker_tx: Mutex::new(Some(tx)),
                current_image: Mutex::new(None),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_serial_ports,
            connect_device,
            disconnect_device,
            machine_home,
            machine_jog,
            machine_preview_frame,
            machine_stop_preview,
            machine_set_params,
            machine_stop_job,
            machine_pause_job,
            start_engrave_job,
            generate_preview,
            load_image,
            set_current_image_from_png_base64,
            install_driver,
        ])
        .run(tauri::generate_context!())
        .expect("error running LaserForge K4");
}
