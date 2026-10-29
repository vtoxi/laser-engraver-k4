use anyhow::{anyhow, Result};
use serialport::{ClearBuffer, SerialPort, SerialPortType};
use std::collections::HashSet;
use std::time::Duration;

use super::protocol::{ACK, BAUD_RATE};

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct PortInfo {
    pub path: String,
    pub description: String,
    pub is_k4_candidate: bool,
}

pub fn list_ports(show_all: bool) -> Vec<PortInfo> {
    let mut seen = HashSet::new();
    let mut out: Vec<PortInfo> = Vec::new();

    for p in serialport::available_ports().unwrap_or_default() {
        let info = port_info_from_serial(&p);
        if show_all {
            if !port_allowed_show_all(&info) {
                continue;
            }
        } else if !port_supported_for_k4(&info) {
            continue;
        }
        seen.insert(p.port_name.clone());
        out.push(info);
    }

    for path in unix_dev_fallback(show_all) {
        if !seen.insert(path.clone()) {
            continue;
        }
        let info = PortInfo {
            path: path.clone(),
            description: dev_path_description(&path),
            is_k4_candidate: is_k4_path_hint(&path),
        };
        if show_all {
            if !port_allowed_show_all(&info) {
                seen.remove(&path);
                continue;
            }
        } else if !port_supported_for_k4(&info) {
            seen.remove(&path);
            continue;
        }
        out.push(info);
    }

    #[cfg(target_os = "macos")]
    {
        if !show_all {
            out = macos_prefer_callout_ports(out);
        }
    }

    out.sort_by(|a, b| a.path.cmp(&b.path));
    log::debug!(
        "list_ports(show_all={}): {} port(s)",
        show_all,
        out.len()
    );
    out
}

fn port_allowed_show_all(p: &PortInfo) -> bool {
    let path = p.path.to_lowercase();
    !path.contains("bluetooth")
}

fn port_info_from_serial(p: &serialport::SerialPortInfo) -> PortInfo {
    let mut is_k4 = match &p.port_type {
        SerialPortType::UsbPort(usb) => {
            let vid = usb.vid;
            let desc = usb.product.as_deref().unwrap_or("").to_lowercase();
            vid == 0x1A86
                || desc.contains("ch340")
                || desc.contains("ch341")
                || desc.contains("usb serial")
        }
        _ => false,
    };
    if !is_k4 {
        is_k4 = is_k4_path_hint(&p.port_name);
    }
    PortInfo {
        path: p.port_name.clone(),
        description: match &p.port_type {
            SerialPortType::UsbPort(u) => u.product.clone().unwrap_or_default(),
            _ => "Unknown".into(),
        },
        is_k4_candidate: is_k4,
    }
}

/// K4 / CH340 family only — drops Bluetooth, built-in modems, FTDI/CP210x scan noise, etc.
fn port_supported_for_k4(p: &PortInfo) -> bool {
    let path = p.path.to_lowercase();
    if path.contains("bluetooth") {
        return false;
    }
    p.is_k4_candidate || is_k4_path_hint(&p.path)
}

/// Same USB adapter exposes both `/dev/cu.*` and `/dev/tty.*` on macOS. Apps should open **`cu.*`**
/// (call-out). Keep one entry per device suffix, preferring `cu.`.
#[cfg(target_os = "macos")]
fn macos_prefer_callout_ports(ports: Vec<PortInfo>) -> Vec<PortInfo> {
    use std::collections::HashMap;

    let mut groups: HashMap<String, (Option<PortInfo>, Option<PortInfo>)> = HashMap::new();
    let mut other: Vec<PortInfo> = Vec::new();

    for p in ports {
        if let Some(suf) = mac_serial_suffix(&p.path) {
            let slot = groups.entry(suf).or_insert((None, None));
            if p.path.contains("/cu.") {
                slot.0 = Some(p);
            } else if p.path.contains("/tty.") {
                slot.1 = Some(p);
            } else {
                other.push(p);
            }
        } else {
            other.push(p);
        }
    }

    let mut out: Vec<PortInfo> = groups
        .into_values()
        .filter_map(|(cu, tty)| cu.or(tty))
        .collect();
    out.extend(other);
    out
}

#[cfg(target_os = "macos")]
fn mac_serial_suffix(path: &str) -> Option<String> {
    let name = path.strip_prefix("/dev/")?;
    if let Some(s) = name.strip_prefix("cu.") {
        return Some(s.to_lowercase());
    }
    if let Some(s) = name.strip_prefix("tty.") {
        return Some(s.to_lowercase());
    }
    None
}

