import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Get the first (and typically only) company profile
    let profile = await prisma.companyProfile.findFirst({
      where: { isActive: true },
    });

    // If no profile exists, create a default one
    if (!profile) {
      profile = await prisma.companyProfile.create({
        data: {
          companyName: 'Tekfilo',
          tagline: 'MeghaSales CRM',
          isActive: true,
        },
      });
    }

    return NextResponse.json(profile);
  } catch (error: any) {
    console.error('GET /api/settings/profile error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();

    // The rest of this route has no RBAC (Settings has never been
    // permission-gated), but changing the default country is explicitly
    // an Administrator-only action per the multi-currency requirements —
    // gate just this one field rather than the whole route, so existing
    // non-admin users editing other company-profile fields aren't locked
    // out by a scope change they didn't ask for.
    if (body.defaultCountryId !== undefined) {
      const denied = await requirePermission('manage_countries');
      if (denied) return denied;
    }

    // Find or create profile
    let profile = await prisma.companyProfile.findFirst({
      where: { isActive: true },
    });

    if (!profile) {
      profile = await prisma.companyProfile.create({
        data: {
          companyName: body.companyName || 'Tekfilo',
          isActive: true,
        },
      });
    }

    const updated = await prisma.companyProfile.update({
      where: { id: profile.id },
      data: {
        ...(body.companyName !== undefined && { companyName: body.companyName }),
        ...(body.tagline !== undefined && { tagline: body.tagline }),
        ...(body.email !== undefined && { email: body.email }),
        ...(body.phone !== undefined && { phone: body.phone }),
        ...(body.website !== undefined && { website: body.website }),
        ...(body.addressLine1 !== undefined && { addressLine1: body.addressLine1 }),
        ...(body.addressLine2 !== undefined && { addressLine2: body.addressLine2 }),
        ...(body.city !== undefined && { city: body.city }),
        ...(body.state !== undefined && { state: body.state }),
        ...(body.country !== undefined && { country: body.country }),
        ...(body.postalCode !== undefined && { postalCode: body.postalCode }),
        ...(body.gstNumber !== undefined && { gstNumber: body.gstNumber }),
        ...(body.panNumber !== undefined && { panNumber: body.panNumber }),
        ...(body.bankName !== undefined && { bankName: body.bankName }),
        ...(body.bankAccountNumber !== undefined && { bankAccountNumber: body.bankAccountNumber }),
        ...(body.bankIfsc !== undefined && { bankIfsc: body.bankIfsc }),
        ...(body.authorizedSignatory !== undefined && { authorizedSignatory: body.authorizedSignatory }),
        ...(body.signatoryDesignation !== undefined && { signatoryDesignation: body.signatoryDesignation }),
        ...(body.primaryColor !== undefined && { primaryColor: body.primaryColor }),
        ...(body.secondaryColor !== undefined && { secondaryColor: body.secondaryColor }),
        ...(body.termsAndConditions !== undefined && { termsAndConditions: body.termsAndConditions }),
        ...(body.paymentTerms !== undefined && { paymentTerms: body.paymentTerms }),
        ...(body.warrantyTerms !== undefined && { warrantyTerms: body.warrantyTerms }),
        ...(body.defaultCountryId !== undefined && { defaultCountryId: body.defaultCountryId ? parseInt(body.defaultCountryId) : null }),
      },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error('PUT /api/settings/profile error:', error);
    return NextResponse.json({ message: error.message || 'Failed to update profile' }, { status: 400 });
  }
}
