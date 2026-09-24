// Stellar contract strkeys ("C…"): base32(versionByte ‖ 32-byte contract ID ‖ CRC16-XModem, little-endian).

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const CONTRACT_VERSION_BYTE = 2 << 3; // encodes to a leading "C"
const STRKEY_LENGTH = 56; // 35 bytes = 280 bits = 56 base32 chars, no padding

function crc16xmodem(bytes: Uint8Array): number {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

function base32Encode(bytes: Uint8Array): string {
  let out = "";
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += ALPHABET[(buffer >> bits) & 31];
    }
  }
  if (bits > 0) out += ALPHABET[(buffer << (5 - bits)) & 31];
  return out;
}

function base32Decode(text: string): Uint8Array {
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of text) {
    const value = ALPHABET.indexOf(char);
    if (value === -1) throw new Error(`invalid base32 character "${char}"`);
    buffer = ((buffer << 5) | value) & 0xfff;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

/** Decodes a "C…" strkey into its 32-byte contract ID. Throws on any malformed input. */
export function decodeContractStrkey(strkey: string): Uint8Array {
  if (strkey.length !== STRKEY_LENGTH) {
    throw new Error(`contract strkey must be ${STRKEY_LENGTH} characters, got ${strkey.length}`);
  }
  const raw = base32Decode(strkey);
  if (raw[0] !== CONTRACT_VERSION_BYTE) throw new Error(`"${strkey}" is not a contract strkey (must start with C)`);
  const payload = raw.subarray(0, 33);
  const checksum = raw[33]! | (raw[34]! << 8);
  if (checksum !== crc16xmodem(payload)) throw new Error(`"${strkey}" has an invalid checksum`);
  return raw.slice(1, 33);
}

/** Encodes a 32-byte contract ID as a "C…" strkey. */
export function encodeContractStrkey(contractId: Uint8Array): string {
  if (contractId.length !== 32) throw new Error(`contract ID must be 32 bytes, got ${contractId.length}`);
  const payload = new Uint8Array(33);
  payload[0] = CONTRACT_VERSION_BYTE;
  payload.set(contractId, 1);
  const crc = crc16xmodem(payload);
  const raw = new Uint8Array(35);
  raw.set(payload);
  raw[33] = crc & 0xff;
  raw[34] = crc >> 8;
  return base32Encode(raw);
}