/// The sibling `/dev/tty.*` path for a `/dev/cu.*` path (and vice versa), same device on macOS.
#[cfg(target_os = "macos")]
fn macos_serial_sibling_path(path: &str) -> Option<String> {
    if path.contains("/cu.") {
        return Some(path.replace("/cu.", "/tty."));
    }
    if path.contains("/tty.") {
        return Some(path.replace("/tty.", "/cu."));
    }
    None
}

/// Paths to try when opening a serial device. On macOS, CH340 exposes both `cu.*` and `tty.*`;
/// try the user’s choice first, then the sibling so either can succeed.
pub fn connect_candidate_paths(user_path: &str) -> Vec<String> {
    #[cfg(target_os = "macos")]
    {
        let mut v = vec![user_path.to_string()];
        if let Some(alt) = macos_serial_sibling_path(user_path) {
            if alt != user_path && !v.iter().any(|p| p == &alt) {
                v.push(alt);
            }
        }
        v
    }
    #[cfg(not(target_os = "macos"))]
    {
        vec![user_path.to_string()]
    }
}

/// macOS/Linux: merge `/dev` entries when `serialport` misses devices.
#[cfg(unix)]
fn unix_dev_fallback(show_all: bool) -> Vec<String> {
    let Ok(dir) = std::fs::read_dir("/dev") else {
        return vec![];
    };
    let mut paths = Vec::new();
    for entry in dir.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if !is_unix_dev_serial_candidate(&name, show_all) {
            continue;
        }
        let path = format!("/dev/{}", name);
        if std::fs::metadata(&path).is_ok() {
            paths.push(path);
        }
    }
    paths
}

#[cfg(not(unix))]
fn unix_dev_fallback(_show_all: bool) -> Vec<String> {
    vec![]
}

#[cfg(target_os = "macos")]
fn is_unix_dev_serial_candidate(name: &str, show_all: bool) -> bool {
    if !(name.starts_with("cu.") || name.starts_with("tty.")) {
        return false;
    }
    let n = name.to_lowercase();
    if n.contains("bluetooth") {
        return false;
    }
    if show_all {
        return true;
    }
    n.contains("usbserial")
        || n.contains("wchusb")
        || n.contains("ch341")
        || n.contains("ch340")
}

#[cfg(target_os = "linux")]
fn is_unix_dev_serial_candidate(name: &str, _show_all: bool) -> bool {
    name.starts_with("ttyUSB") || name.starts_with("ttyACM")
}

#[cfg(not(any(target_os = "macos", target_os = "linux")))]
fn is_unix_dev_serial_candidate(_name: &str, _show_all: bool) -> bool {
    false
}

fn dev_path_description(path: &str) -> String {
    if path.contains("wchusb") || path.contains("ch34") {
        return "USB serial (WCH / CH340 family)".into();
    }
    if path.contains("usbserial") {
        return "USB serial".into();
    }
    if path.contains("usbmodem") {
        return "USB modem / serial".into();
    }
    if path.contains("ttyUSB") || path.contains("ttyACM") {
        return "USB serial (Linux)".into();
    }
    "Serial device".into()
}

fn is_k4_path_hint(path: &str) -> bool {
    let n = path.to_lowercase();
    let mac_usbserial = cfg!(target_os = "macos") && n.contains("usbserial");
    n.contains("wchusb")
        || n.contains("ch340")
        || n.contains("ch341")
        || n.contains("1a86")
        || mac_usbserial
}

/// Short I/O timeout so ACK polling (`wait_ack_inner`) can hit the deadline many times per second.
/// A multi-second timeout would let each `read()` block for most of `ack_timeout_ms`, starving the loop.
const PORT_IO_TIMEOUT_MS: u64 = 200;

pub fn open_port(path: &str) -> Result<Box<dyn SerialPort>> {
    let port = serialport::new(path, BAUD_RATE)
        .data_bits(serialport::DataBits::Eight)
        .parity(serialport::Parity::None)
        .stop_bits(serialport::StopBits::One)
        .flow_control(serialport::FlowControl::None)
        .timeout(Duration::from_millis(PORT_IO_TIMEOUT_MS))
        .open()
        .map_err(|e| anyhow!("Failed to open {}: {}", path, e))?;
    Ok(port)
}

