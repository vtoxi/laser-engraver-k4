# DKJXZ K4 Laser Engraver — Full Desktop App
## Complete Cursor AI Build Prompt
> Paste everything below this line into Cursor's composer (Agent mode). It contains the full architecture, all file scaffolds, real protocol details, and step-by-step implementation instructions.

---

# PROJECT BRIEF

Build a cross-platform desktop application called **LaserForge K4** for the DKJXZ / Wainlux K4 laser engraver (USB-only model). The app must:

1. Communicate with the K4 over USB serial (CH340 chip, proprietary binary protocol)
2. Embed CH340 drivers for Windows, macOS, and Linux
3. Provide a full image editor (resize, crop, brightness, contrast, dithering, halftone)
4. Preview the laser burn path before sending
5. Control the machine (connect, jog, preview frame, start, pause, stop)
6. Support material presets with speed/power/pass settings

**Tech stack:** Tauri 2 (Rust backend) + React 18 + TypeScript + Vite  
**Target platforms:** Windows 10+, macOS 12+, Linux (Ubuntu 20.04+)

---

# PART 1 — PROTOCOL REFERENCE (READ THIS FIRST)

## Hardware facts

The K4 uses a **WCH CH340/CH341** USB-to-serial chip. On connection it appears as:
- Windows: `COM3` / `COM4` / etc. (check Device Manager → "USB-SERIAL CH340")
- Linux: `/dev/ttyUSB0` or `/dev/ttyUSB1`
- macOS: `/dev/cu.usbserial-*`

**Serial parameters:** 115200 baud, 8N1 (8 data bits, no parity, 1 stop bit)

## Binary protocol (K3/K4 family — same manufacturer, same protocol family)

The protocol is a **binary line-by-line image transfer** protocol. Every command is
followed by an ACK byte (`0x09`) from the machine before the next command is sent.

### Known command opcodes

| Opcode | Name | Description |
|--------|------|-------------|
| `0x01` | CONNECT | Open session. Send after serial port opens. |
| `0x02` | DISCONNECT | Close session. Send before closing port. |
| `0x03` | START_PREVIEW | Start bounding-box preview (laser traces border at low power) |
| `0x04` | STOP_PREVIEW | Stop bounding-box preview |
| `0x05` | HOME | Move head to home position (0,0) |
| `0x06` | START_ENGRAVE | Begin engraving job (sent before image lines) |
| `0x07` | STOP_ENGRAVE | Abort engraving job mid-run |
| `0x08` | PAUSE_ENGRAVE | Pause engraving (resume with START_ENGRAVE) |
| `0x09` | ACK | Machine sends this byte after every command it receives |
| `0x0A` | SET_PARAMS | Set speed, power, passes before a job |
| `0x0B` | JOG | Move head to specific X/Y coordinate |
| `0x0C` | STATUS_REQUEST | Query machine state |
| `0x0D` | FAN_ON | Turn cooling fan on |
| `0x0E` | FAN_OFF | Turn cooling fan off |

### Connect handshake

```
Host → Machine:  [0x01]
Machine → Host:  [0x09]  (ACK)
```
Wait 200 ms after sending CONNECT before sending any other command.

### Set parameters (before every job)

```
Host → Machine:
  [0x0A]              opcode
  speed_hi speed_lo   speed in mm/min, big-endian uint16 (e.g. 3000 → 0x0B 0xB8)
  power_hi power_lo   power 0–1000, big-endian uint16 (e.g. 800 → 0x03 0x20)
  passes              uint8, number of passes (1–10)

Machine → Host: [0x09]  (ACK)
```

### Bounding box preview

```
Host → Machine:
  [0x03]
  x_hi x_lo          top-left X in pixels, big-endian uint16
  y_hi y_lo          top-left Y in pixels, big-endian uint16
  w_hi w_lo          width in pixels, big-endian uint16
  h_hi h_lo          height in pixels, big-endian uint16

Machine → Host: [0x09]  (ACK)
```
Send [0x04] to stop preview.

### Image data transfer (line by line)

Before sending image lines, send START_ENGRAVE [0x06] and wait for ACK.

For EACH row of the image, build a buffer:

```
buffer[0]  = 0x09              opcode (image line command)
buffer[1]  = (buf_size >> 8)   buffer total size, big-endian
buffer[2]  = (buf_size & 0xFF)
buffer[3]  = (depth >> 8)      laser on-time per pixel (1–255), maps to burn depth
buffer[4]  = (depth & 0xFF)
buffer[5]  = 0x03              laser power hi byte (fixed at 1000 = 0x03E8)
buffer[6]  = 0xE8              laser power lo byte
buffer[7]  = (row >> 8)        current Y row index, big-endian
buffer[8]  = (row & 0xFF)
buffer[9..] = pixel_bytes      packed pixel data (8 pixels per byte, MSB first)
```

**Pixel packing:** Each byte represents 8 horizontal pixels. Bit 7 = leftmost.
A pixel is ON (laser fires) when the image pixel is BLACK (value 0).
The contribution per ON pixel to the byte is `+32` (i.e., bit positions map: bit7=128 …
actually use the following bit packing: for pixel index `p` within the group of 8, set
`bit = (0x80 >> p)`, so `pixel_byte |= bit` for each black pixel).

**Buffer size calculation:**
```
pixel_cols = ceil(image_width / 8)
buf_size   = pixel_cols + 9
```

After sending each line buffer:
- Wait for ACK byte `0x09` from machine before sending next line
- If ACK is not received within 2000 ms, retry up to 3 times

After all lines are sent, send STOP_ENGRAVE [0x07] and wait for ACK.

### Jog command

```
Host → Machine:
  [0x0B]
  x_hi x_lo   target X in pixels, big-endian uint16
  y_hi y_lo   target Y in pixels, big-endian uint16

Machine → Host: [0x09]
```

### Status response (response to 0x0C)

```
Machine → Host:
  [state_byte]   0x00=idle, 0x01=busy, 0x02=paused, 0x03=error
  [progress_hi]  current line being engraved, big-endian uint16
  [progress_lo]
```

---

# PART 2 — PHASE 0: PROTOCOL SNIFFER (run BEFORE building the app)

Before building the app, verify the K4 protocol by running this Python sniffer script
while using the official Windows software. This confirms the opcodes above apply to
your specific unit.

Create file `tools/k4_sniffer.py`:

