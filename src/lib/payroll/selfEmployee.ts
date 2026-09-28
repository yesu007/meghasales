import { Employee, Prisma, PrismaClient } from '@prisma/client';
import prisma from '@/lib/prisma';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';
import { nextEmployeeCode } from '@/lib/payroll/employeeCode';

type Client = Prisma.TransactionClient | PrismaClient;

interface UserIdentity {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
}

// Every system user is also staff: link the user to the unlinked Employee
// row with the same email (payroll may have onboarded them first), or
// create a minimal one. Returns the Employee now linked to the user, or
// null if the matching-email Employee already belongs to a different user
// (never steals it). Shared by POST /api/users and ensureEmployeeForUser.
export async function linkOrCreateEmployee(client: Client, user: UserIdentity): Promise<Employee | null> {
  const existing = await client.employee.findFirst({ where: { email: { equals: user.email, mode: 'insensitive' } } });
  if (existing) {
    if (existing.userId === user.id) return existing;
    if (existing.userId) return null;
    return client.employee.update({ where: { id: existing.id }, data: { userId: user.id } });
  }

  const employeeCode = await nextEmployeeCode(client);
  return client.employee.create({
    data: { userId: user.id, employeeCode, firstName: user.firstName, lastName: user.lastName, email: user.email },
  });
}

// My Space (payslips, leave, attendance, documents, reimbursements) resolves
// the caller's Employee through here rather than a bare findUnique, so a
// user who never got one at creation time — seeded accounts
// (prisma/seed.ts), users created while the payroll flag was off, restored
// databases — is linked/onboarded on first visit instead of being stuck on
// "No payroll profile yet" forever.
export async function ensureEmployeeForUser(userId: number): Promise<Employee | null> {
  const linked = await prisma.employee.findUnique({ where: { userId } });
  if (linked || !isPayrollModuleEnabled()) return linked;

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, firstName: true, lastName: true, isActive: true } });
  if (!user || !user.isActive) return null;

  try {
    return await linkOrCreateEmployee(prisma, user);
  } catch (error) {
    // Two My Space requests racing to onboard the same user — the loser
    // hits the userId unique constraint; the winner's row is the answer.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return prisma.employee.findUnique({ where: { userId } });
    }
    throw error;
  }
}
