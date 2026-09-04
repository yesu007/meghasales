import prisma from '@/lib/prisma';
import { serializeBusinessVerticals } from '@/lib/businessVerticals';

// Server-side resolution of a Lead's Business Vertical selection — kept out
// of src/lib/businessVerticals.ts (imported by 'use client' components too)
// since this needs the Prisma client, same reasoning as
// src/lib/leadCountry.ts's split from its own client-safe callers.
//
// Enforces the business rule that each selected Vertical must be an
// existing Vertical (matching the same master list /api/verticals already
// offers the picker) before writing serializeBusinessVerticals's JSON.
// Throws on an empty selection or any name that doesn't match a real
// Vertical row — callers catch and turn this into a 400, same pattern as
// resolveLeadCountryFields.
export async function resolveBusinessVerticals(names: unknown): Promise<string> {
  if (!Array.isArray(names) || names.length === 0) {
    throw new Error('Business vertical is required');
  }

  const cleaned = Array.from(new Set(names.map((n) => String(n).trim()).filter(Boolean)));
  if (cleaned.length === 0) {
    throw new Error('Business vertical is required');
  }

  const existing = await prisma.vertical.findMany({ where: { name: { in: cleaned } }, select: { name: true } });
  const existingNames = new Set(existing.map((v) => v.name));
  const unknownNames = cleaned.filter((n) => !existingNames.has(n));
  if (unknownNames.length > 0) {
    throw new Error(`Unknown business vertical: ${unknownNames.join(', ')}`);
  }

  return serializeBusinessVerticals(cleaned) as string;
}