/// Drop stale bytes from the adapter (common with CH340), then settle before first opcode.
pub fn prepare_port_for_session(port: &mut Box<dyn SerialPort>) {
    let _ = port.clear(ClearBuffer::Input);
    std::thread::sleep(Duration::from_millis(500));
}

/// Best-effort session reset: do not wait for ACK (avoids hanging on a dead prior session).
pub fn send_disconnect_blind(port: &mut Box<dyn SerialPort>) {
    let d = super::protocol::disconnect();
    let _ = port.write_all(&d);
    let _ = port.flush();
    std::thread::sleep(Duration::from_millis(120));
    let _ = port.clear(ClearBuffer::Input);
}

/// First try CONNECT after a clean RX buffer (many units never saw DISCONNECT). If that fails,
/// blind DISCONNECT then CONNECT again (stale session). On failure, error includes hex of any RX bytes.
pub fn handshake_connect(port: &mut Box<dyn SerialPort>, port_path: &str) -> Result<()> {
    let mut junk = Vec::new();
    let cmd = super::protocol::connect();

    prepare_port_for_session(port);
    if send_command_ex(port, &cmd, 3500, 5, 100, true, &mut junk).is_ok() {
        return Ok(());
    }

    send_disconnect_blind(port);
    junk.clear();
    if send_command_ex(port, &cmd, 3500, 5, 100, true, &mut junk).is_ok() {
        return Ok(());
    }

    let rx_hint = if junk.is_empty() {
        "no bytes read (wrong port, cable, baud, or device off / firmware not speaking this protocol).".to_string()
    } else {
        format!(
            "saw RX {} (expected single 0x09 ACK after 0x01 CONNECT).",
            junk.iter().map(|b| format!("{:02x}", b)).collect::<Vec<_>>().join(" ")
        )
    };
    Err(anyhow!(
        "CONNECT failed on {} — {} Close other apps using this port. If the vendor app works: python3 tools/k4_sniffer.py --port \"{}\" --mode sniff while using the official app. Check CH340 driver, 115200 8N1, cable, and that the engraver is powered on.",
        port_path,
        rx_hint,
        port_path
    ))
}

/// Wait for `ACK` (0x09). When `record_junk`, append non-ACK bytes to `junk` (max 48) for diagnostics.
fn wait_ack_inner(
    port: &mut Box<dyn SerialPort>,
    timeout_ms: u64,
    record_junk: bool,
    junk: &mut Vec<u8>,
) -> bool {
    let deadline = std::time::Instant::now() + Duration::from_millis(timeout_ms);
    let mut buf = [0u8; 1];
    while std::time::Instant::now() < deadline {
        match port.read(&mut buf) {
            Ok(0) => std::thread::yield_now(),
            Ok(1) => {
                if buf[0] == ACK {
                    return true;
                }
                if record_junk {
                    if junk.len() < 48 {
                        junk.push(buf[0]);
                    }
                } else {
                    log::warn!("Expected ACK ({ACK:#04X}), got {:02X}", buf[0]);
                }
            }
            Ok(_) => {}
            Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => {}
            Err(_) => std::thread::yield_now(),
        }
    }
    false
}

pub fn send_command(port: &mut Box<dyn SerialPort>, cmd: &[u8]) -> Result<()> {
    let mut z = Vec::new();
    send_command_ex(port, cmd, 2000, 3, 0, false, &mut z)
}

pub fn send_command_ex(
    port: &mut Box<dyn SerialPort>,
    cmd: &[u8],
    ack_timeout_ms: u64,
    max_attempts: usize,
    settle_after_write_ms: u64,
    record_junk: bool,
    junk: &mut Vec<u8>,
) -> Result<()> {
    for attempt in 0..max_attempts {
        port.write_all(cmd)?;
        port.flush()?;
        if settle_after_write_ms > 0 {
            std::thread::sleep(Duration::from_millis(settle_after_write_ms));
        }
        if wait_ack_inner(port, ack_timeout_ms, record_junk, junk) {
            return Ok(());
        }
        log::warn!(
            "ACK timeout on attempt {}/{} (timeout {} ms)",
            attempt + 1,
            max_attempts,
            ack_timeout_ms
        );
        std::thread::sleep(Duration::from_millis(150));
    }
    Err(anyhow!(
        "No ACK after {} attempts for cmd {:02X?}",
        max_attempts,
        &cmd[..cmd.len().min(8)]
    ))
}