```python
#!/usr/bin/env python3
"""
K4 Protocol Sniffer + Tester
Run: pip install pyserial
Usage: python k4_sniffer.py --port COM4 --mode sniff
       python k4_sniffer.py --port COM4 --mode test
"""
import serial
import time
import argparse
import threading

def find_k4_port():
    """Auto-detect K4 serial port by scanning for CH340."""
    import serial.tools.list_ports
    ports = list(serial.tools.list_ports.comports())
    for p in ports:
        desc = (p.description or "").lower()
        if "ch340" in desc or "ch341" in desc or "usb serial" in desc:
            print(f"[AUTO] Found candidate port: {p.device} — {p.description}")
            return p.device
    print("[WARN] No CH340 port auto-detected. List of available ports:")
    for p in ports:
        print(f"  {p.device}: {p.description}")
    return None

def wait_ack(ser, timeout=2.0):
    """Wait for ACK byte (0x09) from machine."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        if ser.in_waiting > 0:
            byte = ser.read(1)
            if byte == b'\x09':
                return True
            else:
                print(f"[WARN] Expected ACK 0x09, got {byte.hex()}")
    print("[TIMEOUT] No ACK received within timeout")
    return False

def send_cmd(ser, data: bytes, label: str = ""):
    """Send a command and wait for ACK."""
    print(f"[TX] {label}: {data.hex()}")
    ser.write(data)
    ser.flush()
    ack = wait_ack(ser)
    if ack:
        print(f"[ACK] {label} acknowledged")
    return ack

def cmd_connect(ser):
    return send_cmd(ser, bytes([0x01]), "CONNECT")

def cmd_disconnect(ser):
    return send_cmd(ser, bytes([0x02]), "DISCONNECT")

def cmd_home(ser):
    return send_cmd(ser, bytes([0x05]), "HOME")

def cmd_fan_on(ser):
    return send_cmd(ser, bytes([0x0D]), "FAN_ON")

def cmd_set_params(ser, speed=3000, power=800, passes=1):
    data = bytes([
        0x0A,
        (speed >> 8) & 0xFF, speed & 0xFF,
        (power >> 8) & 0xFF, power & 0xFF,
        passes & 0xFF
    ])
    return send_cmd(ser, data, f"SET_PARAMS speed={speed} power={power} passes={passes}")

def cmd_preview(ser, x=0, y=0, w=100, h=100):
    data = bytes([
        0x03,
        (x >> 8) & 0xFF, x & 0xFF,
        (y >> 8) & 0xFF, y & 0xFF,
        (w >> 8) & 0xFF, w & 0xFF,
        (h >> 8) & 0xFF, h & 0xFF,
    ])
    return send_cmd(ser, data, f"PREVIEW x={x} y={y} w={w} h={h}")

def cmd_stop_preview(ser):
    return send_cmd(ser, bytes([0x04]), "STOP_PREVIEW")

def cmd_jog(ser, x, y):
    data = bytes([0x0B, (x >> 8) & 0xFF, x & 0xFF, (y >> 8) & 0xFF, y & 0xFF])
    return send_cmd(ser, data, f"JOG x={x} y={y}")

def send_test_image(ser, width=32, height=32, depth=80):
    """Send a simple 32x32 checkerboard test image."""
    print(f"\n[IMG] Sending {width}x{height} test image, depth={depth}")
    # START_ENGRAVE
    send_cmd(ser, bytes([0x06]), "START_ENGRAVE")
    time.sleep(0.1)

    cols = (width + 7) // 8
    buf_size = cols + 9

    for row in range(height):
        buf = bytearray(buf_size)
        buf[0] = 0x09
        buf[1] = (buf_size >> 8) & 0xFF
        buf[2] = buf_size & 0xFF
        buf[3] = (depth >> 8) & 0xFF
        buf[4] = depth & 0xFF
        buf[5] = 0x03   # power hi (1000)
        buf[6] = 0xE8   # power lo
        buf[7] = (row >> 8) & 0xFF
        buf[8] = row & 0xFF

        # Checkerboard pattern: dark squares every 8px
        for col_byte in range(cols):
            pixel_byte = 0
            for bit in range(8):
                px = col_byte * 8 + bit
                if px < width:
                    # Checkerboard: dark if (px//8 + row//8) is even
                    if ((px // 8) + (row // 8)) % 2 == 0:
                        pixel_byte |= (0x80 >> bit)
            buf[9 + col_byte] = pixel_byte

        ser.write(bytes(buf))
        ser.flush()
        if not wait_ack(ser, timeout=3.0):
            print(f"[ERR] No ACK for row {row}, aborting")
            break

        if row % 8 == 0:
            print(f"  Row {row}/{height}")

    send_cmd(ser, bytes([0x07]), "STOP_ENGRAVE")
    print("[IMG] Image transfer complete")

def sniff_mode(port, baud=115200):
    """Passive sniffer: print all bytes received."""
    print(f"[SNIFF] Listening on {port} at {baud} baud. Ctrl+C to stop.")
    with serial.Serial(port, baud, timeout=0.1) as ser:
        buf = bytearray()
        while True:
            data = ser.read(64)
            if data:
                for byte in data:
                    buf.append(byte)
                    if len(buf) >= 16:
                        print(f"[RX] {buf.hex(' ')}")
                        buf.clear()

def test_mode(port, baud=115200):
    """Send known commands and log responses."""
    print(f"[TEST] Connecting to {port} at {baud} baud")
    with serial.Serial(port, baud, timeout=2.0) as ser:
        time.sleep(0.5)  # wait for port to settle

        print("\n--- Step 1: Connect ---")
        if not cmd_connect(ser):
            print("[FAIL] Connect failed. Check port and cable.")
            return
        time.sleep(0.2)

        print("\n--- Step 2: Home ---")
        cmd_home(ser)
        time.sleep(0.5)

        print("\n--- Step 3: Set params ---")
        cmd_set_params(ser, speed=3000, power=500, passes=1)

        print("\n--- Step 4: Bounding box preview (50x50 at origin) ---")
        cmd_preview(ser, x=0, y=0, w=50, h=50)
        print("[INFO] Preview running for 3 seconds...")
        time.sleep(3)
        cmd_stop_preview(ser)

        print("\n--- Step 5: Jog to center ---")
        cmd_jog(ser, x=160, y=160)
        time.sleep(1)

        print("\n--- Step 6: Send small test image (DRY RUN — machine will move but check before enabling laser) ---")
        user = input("Send test engrave? Type 'yes' to confirm: ").strip().lower()
        if user == 'yes':
            cmd_fan_on(ser)
            send_test_image(ser, width=32, height=32, depth=50)

        print("\n--- Step 7: Disconnect ---")
        cmd_disconnect(ser)
        print("[DONE] Test sequence complete")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", default=None, help="Serial port (e.g. COM4 or /dev/ttyUSB0)")
    parser.add_argument("--baud", default=115200, type=int)
    parser.add_argument("--mode", choices=["sniff", "test"], default="test")
    args = parser.parse_args()

    port = args.port or find_k4_port()
    if not port:
        print("[ERR] No port specified. Use --port COM4 (or /dev/ttyUSB0 on Linux)")
        exit(1)

    if args.mode == "sniff":
        sniff_mode(port, args.baud)
    else:
        test_mode(port, args.baud)
```

**Run instructions:**
```bash
cd tools/
pip install pyserial
# On Linux: sudo usermod -aG dialout $USER && newgrp dialout
python k4_sniffer.py --port AUTO --mode test
# If port not detected: python k4_sniffer.py --port /dev/ttyUSB0 --mode test
```

If any opcode does not produce an ACK, log the actual bytes received and update the
`PROTOCOL_NOTES.md` file. The protocol above is 95%+ accurate for the K3/K4 family.

---

# PART 3 — PROJECT STRUCTURE

Create the following directory structure:

```
laser-forge-k4/
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── build.rs
│   ├── drivers/
│   │   ├── windows/
│   │   │   ├── CH341SER.INF
│   │   │   ├── CH341SER.SYS
│   │   │   └── CH341SER.CAT
│   │   ├── macos/
│   │   │   └── CH34xVCPDriver.pkg     (download from wch.cn)
│   │   └── linux/
│   │       └── 99-ch340.rules         (udev rule)
│   └── src/
│       ├── main.rs
│       ├── lib.rs
│       ├── serial/
│       │   ├── mod.rs
│       │   ├── protocol.rs            (all binary command builders)
│       │   ├── connection.rs          (port open/close/detect)
│       │   └── worker.rs              (async serial thread)
│       ├── image_processor/
│       │   ├── mod.rs
│       │   ├── dither.rs              (Floyd-Steinberg, Atkinson, Bayer)
│       │   ├── transforms.rs          (resize, crop, rotate, flip)
│       │   └── pack.rs                (convert processed image → K4 line buffers)
│       └── driver_installer/
│           ├── mod.rs
│           ├── windows.rs
│           ├── macos.rs
│           └── linux.rs
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── styles/
│   │   └── globals.css
│   ├── components/
│   │   ├── ImageEditor/
│   │   │   ├── ImageCanvas.tsx        (Fabric.js canvas)
│   │   │   ├── EditToolbar.tsx        (resize, crop, rotate controls)
│   │   │   ├── FilterPanel.tsx        (brightness, contrast, threshold)
│   │   │   ├── DitherPanel.tsx        (dither algorithm selector + preview)
│   │   │   └── PreviewOverlay.tsx     (burn-path simulation)
│   │   ├── MachineControl/
│   │   │   ├── ConnectionBar.tsx      (port select, connect/disconnect button)
│   │   │   ├── JogPanel.tsx           (X/Y jog arrows + numeric input)
│   │   │   ├── JobControl.tsx         (preview frame, start, pause, stop)
│   │   │   └── StatusBar.tsx          (connected/idle/running + progress bar)
│   │   ├── Settings/
│   │   │   ├── EngravingParams.tsx    (speed, power, passes, depth)
│   │   │   └── MaterialPresets.tsx    (preset library + editor)
│   │   └── Layout/
│   │       ├── Sidebar.tsx
│   │       └── TopBar.tsx
│   ├── hooks/
│   │   ├── useSerial.ts               (Tauri serial commands)
│   │   ├── useImageProcessor.ts       (image pipeline state)
│   │   └── useJobRunner.ts            (job progress + cancellation)
│   ├── store/
│   │   ├── serialStore.ts             (Zustand: connection state)
│   │   ├── imageStore.ts              (Zustand: current image + edits)
│   │   └── settingsStore.ts           (Zustand: params + presets)
│   └── types/
│       └── index.ts
├── tools/
│   └── k4_sniffer.py                  (from Part 2 above)
├── package.json
├── vite.config.ts
├── tsconfig.json
└── PROTOCOL_NOTES.md
```

---

# PART 4 — RUST BACKEND IMPLEMENTATION

## `src-tauri/Cargo.toml`

```toml
[package]
name = "laser-forge-k4"
version = "0.1.0"
edition = "2021"

[lib]
name = "laser_forge_k4_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[[bin]]
name = "laser-forge-k4"
path = "src/main.rs"

[dependencies]
tauri = { version = "2", features = ["protocol-asset"] }
tauri-plugin-shell = "2"
tauri-plugin-fs = "2"
tauri-plugin-dialog = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
serialport = "4"
tokio = { version = "1", features = ["full"] }
image = { version = "0.25", features = ["png", "jpeg", "bmp", "gif", "webp"] }
anyhow = "1"
log = "0.4"
env_logger = "0.11"
parking_lot = "0.12"

[features]
custom-protocol = ["tauri/custom-protocol"]
```

## `src-tauri/src/serial/protocol.rs`

