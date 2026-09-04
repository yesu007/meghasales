// Shared email-format check — same pattern already used ad hoc in
// src/app/dashboard/users/page.tsx, centralized here so every new
// required-email field (e.g. Lead/Customer financeEmail) validates
// consistently on both the client and the server.
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_REGEX.test(value);
}
