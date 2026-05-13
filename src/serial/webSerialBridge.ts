import * as proto from './k4Protocol';

export interface RasterJobParams {
  depth: number;
  power: number;
  speed: number;
  passes: number;
}

export type SerialEventPayload = { type: string; [key: string]: unknown };

const BAUD = 115_200;
const IO_SLICE_MS = 30;
const ACK = proto.ACK;

type Listener = (e: SerialEventPayload) => void;

function emit(listeners: Set<Listener>, e: SerialEventPayload) {
  for (const fn of listeners) fn(e);
}

/** Web Serial + K4 framing (mirrors Rust worker / connection behaviour). */
export class WebSerialBridge {
  private port: SerialPort | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private readonly inBuf: number[] = [];
  private readonly listeners = new Set<Listener>();
  grantedPorts: SerialPort[] = [];
  jobCancel = false;

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  async refreshGrantedList(): Promise<void> {
    if (!navigator.serial) return;
    this.grantedPorts = await navigator.serial.getPorts();
  }

  async requestNewPort(): Promise<void> {
    if (!navigator.serial) throw new Error('Web Serial API not available');
    const filters = [{ usbVendorId: 0x1a86 }, { usbVendorId: 0x4348 }];
    await navigator.serial.requestPort({ filters });
    await this.refreshGrantedList();
  }

  portPathForIndex(i: number): string {
    return `web-serial:${i}`;
  }

  parseIndex(path: string): number {
    if (!path.startsWith('web-serial:')) return -1;
    return Number(path.slice('web-serial:'.length));
  }

  isOpen(): boolean {
    return this.port !== null && this.writer !== null;
  }

  private async readChunk(): Promise<void> {
    if (!this.reader) return;
    const { value, done } = await this.reader.read();
    if (done || !value) return;
    for (let i = 0; i < value.length; i++) this.inBuf.push(value[i]);
  }

  /** Read one byte before `deadline` (ms epoch). */
  async readByteBefore(deadline: number): Promise<number | null> {
    while (Date.now() < deadline) {
      if (this.inBuf.length) return this.inBuf.shift() ?? null;
      if (!this.reader) return null;
      const left = deadline - Date.now();
      if (left <= 0) break;
      await Promise.race([
        this.readChunk(),
        new Promise<void>((r) => setTimeout(r, Math.min(IO_SLICE_MS, left))),
      ]);
    }
    return null;
  }

