import { randomInt } from 'node:crypto';
import { PIN_LENGTH } from '@livevote/shared';

/** Generate a random 6-digit PIN (may have a leading zero). */
export function generatePin(): string {
  const max = 10 ** PIN_LENGTH;
  return randomInt(0, max).toString().padStart(PIN_LENGTH, '0');
}

export function isValidPinFormat(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);
}
