import prisma from '@/lib/prisma';

// Resolves the Employee behind a logged-in user for the self-service
// pages (My Leave, My Payslips, My Documents, My Expense Claims).
//
// Employee.userId is normally set at onboarding, but only when a User with
// the same email already exists at that moment — an employee created before
// their login (or whose email was corrected later) stays unlinked and the
// self-service pages show "No payroll profile yet". So when no linked row is
// found, fall back to an unlinked Employee with the user's email and link it
// on the spot, making the fix permanent for every later request.
export async function findEmployeeForUser(userId: number) {
  const linked = await prisma.employee.findUnique({ where: { userId } });
  if (linked) return linked;

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  const email = user?.email?.trim();
  if (!email) return null;

  const candidates = await prisma.employee.findMany({
    where: { userId: null, email: { equals: email, mode: 'insensitive' } },
    take: 2,
  });
  // Ambiguous (two unlinked employees share the email) — leave it for HR
  // rather than guessing which record is this person's.
  if (candidates.length !== 1) return null;

  return prisma.employee.update({ where: { id: candidates[0].id }, data: { userId } });
}
