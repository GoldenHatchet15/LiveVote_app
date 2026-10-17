#!/usr/bin/env node
// Generate an ADMIN_PASSWORD_HASH (scrypt) for production.
// Usage: npm run hash-password -w server -- 'your-strong-password'
import { scryptSync, randomBytes } from 'node:crypto';

const password = process.argv[2];
if (!password) {
  console.error("Usage: npm run hash-password -w server -- 'your-strong-password'");
  process.exit(1);
}
const salt = randomBytes(16);
const hash = scryptSync(password, salt, 64);
process.stdout.write(`scrypt$${salt.toString('hex')}$${hash.toString('hex')}\n`);
