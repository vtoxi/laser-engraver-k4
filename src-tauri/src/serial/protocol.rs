//! Binary command builders for the K4/K3 family proprietary protocol.

pub const ACK: u8 = 0x09;
pub const BAUD_RATE: u32 = 115_200;

#[inline]
pub fn connect() -> Vec<u8> {
    vec![0x01]
}

#[inline]
pub fn disconnect() -> Vec<u8> {
    vec![0x02]
}

#[inline]
pub fn home() -> Vec<u8> {
    vec![0x05]
}

#[inline]
pub fn fan_on() -> Vec<u8> {
    vec![0x0D]
}

#[inline]
pub fn fan_off() -> Vec<u8> {
    vec![0x0E]
}

#[inline]
pub fn stop_engrave() -> Vec<u8> {
    vec![0x07]
}

#[inline]
pub fn start_engrave() -> Vec<u8> {
    vec![0x06]
}

#[inline]
pub fn pause_engrave() -> Vec<u8> {
    vec![0x08]
}

/// - speed: mm/min (100–6000)
/// - power: 0–1000
/// - passes: 1–10
pub fn set_params(speed: u16, power: u16, passes: u8) -> Vec<u8> {
    vec![
        0x0A,
        (speed >> 8) as u8,
        (speed & 0xFF) as u8,
        (power >> 8) as u8,
        (power & 0xFF) as u8,
        passes,
    ]
}

pub fn preview_frame(x: u16, y: u16, w: u16, h: u16) -> Vec<u8> {
    vec![
        0x03,
        (x >> 8) as u8,
        (x & 0xFF) as u8,
        (y >> 8) as u8,
        (y & 0xFF) as u8,
        (w >> 8) as u8,
        (w & 0xFF) as u8,
        (h >> 8) as u8,
        (h & 0xFF) as u8,
    ]
}

#[inline]
pub fn stop_preview() -> Vec<u8> {
    vec![0x04]
}

pub fn jog(x: u16, y: u16) -> Vec<u8> {
    vec![
        0x0B,
        (x >> 8) as u8,
        (x & 0xFF) as u8,
        (y >> 8) as u8,
        (y & 0xFF) as u8,
    ]
}

/// Opcode `0x0C` — not used by the worker yet; reserved for status polling when protocol is confirmed.
#[allow(dead_code)]
#[inline]
pub fn status_request() -> Vec<u8> {
    vec![0x0C]
}

/// `pixels`: true = laser ON (black). `row`: Y index. `depth`: laser on-time (1–255 typical).
///
/// Per K4 host protocol notes: bytes 5–6 are **fixed** `0x03 0xE8` (1000) in the line packet.
/// Call `set_params` before engraving for actual speed/power/passes.
pub fn image_line(pixels: &[bool], row: u16, depth: u16, _power: u16) -> Vec<u8> {
    let cols = (pixels.len() + 7) / 8;
    let buf_size = cols + 9;
    let mut buf = vec![0u8; buf_size];

    buf[0] = 0x09;
    buf[1] = (buf_size >> 8) as u8;
    buf[2] = (buf_size & 0xFF) as u8;
    buf[3] = (depth >> 8) as u8;
    buf[4] = (depth & 0xFF) as u8;
    buf[5] = 0x03;
    buf[6] = 0xE8;
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
