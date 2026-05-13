/** K4 binary opcodes (mirrors `src-tauri/src/serial/protocol.rs`). */

export const ACK = 0x09;

export const bytesConnect = (): Uint8Array => Uint8Array.of(0x01);
export const bytesDisconnect = (): Uint8Array => Uint8Array.of(0x02);
export const bytesHome = (): Uint8Array => Uint8Array.of(0x05);
export const bytesFanOn = (): Uint8Array => Uint8Array.of(0x0d);
export const bytesFanOff = (): Uint8Array => Uint8Array.of(0x0e);
export const bytesStopEngrave = (): Uint8Array => Uint8Array.of(0x07);
export const bytesStartEngrave = (): Uint8Array => Uint8Array.of(0x06);
export const bytesPauseEngrave = (): Uint8Array => Uint8Array.of(0x08);

export function bytesSetParams(speed: number, power: number, passes: number): Uint8Array {
  const s = speed & 0xffff;
  const p = power & 0xffff;
  const pass = Math.max(0, Math.min(255, passes)) & 0xff;
  return Uint8Array.of(0x0a, (s >> 8) & 0xff, s & 0xff, (p >> 8) & 0xff, p & 0xff, pass);
}

export function bytesPreviewFrame(x: number, y: number, w: number, h: number): Uint8Array {
  const u16 = (v: number) => [(v >> 8) & 0xff, v & 0xff];
  return Uint8Array.of(
    0x03,
    ...u16(x & 0xffff),
    ...u16(y & 0xffff),
    ...u16(w & 0xffff),
    ...u16(h & 0xffff),
  );
}

export const bytesStopPreview = (): Uint8Array => Uint8Array.of(0x04);

export function bytesJog(x: number, y: number): Uint8Array {
  const u16 = (v: number) => [(v >> 8) & 0xff, v & 0xff];
  return Uint8Array.of(0x0b, ...u16(x & 0xffff), ...u16(y & 0xffff));
}

export function bytesImageLine(pixels: boolean[], row: number, depth: number, _power: number): Uint8Array {
  const cols = Math.ceil(pixels.length / 8);
  const bufSize = cols + 9;
  const buf = new Uint8Array(bufSize);
  buf[0] = 0x09;
  buf[1] = (bufSize >> 8) & 0xff;
  buf[2] = bufSize & 0xff;
  buf[3] = (depth >> 8) & 0xff;
  buf[4] = depth & 0xff;
  /* K4 line packet: power bytes fixed at 1000 (0x03E8); use SET_PARAMS for real power. */
  buf[5] = 0x03;
  buf[6] = 0xe8;
  buf[7] = (row >> 8) & 0xff;
  buf[8] = row & 0xff;
  for (let colByte = 0; colByte < cols; colByte++) {
    let packed = 0;
    for (let bit = 0; bit < 8; bit++) {
      const px = colByte * 8 + bit;
      if (px < pixels.length && pixels[px]) {
        packed |= 0x80 >> bit;
      }
    }
    buf[9 + colByte] = packed;
  }
  return buf;
}