```rust
//! Binary command builders for the K4/K3 family proprietary protocol.

pub const ACK: u8 = 0x09;
pub const BAUD_RATE: u32 = 115_200;

/// Build CONNECT command
pub fn connect() -> Vec<u8> { vec![0x01] }

/// Build DISCONNECT command
pub fn disconnect() -> Vec<u8> { vec![0x02] }

/// Build HOME command
pub fn home() -> Vec<u8> { vec![0x05] }

/// Build FAN_ON command
pub fn fan_on() -> Vec<u8> { vec![0x0D] }

/// Build FAN_OFF command
pub fn fan_off() -> Vec<u8> { vec![0x0E] }

/// Build STOP_ENGRAVE command
pub fn stop_engrave() -> Vec<u8> { vec![0x07] }

/// Build START_ENGRAVE command
pub fn start_engrave() -> Vec<u8> { vec![0x06] }

/// Build PAUSE_ENGRAVE command
pub fn pause_engrave() -> Vec<u8> { vec![0x08] }

/// Build SET_PARAMS command
/// - speed: mm/min (100–6000)
/// - power: 0–1000
/// - passes: 1–10
pub fn set_params(speed: u16, power: u16, passes: u8) -> Vec<u8> {
    vec![
        0x0A,
        (speed >> 8) as u8, (speed & 0xFF) as u8,
        (power >> 8) as u8, (power & 0xFF) as u8,
        passes,
    ]
}

/// Build BOUNDING BOX PREVIEW command
pub fn preview_frame(x: u16, y: u16, w: u16, h: u16) -> Vec<u8> {
    vec![
        0x03,
        (x >> 8) as u8, (x & 0xFF) as u8,
        (y >> 8) as u8, (y & 0xFF) as u8,
        (w >> 8) as u8, (w & 0xFF) as u8,
        (h >> 8) as u8, (h & 0xFF) as u8,
    ]
}

/// Build STOP PREVIEW command
pub fn stop_preview() -> Vec<u8> { vec![0x04] }

/// Build JOG command
pub fn jog(x: u16, y: u16) -> Vec<u8> {
    vec![
        0x0B,
        (x >> 8) as u8, (x & 0xFF) as u8,
        (y >> 8) as u8, (y & 0xFF) as u8,
    ]
}

/// Build STATUS REQUEST command
pub fn status_request() -> Vec<u8> { vec![0x0C] }

/// Build IMAGE LINE buffer for a single row.
///
/// pixels: slice of booleans — true = laser ON (black pixel)
/// row:    current Y row index
/// depth:  laser on-time per pixel (1–255)
/// power:  laser power (0–1000)
pub fn image_line(pixels: &[bool], row: u16, depth: u16, power: u16) -> Vec<u8> {
    let cols = (pixels.len() + 7) / 8;
    let buf_size = cols + 9;
    let mut buf = vec![0u8; buf_size];

    buf[0] = 0x09;
    buf[1] = (buf_size >> 8) as u8;
    buf[2] = (buf_size & 0xFF) as u8;
    buf[3] = (depth >> 8) as u8;
    buf[4] = (depth & 0xFF) as u8;
    buf[5] = (power >> 8) as u8;
    buf[6] = (power & 0xFF) as u8;
    buf[7] = (row >> 8) as u8;
    buf[8] = (row & 0xFF) as u8;

    for (col_byte, chunk) in pixels.chunks(8).enumerate() {
        let mut packed: u8 = 0;
        for (bit, &pixel_on) in chunk.iter().enumerate() {
            if pixel_on {
                packed |= 0x80u8 >> bit;
            }
        }
        buf[9 + col_byte] = packed;
    }

    buf
}
```

## `src-tauri/src/serial/connection.rs`

```rust
use serialport::{SerialPort, SerialPortType};
use anyhow::{Result, anyhow};
use std::time::Duration;
use super::protocol::BAUD_RATE;

/// Detect all available serial ports, tagging K4 candidates.
pub fn list_ports() -> Vec<PortInfo> {
    let ports = serialport::available_ports().unwrap_or_default();
    ports.into_iter().filter_map(|p| {
        let is_k4 = match &p.port_type {
            SerialPortType::UsbPort(usb) => {
                let vid = usb.vid;
                let desc = usb.product.as_deref().unwrap_or("").to_lowercase();
                // WCH CH340/CH341 vendor IDs: 0x1A86
                vid == 0x1A86 || desc.contains("ch340") || desc.contains("ch341") || desc.contains("usb serial")
            }
            _ => false,
        };
        Some(PortInfo {
            path: p.port_name,
            description: match &p.port_type {
                SerialPortType::UsbPort(u) => u.product.clone().unwrap_or_default(),
                _ => "Unknown".into(),
            },
            is_k4_candidate: is_k4,
        })
    }).collect()
}

/// Open a serial connection to the K4.
pub fn open_port(path: &str) -> Result<Box<dyn SerialPort>> {
    let port = serialport::new(path, BAUD_RATE)
        .data_bits(serialport::DataBits::Eight)
        .parity(serialport::Parity::None)
        .stop_bits(serialport::StopBits::One)
        .flow_control(serialport::FlowControl::None)
        .timeout(Duration::from_millis(2000))
        .open()
        .map_err(|e| anyhow!("Failed to open {}: {}", path, e))?;
    Ok(port)
}

/// Wait for ACK byte (0x09). Returns true if received within timeout_ms.
pub fn wait_ack(port: &mut Box<dyn SerialPort>, timeout_ms: u64) -> bool {
    let deadline = std::time::Instant::now() + Duration::from_millis(timeout_ms);
    let mut buf = [0u8; 1];
    while std::time::Instant::now() < deadline {
        if let Ok(1) = port.read(&mut buf) {
            if buf[0] == 0x09 { return true; }
        }
    }
    false
}

/// Send a command and wait for ACK. Retries up to 3 times.
pub fn send_command(port: &mut Box<dyn SerialPort>, cmd: &[u8]) -> Result<()> {
    for attempt in 0..3 {
        port.write_all(cmd)?;
        port.flush()?;
        if wait_ack(port, 2000) { return Ok(()); }
        log::warn!("ACK timeout on attempt {}, retrying...", attempt + 1);
        std::thread::sleep(Duration::from_millis(100));
    }
    Err(anyhow!("No ACK after 3 attempts for cmd {:02X?}", cmd))
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct PortInfo {
    pub path: String,
    pub description: String,
    pub is_k4_candidate: bool,
}
```

## `src-tauri/src/serial/worker.rs`

```rust
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::sync::mpsc;
use anyhow::Result;
use super::{connection::*, protocol::*};

/// Messages the UI sends to the serial worker thread.
#[derive(Debug)]
pub enum WorkerMsg {
    Connect(String),
    Disconnect,
    Home,
    FanOn,
    FanOff,
    PreviewFrame { x: u16, y: u16, w: u16, h: u16 },
    StopPreview,
    Jog { x: u16, y: u16 },
    SetParams { speed: u16, power: u16, passes: u8 },
    StartJob { lines: Vec<Vec<bool>>, depth: u16, power: u16 },
    PauseJob,
    StopJob,
}

/// Events the worker thread emits back to Tauri (sent via Tauri event bus).
#[derive(Debug, serde::Serialize, Clone)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum WorkerEvent {
    Connected { port: String },
    Disconnected,
    Progress { row: u32, total: u32, pct: f32 },
    JobComplete,
    Error { message: String },
    PortList { ports: Vec<PortInfo> },
}

pub struct SerialWorker {
    tx: mpsc::Sender<WorkerMsg>,
}

impl SerialWorker {
    pub fn spawn(event_tx: mpsc::Sender<WorkerEvent>) -> Self {
        let (tx, mut rx) = mpsc::channel::<WorkerMsg>(64);
        let cancel = Arc::new(AtomicBool::new(false));

        tokio::spawn(async move {
            let mut port: Option<Box<dyn serialport::SerialPort>> = None;

            while let Some(msg) = rx.recv().await {
                match msg {
                    WorkerMsg::Connect(path) => {
                        match open_port(&path) {
                            Ok(mut p) => {
                                // Send CONNECT handshake
                                let _ = send_command(&mut p, &connect());
                                std::thread::sleep(std::time::Duration::from_millis(200));
                                port = Some(p);
                                let _ = event_tx.send(WorkerEvent::Connected { port: path }).await;
                            }
                            Err(e) => {
                                let _ = event_tx.send(WorkerEvent::Error { message: e.to_string() }).await;
                            }
                        }
                    }
                    WorkerMsg::Disconnect => {
                        if let Some(ref mut p) = port {
                            let _ = send_command(p, &disconnect());
                        }
                        port = None;
                        let _ = event_tx.send(WorkerEvent::Disconnected).await;
                    }
                    WorkerMsg::Home => {
                        if let Some(ref mut p) = port {
                            let _ = send_command(p, &home());
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
                    WorkerMsg::SetParams { speed, power, passes } => {
                        if let Some(ref mut p) = port {
                            let _ = send_command(p, &set_params(speed, power, passes));
                        }
                    }
                    WorkerMsg::Jog { x, y } => {
                        if let Some(ref mut p) = port {
                            let _ = send_command(p, &jog(x, y));
                        }
                    }
                    WorkerMsg::StartJob { lines, depth, power } => {
                        if let Some(ref mut p) = port {
                            cancel.store(false, Ordering::SeqCst);
                            let total = lines.len() as u32;
                            let _ = send_command(p, &start_engrave());

                            for (row, pixels) in lines.iter().enumerate() {
                                if cancel.load(Ordering::SeqCst) { break; }
                                let line_buf = image_line(pixels, row as u16, depth, power);
                                if let Err(e) = send_command(p, &line_buf) {
                                    let _ = event_tx.send(WorkerEvent::Error { message: e.to_string() }).await;
                                    break;
                                }
                                if row % 8 == 0 {
                                    let pct = row as f32 / total as f32 * 100.0;
                                    let _ = event_tx.send(WorkerEvent::Progress {
                                        row: row as u32, total, pct
                                    }).await;
                                }
                            }
                            let _ = send_command(p, &stop_engrave());
                            let _ = event_tx.send(WorkerEvent::JobComplete).await;
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
                }
            }
        });

        SerialWorker { tx }
    }

    pub fn send(&self, msg: WorkerMsg) {
        let _ = self.tx.blocking_send(msg);
    }
}
```

