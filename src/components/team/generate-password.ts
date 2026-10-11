/**
 * Client-side temporary password generator (crypto.getRandomValues).
 * Produces 16 characters and guarantees at least one lower, upper, digit and
 * symbol so the result always satisfies common strength rules. Ambiguous
 * characters (0/O, 1/l/I) are left out because admins read these out loud.
 */

const LOWER = "abcdefghijkmnpqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%&*?-_+=";
const ALL = LOWER + UPPER + DIGITS + SYMBOLS;

export const GENERATED_PASSWORD_LENGTH = 16;

function randomInt(max: number): number {
  // Rejection sampling keeps the distribution uniform.
  const limit = Math.floor(0xffffffff / max) * max;
  const buffer = new Uint32Array(1);
  let value: number;
  do {
    crypto.getRandomValues(buffer);
    value = buffer[0];
  } while (value >= limit);
  return value % max;
}

function pick(alphabet: string): string {
  return alphabet[randomInt(alphabet.length)];
}

export function generatePassword(length = GENERATED_PASSWORD_LENGTH): string {
  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < length) chars.push(pick(ALL));
  // Fisher-Yates so the guaranteed classes are not always at the front.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
