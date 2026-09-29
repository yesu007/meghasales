// Pure — no Prisma/bcrypt imports — so client forms can run the exact same
// checks the API does before submitting. Shared by self-service Change
// Password (PUT /api/users/me/password) and the admin reset screen
// (POST /api/users/[id]/reset-password); same 8-character minimum the Users
// screen already enforces on create/edit.
export const MIN_PASSWORD_LENGTH = 8;

// Returns an error message, or null if the pair is acceptable.
export function validateNewPassword(newPassword: unknown, confirmPassword: unknown): string | null {
  if (typeof newPassword !== 'string' || !newPassword) return 'New password is required';
  if (newPassword.length < MIN_PASSWORD_LENGTH) return `New password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  if (typeof confirmPassword !== 'string' || !confirmPassword) return 'Please confirm the new password';
  if (newPassword !== confirmPassword) return 'New password and confirm password do not match';
  return null;
}
