# K4 Protocol Notes — Field Validation

Fill this in after running `tools/k4_sniffer.py` against your hardware and (optionally) the official host software.

## Machine info

- Purchased from: dkjxz.com
- Model: K4 (USB only, no Bluetooth)
- USB chip: [fill in after Device Manager / System Information check]
- Baud: 115200 confirmed? [yes/no]
- COM port (Windows):
- Device path (macOS/Linux):

## Command validation (from sniffer output)

| Command    | Opcode | ACK received? | Notes |
|------------|--------|-----------------|-------|
| CONNECT    | 0x01   |                 |       |
| SET_PARAMS | 0x0A   |                 |       |
| PREVIEW    | 0x03   |                 |       |
| IMAGE LINE | 0x09   |                 |       |
| STOP       | 0x07   |                 |       |

## Discrepancies from documented protocol

[Fill in anything that differed — note exact bytes received]

## Unknown bytes observed

[Paste any hex sequences the sniffer captured that do not match known opcodes]