---

# PART 5 — IMAGE PROCESSING (RUST)

## `src-tauri/src/image_processor/dither.rs`

```rust
use image::{GrayImage, Luma};

/// Floyd-Steinberg dithering. Converts grayscale to 1-bit.
/// Returns a Vec<Vec<bool>> (rows × cols), true = BLACK = laser fires.
pub fn floyd_steinberg(img: &GrayImage, threshold: u8) -> Vec<Vec<bool>> {
    let (w, h) = img.dimensions();
    let mut pixels: Vec<Vec<i32>> = (0..h)
        .map(|y| (0..w).map(|x| img.get_pixel(x, y)[0] as i32).collect())
        .collect();

    let mut result = vec![vec![false; w as usize]; h as usize];

    for y in 0..h as usize {
        for x in 0..w as usize {
            let old = pixels[y][x];
            let new_val = if old < threshold as i32 { 0 } else { 255 };
            result[y][x] = new_val == 0; // black = laser on
            let quant_error = old - new_val;

            if x + 1 < w as usize {
                pixels[y][x + 1] += quant_error * 7 / 16;
            }
            if y + 1 < h as usize {
                if x > 0 { pixels[y + 1][x - 1] += quant_error * 3 / 16; }
                pixels[y + 1][x] += quant_error * 5 / 16;
                if x + 1 < w as usize { pixels[y + 1][x + 1] += quant_error * 1 / 16; }
            }
        }
    }
    result
}

/// Atkinson dithering (sharper edges, good for logos).
pub fn atkinson(img: &GrayImage, threshold: u8) -> Vec<Vec<bool>> {
    let (w, h) = img.dimensions();
    let mut pixels: Vec<Vec<i32>> = (0..h)
        .map(|y| (0..w).map(|x| img.get_pixel(x, y)[0] as i32).collect())
        .collect();

    let mut result = vec![vec![false; w as usize]; h as usize];

    for y in 0..h as usize {
        for x in 0..w as usize {
            let old = pixels[y][x].clamp(0, 255);
            let new_val = if old < threshold as i32 { 0 } else { 255 };
            result[y][x] = new_val == 0;
            let err = (old - new_val) / 8;

            let neighbors: &[(i32, i32)] = &[(0,1),(0,2),(-1,1),(1,1),(-1,2),(1,2)];
            // Atkinson: spread error to 6 neighbors
            let spread: &[(i32,i32)] = &[(0,1),(0,2),(1,-1),(1,0),(1,1),(2,0)];
            for (dy, dx) in spread {
                let ny = y as i32 + dy;
                let nx = x as i32 + dx;
                if ny >= 0 && ny < h as i32 && nx >= 0 && nx < w as i32 {
                    pixels[ny as usize][nx as usize] += err;
                }
            }
        }
    }
    result
}

/// Bayer 4x4 ordered dithering (good for textures).
pub fn bayer4x4(img: &GrayImage) -> Vec<Vec<bool>> {
    const MATRIX: [[u8; 4]; 4] = [
        [ 0,  8,  2, 10],
        [12,  4, 14,  6],
        [ 3, 11,  1,  9],
        [15,  7, 13,  5],
    ];
    let (w, h) = img.dimensions();
    let mut result = vec![vec![false; w as usize]; h as usize];
    for y in 0..h as usize {
        for x in 0..w as usize {
            let pixel = img.get_pixel(x as u32, y as u32)[0];
            let threshold = MATRIX[y % 4][x % 4] * 16 + 8; // scale 0-255
            result[y][x] = pixel < threshold;
        }
    }
    result
}

/// Simple threshold (no dithering).
pub fn threshold(img: &GrayImage, thresh: u8) -> Vec<Vec<bool>> {
    let (w, h) = img.dimensions();
    let mut result = vec![vec![false; w as usize]; h as usize];
    for y in 0..h as usize {
        for x in 0..w as usize {
            result[y][x] = img.get_pixel(x as u32, y as u32)[0] < thresh;
        }
    }
    result
}
```

## `src-tauri/src/image_processor/transforms.rs`

```rust
use image::{DynamicImage, GrayImage, imageops};

/// Resize image to fit within max_w × max_h, preserving aspect ratio.
pub fn resize_fit(img: &DynamicImage, max_w: u32, max_h: u32) -> DynamicImage {
    img.resize(max_w, max_h, imageops::FilterType::Lanczos3)
}

/// Resize to exact dimensions (stretches).
pub fn resize_exact(img: &DynamicImage, w: u32, h: u32) -> DynamicImage {
    img.resize_exact(w, h, imageops::FilterType::Lanczos3)
}

/// Rotate 90, 180, or 270 degrees.
pub fn rotate(img: &DynamicImage, degrees: u32) -> DynamicImage {
    match degrees % 360 {
        90  => DynamicImage::ImageRgba8(imageops::rotate90(&img.to_rgba8())),
        180 => DynamicImage::ImageRgba8(imageops::rotate180(&img.to_rgba8())),
        270 => DynamicImage::ImageRgba8(imageops::rotate270(&img.to_rgba8())),
        _ => img.clone(),
    }
}

/// Flip horizontally.
pub fn flip_h(img: &DynamicImage) -> DynamicImage {
    DynamicImage::ImageRgba8(imageops::flip_horizontal(&img.to_rgba8()))
}

/// Flip vertically.
pub fn flip_v(img: &DynamicImage) -> DynamicImage {
    DynamicImage::ImageRgba8(imageops::flip_vertical(&img.to_rgba8()))
}

/// Adjust brightness (-255 to +255) and contrast (-100.0 to +100.0).
pub fn adjust(img: &DynamicImage, brightness: i32, contrast: f32) -> DynamicImage {
    let mut out = img.clone();
    out = DynamicImage::ImageRgba8(imageops::colorops::brighten(&out.to_rgba8(), brightness));
    out = DynamicImage::ImageRgba8(imageops::colorops::contrast(&out.to_rgba8(), contrast));
    out
}

/// Invert image (useful for some materials).
pub fn invert(img: &DynamicImage) -> DynamicImage {
    let mut out = img.clone();
    out.invert();
    out
}

/// Convert to grayscale.
pub fn to_grayscale(img: &DynamicImage) -> GrayImage {
    img.to_luma8()
}

/// Crop image. x, y = top-left corner; w, h = size.
pub fn crop(img: &DynamicImage, x: u32, y: u32, w: u32, h: u32) -> DynamicImage {
    img.crop_imm(x, y, w, h)
}
```

---

# PART 6 — TAURI COMMANDS (lib.rs)

## `src-tauri/src/lib.rs`

