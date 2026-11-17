import { createHmac } from "node:crypto";

// The 6-digit code an authenticator app shows for a key (RFC 6238), so the
// tests can sign in with two-step sign-in without a phone.

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(value: string): Buffer {
  let bits = "";

  for (const character of value.replace(/[\s=]+/g, "").toUpperCase()) {
    bits += BASE32.indexOf(character).toString(2).padStart(5, "0");
  }

  const bytes: number[] = [];

  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }

  return Buffer.from(bytes);
}

/** The code for a base32 key, as typed under the QR code. */
export function totpCode(base32Key: string, at = Date.now()): string {
  const counter = Buffer.alloc(8);

  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));

  const digest = createHmac("sha1", base32Decode(base32Key))
    .update(counter)
    .digest();
  const offset = (digest[digest.length - 1] ?? 0) & 0xf;
  const value = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;

  return String(value).padStart(6, "0");
}