  async waitAck(timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const b = await this.readByteBefore(deadline);
      if (b === ACK) return true;
    }
    return false;
  }

  async writeAll(data: Uint8Array): Promise<void> {
    if (!this.writer) throw new Error('Serial not open');
    await this.writer.write(data);
  }

  async sendDisconnectBlind(): Promise<void> {
    try {
      await this.writeAll(proto.bytesDisconnect());
      await new Promise((r) => setTimeout(r, 120));
    } catch {
      /* ignore */
    }
  }

  async prepareSession(): Promise<void> {
    this.inBuf.length = 0;
    const deadline = Date.now() + 500;
    while (Date.now() < deadline) {
      await Promise.race([
        this.readChunk(),
        new Promise<void>((r) => setTimeout(r, 40)),
      ]);
    }
    this.inBuf.length = 0;
    await new Promise((r) => setTimeout(r, 120));
  }

  async handshakeConnect(): Promise<void> {
    await this.prepareSession();
    const cmd = proto.bytesConnect();
    for (let attempt = 0; attempt < 5; attempt++) {
      await this.writeAll(cmd);
      await new Promise((r) => setTimeout(r, 100));
      if (await this.waitAck(3500)) return;
    }
    await this.sendDisconnectBlind();
    this.inBuf.length = 0;
    for (let attempt = 0; attempt < 5; attempt++) {
      await this.writeAll(cmd);
      await new Promise((r) => setTimeout(r, 100));
      if (await this.waitAck(3500)) return;
    }
    throw new Error('CONNECT failed (no ACK). Check cable, driver, 115200 8N1, and that the engraver is on.');
  }

  async sendCommand(cmd: Uint8Array, ackTimeoutMs = 2000, attempts = 3): Promise<void> {
    for (let a = 0; a < attempts; a++) {
      await this.writeAll(cmd);
      if (await this.waitAck(ackTimeoutMs)) return;
      await new Promise((r) => setTimeout(r, 150));
    }
    throw new Error('No ACK for command');
  }

  async openPortAt(path: string): Promise<void> {
    await this.closePort();
    const idx = this.parseIndex(path);
    if (idx < 0 || idx >= this.grantedPorts.length) {
      throw new Error('Invalid or unknown Web Serial port. Use “Pair USB device…” first.');
    }
    const p = this.grantedPorts[idx];
    await p.open({
      baudRate: BAUD,
      dataBits: 8,
      parity: 'none',
      stopBits: 1,
      flowControl: 'none',
      bufferSize: 65536,
    });
    this.port = p;
    if (!p.writable || !p.readable) throw new Error('Port missing readable/writable');
    this.writer = p.writable.getWriter();
    this.reader = p.readable.getReader();
    await this.handshakeConnect();
    await new Promise((r) => setTimeout(r, 200));
    emit(this.listeners, { type: 'connected', port: path });
  }

  async closePort(): Promise<void> {
    try {
      if (this.writer && this.port?.writable) {
        await this.sendCommand(proto.bytesDisconnect(), 1500, 2).catch(() => {});
      }
    } catch {
      /* ignore */
    }
    try {
      await this.reader?.cancel();
    } catch {
      /* ignore */
    }
    this.reader?.releaseLock();
    this.reader = null;
    try {
      await this.writer?.close();
    } catch {
      /* ignore */
    }
    this.writer = null;
    try {
      await this.port?.close();
    } catch {
      /* ignore */
    }
    this.port = null;
    this.inBuf.length = 0;
    emit(this.listeners, { type: 'disconnected' });
  }

  async home(): Promise<void> {
    await this.sendCommand(proto.bytesHome());
  }

  async jog(x: number, y: number): Promise<void> {
    await this.sendCommand(proto.bytesJog(x, y));
  }

  async previewFrame(x: number, y: number, w: number, h: number): Promise<void> {
    await this.sendCommand(proto.bytesPreviewFrame(x, y, w, h));
  }

  async stopPreview(): Promise<void> {
    await this.sendCommand(proto.bytesStopPreview());
  }

  async setParams(speed: number, power: number, passes: number): Promise<void> {
    await this.sendCommand(proto.bytesSetParams(speed, power, passes));
  }

  async stopJob(): Promise<void> {
    this.jobCancel = true;
    await this.sendCommand(proto.bytesStopEngrave(), 2000, 2).catch(() => {});
  }

  async pauseJob(): Promise<void> {
    await this.sendCommand(proto.bytesPauseEngrave());
  }

  async runRasterJob(lines: boolean[][], params: RasterJobParams): Promise<void> {
    if (!this.writer) throw new Error('Not connected');
    this.jobCancel = false;
    const { depth, power, speed, passes } = params;
    const rows = lines.length;
    const totalLines = Math.max(1, rows * passes);

    try {
      await this.setParams(speed, power, passes);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      emit(this.listeners, { type: 'error', message: `SET_PARAMS failed: ${message}` });
      return;
    }

    try {
      await this.sendCommand(proto.bytesStartEngrave());
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      emit(this.listeners, { type: 'error', message: `START_ENGRAVE failed: ${message}` });
      return;
    }

    try {
      let done = 0;
      for (let pass = 0; pass < passes; pass++) {
        for (let row = 0; row < rows; row++) {
          if (this.jobCancel) break;
          const lineBuf = proto.bytesImageLine(lines[row], row, depth, power);
          await this.sendCommand(lineBuf, 3000, 3);
          done += 1;
          if (row % 8 === 0 || row + 1 === rows) {
            emit(this.listeners, {
              type: 'progress',
              row: done,
              total: totalLines,
              pct: (done / totalLines) * 100,
            });
          }
        }
        if (this.jobCancel) break;
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      emit(this.listeners, { type: 'error', message });
    }

    await this.sendCommand(proto.bytesStopEngrave(), 2000, 2).catch(() => {});
    emit(this.listeners, { type: 'job_complete' });
  }
}

let singleton: WebSerialBridge | null = null;

export function getWebSerialBridge(): WebSerialBridge {
  if (!singleton) singleton = new WebSerialBridge();
  return singleton;
}
