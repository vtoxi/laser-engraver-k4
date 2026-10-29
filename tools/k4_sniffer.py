#!/usr/bin/env python3
"""
K4 Protocol Sniffer + Tester
Run: pip install pyserial
Usage: python k4_sniffer.py --port COM4 --mode sniff
       python k4_sniffer.py --port AUTO --mode test
       python k4_sniffer.py --port /dev/ttyUSB0 --mode test
"""
import serial
import time
import argparse


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
            if byte == b"\x09":
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
    data = bytes(
        [
            0x0A,
            (speed >> 8) & 0xFF,
            speed & 0xFF,
            (power >> 8) & 0xFF,
            power & 0xFF,
            passes & 0xFF,
        ]
    )
    return send_cmd(ser, data, f"SET_PARAMS speed={speed} power={power} passes={passes}")


def cmd_preview(ser, x=0, y=0, w=100, h=100):
    data = bytes(
        [
            0x03,
            (x >> 8) & 0xFF,
            x & 0xFF,
            (y >> 8) & 0xFF,
            y & 0xFF,
            (w >> 8) & 0xFF,
            w & 0xFF,
            (h >> 8) & 0xFF,
            h & 0xFF,
        ]
    )
    return send_cmd(ser, data, f"PREVIEW x={x} y={y} w={w} h={h}")


def cmd_stop_preview(ser):
    return send_cmd(ser, bytes([0x04]), "STOP_PREVIEW")


def cmd_jog(ser, x, y):
    data = bytes([0x0B, (x >> 8) & 0xFF, x & 0xFF, (y >> 8) & 0xFF, y & 0xFF])
    return send_cmd(ser, data, f"JOG x={x} y={y}")


def send_test_image(ser, width=32, height=32, depth=80):
    """Send a simple 32x32 checkerboard test image."""
    print(f"\n[IMG] Sending {width}x{height} test image, depth={depth}")
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
        buf[5] = 0x03
        buf[6] = 0xE8
        buf[7] = (row >> 8) & 0xFF
        buf[8] = row & 0xFF

        for col_byte in range(cols):
            pixel_byte = 0
            for bit in range(8):
                px = col_byte * 8 + bit
                if px < width:
                    if ((px // 8) + (row // 8)) % 2 == 0:
                        pixel_byte |= 0x80 >> bit
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
        time.sleep(0.5)

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

        print(
            "\n--- Step 6: Send small test image (DRY RUN — machine will move but check before enabling laser) ---"
        )
        user = input("Send test engrave? Type 'yes' to confirm: ").strip().lower()
        if user == "yes":
            cmd_fan_on(ser)
            send_test_image(ser, width=32, height=32, depth=50)

        print("\n--- Step 7: Disconnect ---")
        cmd_disconnect(ser)
        print("[DONE] Test sequence complete")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--port",
        default=None,
        help="Serial port (e.g. COM4, /dev/ttyUSB0, or AUTO)",
    )
    parser.add_argument("--baud", default=115200, type=int)
    parser.add_argument("--mode", choices=["sniff", "test"], default="test")
    args = parser.parse_args()

    port = args.port
    if port is None or str(port).upper() == "AUTO":
        port = find_k4_port()
    if not port:
        print("[ERR] No port specified. Use --port COM4 (or /dev/ttyUSB0 on Linux, or AUTO)")
        exit(1)

    if args.mode == "sniff":
        sniff_mode(port, args.baud)
    else:
        test_mode(port, args.baud)