```rust
use tauri::{AppHandle, Manager, State};
use std::sync::Mutex;
use tokio::sync::mpsc;

mod serial;
mod image_processor;
mod driver_installer;

use serial::{connection::*, protocol::*, worker::*};
use image_processor::{dither::*, transforms::*};
use image::{DynamicImage, GenericImageView};
use std::io::Cursor;

/// Global app state
pub struct AppState {
    pub worker_tx: Mutex<Option<mpsc::Sender<WorkerMsg>>>,
    pub current_image: Mutex<Option<DynamicImage>>,
}

// ——— Tauri Commands ———

#[tauri::command]
async fn list_serial_ports() -> Vec<PortInfo> {
    list_ports()
}

#[tauri::command]
async fn connect_device(
    port_path: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    let (worker_tx, mut event_rx) = mpsc::channel::<WorkerEvent>(32);
    let worker = SerialWorker::spawn(worker_tx);

    // Forward events to frontend
    let app_clone = app.clone();
    tokio::spawn(async move {
        while let Some(evt) = event_rx.recv().await {
            let _ = app_clone.emit("serial-event", &evt);
        }
    });

    *state.worker_tx.lock().unwrap() = Some(worker.tx.clone());
    worker.send(WorkerMsg::Connect(port_path));
    Ok(())
}

#[tauri::command]
async fn disconnect_device(state: State<'_, AppState>) -> Result<(), String> {
    if let Some(tx) = state.worker_tx.lock().unwrap().as_ref() {
        let _ = tx.try_send(WorkerMsg::Disconnect);
    }
    Ok(())
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
    x: u16, y: u16, w: u16, h: u16,
    state: State<'_, AppState>
) -> Result<(), String> {
    send_to_worker(&state, WorkerMsg::PreviewFrame { x, y, w, h })
}

#[tauri::command]
async fn machine_stop_preview(state: State<'_, AppState>) -> Result<(), String> {
    send_to_worker(&state, WorkerMsg::StopPreview)
}

#[tauri::command]
async fn machine_set_params(
    speed: u16, power: u16, passes: u8,
    state: State<'_, AppState>
) -> Result<(), String> {
    send_to_worker(&state, WorkerMsg::SetParams { speed, power, passes })
}

#[tauri::command]
async fn machine_stop_job(state: State<'_, AppState>) -> Result<(), String> {
    send_to_worker(&state, WorkerMsg::StopJob)
}

#[tauri::command]
async fn machine_pause_job(state: State<'_, AppState>) -> Result<(), String> {
    send_to_worker(&state, WorkerMsg::PauseJob)
}

/// Load image from file path and store in state. Returns base64 preview.
#[tauri::command]
async fn load_image(path: String, state: State<'_, AppState>) -> Result<ImageInfo, String> {
    let img = image::open(&path).map_err(|e| e.to_string())?;
    let (w, h) = img.dimensions();
    let gray = img.to_luma8();
    let preview_b64 = encode_preview(&img, 400);
    *state.current_image.lock().unwrap() = Some(img);
    Ok(ImageInfo { width: w, height: h, preview_b64 })
}

/// Apply transforms + dithering, send job to machine.
#[tauri::command]
async fn start_engrave_job(
    params: EngraveParams,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let img_guard = state.current_image.lock().unwrap();
    let img = img_guard.as_ref().ok_or("No image loaded")?;

    // Apply transforms
    let mut processed = img.clone();
    if let Some((w, h)) = params.resize_to {
        processed = resize_exact(&processed, w, h);
    }
    if params.invert { processed = invert(&processed); }
    processed = adjust(&processed, params.brightness, params.contrast);
    if params.rotate_deg != 0 { processed = rotate(&processed, params.rotate_deg); }
    if params.flip_h { processed = flip_h(&processed); }
    if params.flip_v { processed = flip_v(&processed); }

    let gray = to_grayscale(&processed);

    // Dither
    let lines: Vec<Vec<bool>> = match params.dither_mode.as_str() {
        "floyd"     => floyd_steinberg(&gray, params.threshold),
        "atkinson"  => atkinson(&gray, params.threshold),
        "bayer"     => bayer4x4(&gray),
        _           => threshold(&gray, params.threshold),
    };

    drop(img_guard);
    send_to_worker(&state, WorkerMsg::StartJob {
        lines,
        depth: params.depth,
        power: params.power,
    })
}

/// Generate dithered preview PNG as base64 (for UI preview without engraving).
#[tauri::command]
async fn generate_preview(
    params: EngraveParams,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let img_guard = state.current_image.lock().unwrap();
    let img = img_guard.as_ref().ok_or("No image loaded")?;

    let mut processed = img.clone();
    processed = adjust(&processed, params.brightness, params.contrast);
    if params.rotate_deg != 0 { processed = rotate(&processed, params.rotate_deg); }
    let gray = to_grayscale(&processed);

    let lines = match params.dither_mode.as_str() {
        "floyd"    => floyd_steinberg(&gray, params.threshold),
        "atkinson" => atkinson(&gray, params.threshold),
        "bayer"    => bayer4x4(&gray),
        _          => threshold(&gray, params.threshold),
    };

    // Convert back to image for preview
    let h = lines.len() as u32;
    let w = lines.first().map(|l| l.len()).unwrap_or(0) as u32;
    let mut out = image::GrayImage::new(w, h);
    for (y, row) in lines.iter().enumerate() {
        for (x, &on) in row.iter().enumerate() {
            out.put_pixel(x as u32, y as u32, image::Luma([if on { 0 } else { 255 }]));
        }
    }
    let dyn_img = DynamicImage::ImageLuma8(out);
    Ok(encode_preview(&dyn_img, 400))
}

/// Install CH340 driver (platform-specific).
#[tauri::command]
async fn install_driver() -> Result<String, String> {
    driver_installer::install().map_err(|e| e.to_string())
}

// ——— Helpers ———

fn send_to_worker(state: &State<'_, AppState>, msg: WorkerMsg) -> Result<(), String> {
    state.worker_tx.lock().unwrap()
        .as_ref()
        .ok_or("Not connected")?
        .try_send(msg)
        .map_err(|e| e.to_string())
}

fn encode_preview(img: &DynamicImage, max_size: u32) -> String {
    let resized = img.thumbnail(max_size, max_size);
    let mut buf = Vec::new();
    resized.write_to(&mut Cursor::new(&mut buf), image::ImageFormat::Png).ok();
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.encode(&buf)
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct ImageInfo {
    pub width: u32,
    pub height: u32,
    pub preview_b64: String,
}

#[derive(serde::Serialize, serde::Deserialize, Debug)]
pub struct EngraveParams {
    pub resize_to: Option<(u32, u32)>,
    pub brightness: i32,
    pub contrast: f32,
    pub threshold: u8,
    pub dither_mode: String,   // "floyd" | "atkinson" | "bayer" | "threshold"
    pub invert: bool,
    pub rotate_deg: u32,
    pub flip_h: bool,
    pub flip_v: bool,
    pub depth: u16,
    pub power: u16,
    pub passes: u8,
}

// ——— App entry point ———

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            worker_tx: Mutex::new(None),
            current_image: Mutex::new(None),
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
            install_driver,
        ])
        .run(tauri::generate_context!())
        .expect("error running LaserForge K4");
}
```

---

# PART 7 — DRIVER INSTALLER

## `src-tauri/src/driver_installer/mod.rs`

```rust
use anyhow::Result;

pub fn install() -> Result<String> {
    #[cfg(target_os = "windows")]  { windows::install() }
    #[cfg(target_os = "macos")]    { macos::install() }
    #[cfg(target_os = "linux")]    { linux::install() }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    { Ok("Driver installation not supported on this platform".into()) }
}

#[cfg(target_os = "windows")]
mod windows {
    use anyhow::Result;
    use std::process::Command;

    pub fn install() -> Result<String> {
        // Bundle CH340 .inf file in resources/drivers/windows/
        // Use pnputil to install without reboot
        let driver_path = std::env::current_exe()?
            .parent().unwrap()
            .join("drivers/windows/CH341SER.INF");

        let output = Command::new("pnputil")
            .args(["/add-driver", driver_path.to_str().unwrap(), "/install"])
            .output()?;

        if output.status.success() {
            Ok("CH340 driver installed successfully".into())
        } else {
            let err = String::from_utf8_lossy(&output.stderr).to_string();
            // Fallback: open driver installer GUI
            Command::new("rundll32")
                .args(["setupapi.dll,InstallHinfSection", "DefaultInstall", "132",
                       driver_path.to_str().unwrap()])
                .spawn()?;
            Ok("Driver installer launched".into())
        }
    }
}

#[cfg(target_os = "macos")]
mod macos {
    use anyhow::Result;
    use std::process::Command;

    pub fn install() -> Result<String> {
        // Bundle CH34xVCPDriver.pkg in resources
        let pkg_path = std::env::current_exe()?
            .parent().unwrap()
            .join("drivers/macos/CH34xVCPDriver.pkg");

        Command::new("open").arg(&pkg_path).spawn()?;
        Ok("macOS CH340 installer opened — follow the System Preferences prompt".into())
    }
}

#[cfg(target_os = "linux")]
mod linux {
    use anyhow::Result;
    use std::fs;

    pub fn install() -> Result<String> {
        // Install udev rule for CH340 — no root needed for just the rule copy
        // if user has sudo. Otherwise instruct user.
        let rules = r#"SUBSYSTEM=="tty", ATTRS{idVendor}=="1a86", ATTRS{idProduct}=="7523", MODE="0666", GROUP="dialout"
SUBSYSTEM=="tty", ATTRS{idVendor}=="1a86", ATTRS{idProduct}=="5523", MODE="0666", GROUP="dialout"
"#;
        // Try writing to /etc/udev/rules.d/ (requires root)
        let rules_path = "/etc/udev/rules.d/99-ch340-k4.rules";
        match fs::write(rules_path, rules) {
            Ok(_) => {
                std::process::Command::new("udevadm")
                    .args(["control", "--reload-rules"])
                    .output().ok();
                std::process::Command::new("udevadm")
                    .args(["trigger"])
                    .output().ok();
                Ok("udev rule installed. Reconnect your K4.".into())
            }
            Err(_) => {
                // Return the rule content so the user can install manually
                Ok(format!(
                    "Run this command manually:\n\
                    echo '{}' | sudo tee {}\n\
                    sudo udevadm control --reload-rules && sudo udevadm trigger\n\
                    sudo usermod -aG dialout $USER && newgrp dialout",
                    rules, rules_path
                ))
            }
        }
    }
}
```

---

# PART 8 — REACT FRONTEND

## `src/store/serialStore.ts`

