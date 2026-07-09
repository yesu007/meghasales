import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

function createPrismaClient() {
  // During build, DATABASE_URL might not be available
  if (!process.env.DATABASE_URL) {
    console.warn('DATABASE_URL not set, Prisma client will not connect');
    return new PrismaClient({
      datasources: { db: { url: 'postgresql://placeholder:placeholder@localhost:5432/placeholder' } },
    });
  }
  return new PrismaClient();
}

const prisma = global.prisma || createPrismaClient();

if (process.env.NODE_ENV !== 'production') global.prisma = prisma;

export default prisma;
