#!/usr/bin/env node
// Print the current six-digit TOTP for an otpauth:// URI (or a bare base32 secret).
// Fixture-only convenience for manual testing — see docs/testing/TESTING-GUIDE.md §5.
import { createHmac } from 'node:crypto';

const input = process.argv[2];
if (!input) {
  console.error('usage: node docs/testing/totp.mjs "<otpauth://totp/...?secret=...>" | <BASE32SECRET>');
  process.exit(2);
}
const secret = input.startsWith('otpauth://') ? new URL(input).searchParams.get('secret') : input;
if (!secret) throw new Error('no secret in the URI');

function base32Decode(text) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of text.replace(/=+$/, '').toUpperCase()) {
    const index = alphabet.indexOf(char);
    if (index === -1) throw new Error(`not base32: ${char}`);
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let at = 0; at + 8 <= bits.length; at += 8) {
    bytes.push(Number.parseInt(bits.slice(at, at + 8), 2));
  }
  return Buffer.from(bytes);
}

const counter = Buffer.alloc(8);
counter.writeUInt32BE(Math.floor(Date.now() / 1000 / 30), 4);
const digest = createHmac('sha1', base32Decode(secret)).update(counter).digest();
const offset = digest.readUInt8(digest.length - 1) & 0x0f;
const code = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
console.log(String(code).padStart(6, '0'));