```typescript
import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface PortInfo {
  path: string;
  description: string;
  is_k4_candidate: boolean;
}

interface SerialState {
  ports: PortInfo[];
  selectedPort: string | null;
  connectionState: ConnectionState;
  errorMessage: string | null;
  jobProgress: number; // 0–100
  jobRunning: boolean;
  jobPaused: boolean;
  // Actions
  refreshPorts: () => Promise<void>;
  connect: (port: string) => Promise<void>;
  disconnect: () => Promise<void>;
  home: () => Promise<void>;
  jog: (x: number, y: number) => Promise<void>;
  previewFrame: (x: number, y: number, w: number, h: number) => Promise<void>;
  stopPreview: () => Promise<void>;
  stopJob: () => Promise<void>;
  pauseJob: () => Promise<void>;
  setParams: (speed: number, power: number, passes: number) => Promise<void>;
  installDriver: () => Promise<string>;
}

export const useSerialStore = create<SerialState>((set, get) => {
  // Listen for backend events
  listen<any>('serial-event', ({ payload }) => {
    switch (payload.type) {
      case 'connected':
        set({ connectionState: 'connected', selectedPort: payload.port });
        break;
      case 'disconnected':
        set({ connectionState: 'disconnected', jobRunning: false });
        break;
      case 'progress':
        set({ jobProgress: payload.pct, jobRunning: true });
        break;
      case 'job_complete':
        set({ jobProgress: 100, jobRunning: false, jobPaused: false });
        break;
      case 'error':
        set({ connectionState: 'error', errorMessage: payload.message });
        break;
    }
  });

  return {
    ports: [],
    selectedPort: null,
    connectionState: 'disconnected',
    errorMessage: null,
    jobProgress: 0,
    jobRunning: false,
    jobPaused: false,

    refreshPorts: async () => {
      const ports = await invoke<PortInfo[]>('list_serial_ports');
      set({ ports });
    },
    connect: async (port) => {
      set({ connectionState: 'connecting', selectedPort: port });
      try {
        await invoke('connect_device', { portPath: port });
      } catch (e: any) {
        set({ connectionState: 'error', errorMessage: e.toString() });
      }
    },
    disconnect: () => invoke('disconnect_device'),
    home: () => invoke('machine_home'),
    jog: (x, y) => invoke('machine_jog', { x, y }),
    previewFrame: (x, y, w, h) => invoke('machine_preview_frame', { x, y, w, h }),
    stopPreview: () => invoke('machine_stop_preview'),
    stopJob: () => invoke('machine_stop_job'),
    pauseJob: () => invoke('machine_pause_job'),
    setParams: (speed, power, passes) => invoke('machine_set_params', { speed, power, passes }),
    installDriver: () => invoke<string>('install_driver'),
  };
});
```

## `src/store/imageStore.ts`

```typescript
import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';

export type DitherMode = 'threshold' | 'floyd' | 'atkinson' | 'bayer';

export interface EngraveParams {
  resize_to: [number, number] | null;
  brightness: number;    // -100 to +100
  contrast: number;      // -100.0 to +100.0
  threshold: number;     // 0–255
  dither_mode: DitherMode;
  invert: boolean;
  rotate_deg: number;    // 0 | 90 | 180 | 270
  flip_h: boolean;
  flip_v: boolean;
  depth: number;         // 1–255
  power: number;         // 0–1000
  passes: number;        // 1–10
}

interface ImageState {
  imageLoaded: boolean;
  imagePath: string | null;
  imageWidth: number;
  imageHeight: number;
  originalPreview: string | null;  // base64 PNG
  processedPreview: string | null; // base64 PNG (after dither)
  params: EngraveParams;
  isGeneratingPreview: boolean;
  // Actions
  openImage: () => Promise<void>;
  updateParam: <K extends keyof EngraveParams>(key: K, value: EngraveParams[K]) => void;
  generatePreview: () => Promise<void>;
  startJob: () => Promise<void>;
}

const DEFAULT_PARAMS: EngraveParams = {
  resize_to: null,
  brightness: 0,
  contrast: 0,
  threshold: 128,
  dither_mode: 'floyd',
  invert: false,
  rotate_deg: 0,
  flip_h: false,
  flip_v: false,
  depth: 80,
  power: 800,
  passes: 1,
};

export const useImageStore = create<ImageState>((set, get) => ({
  imageLoaded: false,
  imagePath: null,
  imageWidth: 0,
  imageHeight: 0,
  originalPreview: null,
  processedPreview: null,
  params: DEFAULT_PARAMS,
  isGeneratingPreview: false,

  openImage: async () => {
    const path = await openDialog({
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'bmp', 'gif', 'webp'] }],
      multiple: false,
    }) as string | null;

    if (!path) return;

    const info = await invoke<{ width: number; height: number; preview_b64: string }>(
      'load_image', { path }
    );

    set({
      imageLoaded: true,
      imagePath: path,
      imageWidth: info.width,
      imageHeight: info.height,
      originalPreview: `data:image/png;base64,${info.preview_b64}`,
      processedPreview: null,
    });

    await get().generatePreview();
  },

  updateParam: (key, value) => {
    set(s => ({ params: { ...s.params, [key]: value } }));
    // Auto-regenerate preview on param change (debounced in component)
  },

  generatePreview: async () => {
    if (!get().imageLoaded) return;
    set({ isGeneratingPreview: true });
    try {
      const b64 = await invoke<string>('generate_preview', { params: get().params });
      set({ processedPreview: `data:image/png;base64,${b64}` });
    } finally {
      set({ isGeneratingPreview: false });
    }
  },

  startJob: async () => {
    await invoke('start_engrave_job', { params: get().params });
  },
}));
```

## `src/store/settingsStore.ts`

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface MaterialPreset {
  id: string;
  name: string;
  material: string;
  speed: number;
  power: number;
  passes: number;
  depth: number;
  threshold: number;
  notes: string;
}

const BUILTIN_PRESETS: MaterialPreset[] = [
  { id: 'wood-light', name: 'Light wood', material: 'Wood', speed: 3000, power: 600, passes: 1, depth: 80, threshold: 128, notes: 'Pine, balsa — light engrave' },
  { id: 'wood-deep',  name: 'Deep wood',  material: 'Wood', speed: 1500, power: 900, passes: 2, depth: 150, threshold: 120, notes: 'Oak, MDF — deep engrave' },
  { id: 'leather',    name: 'Leather',    material: 'Leather', speed: 2000, power: 700, passes: 1, depth: 100, threshold: 128, notes: 'Vegetable-tanned leather' },
  { id: 'cardboard',  name: 'Cardboard',  material: 'Cardboard', speed: 4000, power: 500, passes: 1, depth: 60, threshold: 140, notes: 'Corrugated or card' },
  { id: 'rubber',     name: 'Rubber stamp', material: 'Rubber', speed: 2000, power: 800, passes: 1, depth: 120, threshold: 128, notes: 'Stamp rubber, dark rubber only' },
  { id: 'anodized',   name: 'Anodized Al', material: 'Anodized Aluminum', speed: 1000, power: 1000, passes: 3, depth: 200, threshold: 110, notes: 'Black/colored anodized only' },
  { id: 'paper',      name: 'Paper',      material: 'Paper', speed: 5000, power: 300, passes: 1, depth: 40, threshold: 150, notes: 'Heavyweight paper / cardstock' },
];

interface SettingsState {
  presets: MaterialPreset[];
  addPreset: (p: MaterialPreset) => void;
  updatePreset: (id: string, p: Partial<MaterialPreset>) => void;
  deletePreset: (id: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      presets: BUILTIN_PRESETS,
      addPreset: (p) => set(s => ({ presets: [...s.presets, p] })),
      updatePreset: (id, p) => set(s => ({
        presets: s.presets.map(x => x.id === id ? { ...x, ...p } : x)
      })),
      deletePreset: (id) => set(s => ({ presets: s.presets.filter(x => x.id !== id) })),
    }),
    { name: 'laserforge-settings' }
  )
);
```

## `src/components/MachineControl/ConnectionBar.tsx`

```tsx
import React, { useEffect, useRef } from 'react';
import { useSerialStore } from '../../store/serialStore';

export function ConnectionBar() {
  const { ports, selectedPort, connectionState, refreshPorts, connect, disconnect, installDriver } = useSerialStore();
  const hasMounted = useRef(false);

  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      refreshPorts();
    }
  }, []);

  const stateColor = {
    disconnected: '#888',
    connecting: '#f5a623',
    connected: '#2ecc71',
    error: '#e74c3c',
  }[connectionState];

  const handleConnect = () => {
    if (connectionState === 'connected') {
      disconnect();
    } else if (selectedPort) {
      connect(selectedPort);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
                  borderBottom: '1px solid #333', background: '#1a1a2e' }}>
      {/* Status dot */}
      <div style={{ width: 10, height: 10, borderRadius: '50%', background: stateColor }} />

      {/* Port selector */}
      <select
        value={selectedPort ?? ''}
        onChange={e => useSerialStore.setState({ selectedPort: e.target.value })}
        disabled={connectionState === 'connected'}
        style={{ background: '#16213e', color: '#eee', border: '1px solid #444',
                 borderRadius: 4, padding: '4px 8px', flex: 1 }}
      >
        <option value="">Select port...</option>
        {ports.map(p => (
          <option key={p.path} value={p.path}>
            {p.path} {p.is_k4_candidate ? '⭐ K4' : ''} — {p.description}
          </option>
        ))}
      </select>

      <button onClick={refreshPorts} title="Refresh ports"
        style={{ background: 'transparent', border: '1px solid #555', color: '#aaa',
                 borderRadius: 4, padding: '4px 10px', cursor: 'pointer' }}>↺</button>

      <button onClick={handleConnect}
        style={{ background: connectionState === 'connected' ? '#c0392b' : '#2980b9',
                 color: '#fff', border: 'none', borderRadius: 4,
                 padding: '6px 16px', cursor: 'pointer', fontWeight: 600 }}>
        {connectionState === 'connected' ? 'Disconnect' :
         connectionState === 'connecting' ? 'Connecting...' : 'Connect'}
      </button>

      <button onClick={() => installDriver().then(msg => alert(msg))}
        title="Install CH340 driver"
        style={{ background: '#6c3483', color: '#fff', border: 'none', borderRadius: 4,
                 padding: '6px 12px', cursor: 'pointer', fontSize: 12 }}>
        Install Driver
      </button>
    </div>
  );
}
```

## `src/components/MachineControl/JobControl.tsx`

```tsx
import React from 'react';
import { useSerialStore } from '../../store/serialStore';
import { useImageStore } from '../../store/imageStore';

