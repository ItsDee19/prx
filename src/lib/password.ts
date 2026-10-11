import bcrypt from "bcryptjs";

/**
 * Password hashing helpers (bcryptjs). This module must stay free of any
 * `next/*` import so the seed script can use it from plain Node.
 */

/** bcrypt cost factor: roughly 100ms per hash on commodity hardware. */
const BCRYPT_COST = 10;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!plain || !hash) return false;
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    // A malformed hash should read as a wrong password, never as a crash.
    return false;
  }
}
