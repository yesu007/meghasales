import bcrypt from 'bcryptjs';

// Server-only hashing helpers — same bcrypt cost (10) the Users screen's
// create/edit routes and the NextAuth credentials check already use.
const BCRYPT_ROUNDS = 10;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