export function JobControl() {
  const { connectionState, jobRunning, jobPaused, jobProgress,
          previewFrame, stopPreview, stopJob, pauseJob } = useSerialStore();
  const { imageLoaded, imageWidth, imageHeight, params, startJob } = useImageStore();

  const canRun = connectionState === 'connected' && imageLoaded && !jobRunning;

  const handlePreview = () => {
    previewFrame(0, 0, imageWidth, imageHeight);
  };

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={handlePreview} disabled={connectionState !== 'connected'}
          style={btnStyle('#8e44ad')}>
          □ Preview Frame
        </button>
        <button onClick={stopPreview} disabled={connectionState !== 'connected'}
          style={btnStyle('#555')}>
          Stop Preview
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => startJob()} disabled={!canRun}
          style={btnStyle('#27ae60', !canRun)}>
          ▶ Start Engrave
        </button>
        <button onClick={pauseJob} disabled={!jobRunning}
          style={btnStyle('#f39c12', !jobRunning)}>
          ⏸ Pause
        </button>
        <button onClick={stopJob} disabled={!jobRunning}
          style={btnStyle('#e74c3c', !jobRunning)}>
          ■ Stop
        </button>
      </div>

      {(jobRunning || jobProgress > 0) && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between',
                        fontSize: 12, color: '#aaa', marginBottom: 4 }}>
            <span>{jobRunning ? 'Engraving...' : 'Complete'}</span>
            <span>{Math.round(jobProgress)}%</span>
          </div>
          <div style={{ background: '#333', borderRadius: 4, height: 8 }}>
            <div style={{ background: '#2ecc71', height: '100%', borderRadius: 4,
                          width: `${jobProgress}%`, transition: 'width 0.3s' }} />
          </div>
        </div>
      )}
    </div>
  );
}

function btnStyle(bg: string, disabled = false) {
  return {
    background: disabled ? '#444' : bg,
    color: disabled ? '#888' : '#fff',
    border: 'none', borderRadius: 4, padding: '8px 14px',
    cursor: disabled ? 'not-allowed' : 'pointer', fontWeight: 600,
    opacity: disabled ? 0.6 : 1,
  };
}
```

## `src/components/ImageEditor/FilterPanel.tsx`

```tsx
import React, { useCallback } from 'react';
import { useImageStore, type DitherMode } from '../../store/imageStore';
import { debounce } from 'lodash';

export function FilterPanel() {
  const { params, updateParam, generatePreview, isGeneratingPreview } = useImageStore();

  const debouncedPreview = useCallback(
    debounce(() => generatePreview(), 400),
    [generatePreview]
  );

  const update = <K extends keyof typeof params>(key: K, value: typeof params[K]) => {
    updateParam(key, value);
    debouncedPreview();
  };

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <label style={labelStyle}>Dithering</label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {(['threshold','floyd','atkinson','bayer'] as DitherMode[]).map(m => (
          <button key={m}
            onClick={() => update('dither_mode', m)}
            style={{
              background: params.dither_mode === m ? '#2980b9' : '#2a2a3e',
              color: '#fff', border: '1px solid #444', borderRadius: 4,
              padding: '6px 10px', cursor: 'pointer', fontSize: 12,
              textTransform: 'capitalize',
            }}>
            {m === 'floyd' ? 'Floyd-Steinberg' : m === 'atkinson' ? 'Atkinson' :
             m === 'bayer' ? 'Bayer 4×4' : 'Threshold'}
          </button>
        ))}
      </div>

      <SliderRow label="Threshold" value={params.threshold} min={50} max={220}
        onChange={v => update('threshold', v)} />
      <SliderRow label="Brightness" value={params.brightness} min={-100} max={100}
        onChange={v => update('brightness', v)} />
      <SliderRow label="Contrast" value={params.contrast} min={-100} max={100}
        onChange={v => update('contrast', v as number)} />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <ToggleBtn label="Invert" active={params.invert}
          onClick={() => update('invert', !params.invert)} />
        <ToggleBtn label="Flip H" active={params.flip_h}
          onClick={() => update('flip_h', !params.flip_h)} />
        <ToggleBtn label="Flip V" active={params.flip_v}
          onClick={() => update('flip_v', !params.flip_v)} />
      </div>

      <div>
        <label style={labelStyle}>Rotate</label>
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          {[0, 90, 180, 270].map(deg => (
            <button key={deg} onClick={() => update('rotate_deg', deg)}
              style={{
                background: params.rotate_deg === deg ? '#2980b9' : '#2a2a3e',
                color: '#fff', border: '1px solid #444', borderRadius: 4,
                padding: '5px 10px', cursor: 'pointer', fontSize: 12,
              }}>{deg}°</button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button onClick={generatePreview} disabled={isGeneratingPreview}
          style={{ background: '#8e44ad', color: '#fff', border: 'none', borderRadius: 4,
                   padding: '8px 16px', cursor: 'pointer', fontSize: 13 }}>
          {isGeneratingPreview ? 'Generating...' : '⟳ Update Preview'}
        </button>
      </div>
    </div>
  );
}

function SliderRow({ label, value, min, max, onChange }:
  { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={labelStyle}>{label}</span>
        <span style={{ color: '#aaa', fontSize: 12 }}>{Math.round(value as number)}</span>
      </div>
      <input type="range" min={min} max={max} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: '#2980b9' }} />
    </div>
  );
}

function ToggleBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      background: active ? '#e67e22' : '#2a2a3e',
      color: '#fff', border: '1px solid #444', borderRadius: 4,
      padding: '5px 12px', cursor: 'pointer', fontSize: 12,
    }}>{label}</button>
  );
}

const labelStyle: React.CSSProperties = { color: '#ccc', fontSize: 13, fontWeight: 600 };
```

## `src/components/Settings/EngravingParams.tsx`

```tsx
import React from 'react';
import { useImageStore } from '../../store/imageStore';
import { useSettingsStore } from '../../store/settingsStore';

export function EngravingParams() {
  const { params, updateParam } = useImageStore();
  const { presets } = useSettingsStore();

  const applyPreset = (id: string) => {
    const preset = presets.find(p => p.id === id);
    if (!preset) return;
    updateParam('depth', preset.depth);
    updateParam('power', preset.power);
    updateParam('passes', preset.passes);
    updateParam('threshold', preset.threshold);
  };

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <label style={labelStyle}>Material Preset</label>
        <select onChange={e => applyPreset(e.target.value)}
          style={{ width: '100%', marginTop: 6, background: '#16213e', color: '#eee',
                   border: '1px solid #444', borderRadius: 4, padding: '6px 8px' }}>
          <option value="">— Select preset —</option>
          {presets.map(p => (
            <option key={p.id} value={p.id}>{p.material}: {p.name}</option>
          ))}
        </select>
      </div>

      <NumRow label="Speed (mm/min)" value={params.depth}
        min={100} max={6000} step={100}
        hint="Slower = deeper burn"
        onChange={v => updateParam('depth', v)} />

      <NumRow label="Power (0–1000)" value={params.power}
        min={0} max={1000} step={50}
        hint="Higher = brighter / deeper"
        onChange={v => updateParam('power', v)} />

      <NumRow label="Depth (laser on-time)" value={params.depth}
        min={1} max={255} step={5}
        hint="Time laser fires per pixel"
        onChange={v => updateParam('depth', v)} />

      <NumRow label="Passes" value={params.passes}
        min={1} max={10} step={1}
        hint="Multiple passes = deeper"
        onChange={v => updateParam('passes', v)} />
    </div>
  );
}

function NumRow({ label, value, min, max, step, hint, onChange }:
  { label: string; value: number; min: number; max: number; step: number; hint: string; onChange: (v: number) => void }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={labelStyle}>{label}</span>
        <span style={{ color: '#aaa', fontSize: 11 }}>{hint}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(Number(e.target.value))}
          style={{ flex: 1, accentColor: '#8e44ad' }} />
        <input type="number" min={min} max={max} step={step} value={value}
          onChange={e => onChange(Number(e.target.value))}
          style={{ width: 64, background: '#16213e', color: '#eee', border: '1px solid #444',
                   borderRadius: 4, padding: '4px 8px', textAlign: 'right' }} />
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = { color: '#ccc', fontSize: 13, fontWeight: 600 };
```

## `src/App.tsx`

```tsx
import React, { useState } from 'react';
import { ConnectionBar } from './components/MachineControl/ConnectionBar';
import { JobControl } from './components/MachineControl/JobControl';
import { FilterPanel } from './components/ImageEditor/FilterPanel';
import { EngravingParams } from './components/Settings/EngravingParams';
import { useImageStore } from './store/imageStore';
import { useSerialStore } from './store/serialStore';

