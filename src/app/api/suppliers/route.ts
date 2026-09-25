import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { GSTIN_REGEX } from '@/lib/billCalc';

export const dynamic = 'force-dynamic';

// Vendor master for Bills. List (optionally searched by name/GSTIN) + create.
// Created inline from the bill form when the vendor is new.
export async function GET(request: NextRequest) {
  const denied = await requirePermission('view_expenses');
  if (denied) return denied;

  try {
    const search = (new URL(request.url).searchParams.get('search') || '').trim();
    const where: Prisma.SupplierWhereInput = { isActive: true };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { gstin: { contains: search, mode: 'insensitive' } },
      ];
    }
    const suppliers = await prisma.supplier.findMany({ where, orderBy: { name: 'asc' } });
    return NextResponse.json(suppliers);
  } catch (error) {
    console.error('GET /api/suppliers error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const denied = await requirePermission('manage_expenses');
  if (denied) return denied;

  try {
    const body = await request.json();
    const name = String(body.name || '').trim();
    if (!name) return NextResponse.json({ message: 'Vendor name is required' }, { status: 400 });

    const gstin = body.gstin ? String(body.gstin).trim().toUpperCase() : null;
    if (gstin && !GSTIN_REGEX.test(gstin)) {
      return NextResponse.json({ message: 'GSTIN format is invalid (expected 15 characters, e.g. 33AAAAA0000A1Z5)' }, { status: 400 });
    }
    if (gstin) {
      const existing = await prisma.supplier.findUnique({ where: { gstin } });
      if (existing) {
        return NextResponse.json({ message: `A vendor with GSTIN ${gstin} already exists: ${existing.name}`, existing }, { status: 409 });
      }
    }

    const supplier = await prisma.supplier.create({
      data: {
        name,
        gstin,
        // First 2 GSTIN digits are the state code; PAN is characters 3-12.
        stateCode: body.stateCode || (gstin ? gstin.slice(0, 2) : null),
        pan: body.pan || (gstin ? gstin.slice(2, 12) : null),
        address: body.address || null,
        phone: body.phone || null,
        email: body.email || null,
      },
    });

    await logAudit({ action: 'CREATE', entityType: 'SUPPLIER', entityId: supplier.id, newValue: supplier, description: `Vendor "${supplier.name}" created`, request });
    return NextResponse.json(supplier, { status: 201 });
  } catch (error: any) {
    console.error('POST /api/suppliers error:', error);
    return NextResponse.json({ message: error.message || 'Failed to create vendor' }, { status: 400 });
  }
}