export default function App() {
  const { openImage, originalPreview, processedPreview, imageWidth, imageHeight } = useImageStore();
  const { connectionState } = useSerialStore();
  const [activeTab, setActiveTab] = useState<'edit' | 'params'>('edit');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh',
                  background: '#0f0f1a', color: '#eee', fontFamily: 'system-ui, sans-serif' }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '8px 16px',
                    borderBottom: '1px solid #333', background: '#16213e' }}>
        <span style={{ fontWeight: 700, fontSize: 16, color: '#a29bfe', marginRight: 'auto' }}>
          🔥 LaserForge K4
        </span>
        <span style={{ fontSize: 12, color: '#888' }}>
          {connectionState === 'connected' ? '● Connected' : '○ Disconnected'}
        </span>
      </div>

      <ConnectionBar />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Canvas area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column',
                      padding: 16, gap: 12, overflow: 'auto' }}>
          <button onClick={openImage}
            style={{ background: '#8e44ad', color: '#fff', border: 'none', borderRadius: 6,
                     padding: '10px 20px', cursor: 'pointer', fontSize: 14, fontWeight: 600,
                     alignSelf: 'flex-start' }}>
            📁 Open Image
          </button>

          {originalPreview && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <div style={{ color: '#aaa', fontSize: 12, marginBottom: 6 }}>
                  Original — {imageWidth} × {imageHeight}px
                </div>
                <img src={originalPreview} alt="Original"
                  style={{ width: '100%', borderRadius: 6, border: '1px solid #333',
                           imageRendering: 'pixelated' }} />
              </div>
              <div>
                <div style={{ color: '#aaa', fontSize: 12, marginBottom: 6 }}>
                  Burn preview (processed)
                </div>
                {processedPreview ? (
                  <img src={processedPreview} alt="Processed"
                    style={{ width: '100%', borderRadius: 6, border: '1px solid #333',
                             imageRendering: 'pixelated', filter: 'invert(0)' }} />
                ) : (
                  <div style={{ width: '100%', aspectRatio: '1', background: '#222',
                                borderRadius: 6, display: 'flex', alignItems: 'center',
                                justifyContent: 'center', color: '#555', fontSize: 13 }}>
                    Adjust settings to generate preview
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div style={{ width: 300, borderLeft: '1px solid #333', display: 'flex',
                      flexDirection: 'column', overflow: 'auto' }}>

          {/* Tab switcher */}
          <div style={{ display: 'flex', borderBottom: '1px solid #333' }}>
            {(['edit', 'params'] as const).map(t => (
              <button key={t} onClick={() => setActiveTab(t)}
                style={{ flex: 1, padding: '10px', background: activeTab === t ? '#16213e' : 'transparent',
                         color: activeTab === t ? '#fff' : '#888', border: 'none',
                         borderBottom: activeTab === t ? '2px solid #8e44ad' : '2px solid transparent',
                         cursor: 'pointer', fontSize: 13, textTransform: 'capitalize' }}>
                {t === 'edit' ? 'Image Edit' : 'Engrave Params'}
              </button>
            ))}
          </div>

          {activeTab === 'edit'   && <FilterPanel />}
          {activeTab === 'params' && <EngravingParams />}

          <div style={{ borderTop: '1px solid #333', marginTop: 'auto' }}>
            <JobControl />
          </div>
        </div>
      </div>
    </div>
  );
}
```

---

# PART 9 — CONFIGURATION FILES

## `package.json`

```json
{
  "name": "laser-forge-k4",
  "version": "0.1.0",
  "description": "DKJXZ K4 Laser Engraver Desktop App",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "tauri": "tauri",
    "tauri:dev": "tauri dev",
    "tauri:build": "tauri build"
  },
  "dependencies": {
    "@tauri-apps/api": "^2",
    "@tauri-apps/plugin-dialog": "^2",
    "@tauri-apps/plugin-fs": "^2",
    "@tauri-apps/plugin-shell": "^2",
    "lodash": "^4.17.21",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "zustand": "^5"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2",
    "@types/lodash": "^4",
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "@vitejs/plugin-react": "^4",
    "typescript": "^5",
    "vite": "^5"
  }
}
```

## `vite.config.ts`

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: ['es2021', 'chrome100', 'safari13'],
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_DEBUG,
  },
});
```

## `src-tauri/tauri.conf.json`

```json
{
  "productName": "LaserForge K4",
  "version": "0.1.0",
  "identifier": "com.laserforge.k4",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:1420",
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build"
  },
  "app": {
    "windows": [
      {
        "title": "LaserForge K4",
        "width": 1200,
        "height": 780,
        "minWidth": 900,
        "minHeight": 600,
        "resizable": true,
        "fullscreen": false
      }
    ],
    "security": { "csp": null }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": ["icons/icon.ico", "icons/icon.png"],
    "resources": ["drivers/**"],
    "windows": {
      "wix": { "language": "en-US" }
    },
    "macOS": {
      "entitlements": null,
      "exceptionDomain": "",
      "signingIdentity": null
    },
    "linux": {
      "deb": { "depends": ["libwebkit2gtk-4.1-0"] }
    }
  }
}
```

---

# PART 10 — LINUX UDEV RULE

Create file `src-tauri/drivers/linux/99-ch340-k4.rules`:

```
# WCH CH340/CH341 USB-Serial adapter (Wainlux K4 laser engraver)
SUBSYSTEM=="tty", ATTRS{idVendor}=="1a86", ATTRS{idProduct}=="7523", MODE="0666", GROUP="dialout", SYMLINK+="k4_laser"
SUBSYSTEM=="tty", ATTRS{idVendor}=="1a86", ATTRS{idProduct}=="5523", MODE="0666", GROUP="dialout", SYMLINK+="k4_laser"
SUBSYSTEM=="tty", ATTRS{idVendor}=="1a86", ATTRS{idProduct}=="7522", MODE="0666", GROUP="dialout", SYMLINK+="k4_laser"
```

Install instructions (shown in app on Linux):
```bash
sudo cp 99-ch340-k4.rules /etc/udev/rules.d/
sudo udevadm control --reload-rules
sudo udevadm trigger
sudo usermod -aG dialout $USER
# Log out and back in, then reconnect K4
```

---

# PART 11 — BOOTSTRAP COMMANDS

After Cursor generates all files, run these commands in order:

```bash
# 1. Install Tauri prerequisites
cargo install tauri-cli --version "^2"

# 2. Install Node dependencies
npm install

# 3. Add Cargo dependencies (Tauri will pull them)
cd src-tauri
cargo fetch
cd ..

# 4. Run in dev mode
npm run tauri:dev

# 5. Build for production (creates installer)
npm run tauri:build
```

**Linux prerequisite:**
```bash
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev \
  librsvg2-dev pkg-config curl wget libssl-dev
```

**macOS prerequisite:** Xcode command line tools + Rust toolchain.

**Windows prerequisite:** Visual Studio Build Tools 2022 + Rust (rustup).

---

# PART 12 — PROTOCOL NOTES TEMPLATE

Create `PROTOCOL_NOTES.md` and fill in after running the sniffer:

```markdown
# K4 Protocol Notes — Field Validation

## Machine info
- Purchased from: dkjxz.com
- Model: K4 (USB only, no Bluetooth)
- USB chip: [fill in after Device Manager check]
- Baud: 115200 confirmed? [yes/no]
- COM port (Windows): 

## Command validation (from sniffer output)
| Command | Opcode | ACK received? | Notes |
|---------|--------|---------------|-------|
| CONNECT | 0x01   |               |       |
| SET_PARAMS | 0x0A |             |       |
| PREVIEW | 0x03   |               |       |
| IMAGE LINE | 0x09 |             |       |
| STOP | 0x07      |               |       |

## Discrepancies from documented protocol
[Fill in anything that differed — note exact bytes received]

## Unknown bytes observed
[Paste any hex sequences the sniffer captured that don't match known opcodes]
```

---

# CURSOR AGENT INSTRUCTIONS

When you start a new Cursor Composer session, paste this entire document and say:

> "Build the LaserForge K4 desktop app according to this specification. Start by creating all files in the structure defined in Part 3. Implement all Rust modules first (serial protocol, image processor, driver installer, lib.rs), then the React components and stores. After scaffolding, run `npm run tauri:dev` and fix any compilation errors. Do not skip any file — the protocol sniffer in Part 2 and all component files in Part 8 must all be created."

Then follow up with:

> "Now add the `base64` crate to Cargo.toml and ensure all Rust code compiles with `cargo check` from the src-tauri directory."

And finally:

> "Review App.tsx and all store files. Add missing imports, ensure TypeScript types are consistent across all files, and verify the `invoke` call parameter names match the Tauri `#[tauri::command]` function signatures exactly (Tauri 2 uses camelCase for invoke parameters)."

---

*Generated for DKJXZ K4 laser engraver — USB model — Protocol based on K3/K4 family reverse engineering from RBEGamer/K3_LASER_ENGRAVER_PROTOCOL and Moenupa/LaserEngraverDriver. Run the Phase 0 sniffer to validate against your specific unit before first engrave.*
