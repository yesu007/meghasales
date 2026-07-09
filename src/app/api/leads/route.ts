import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '0');
    const size = parseInt(searchParams.get('size') || '10');
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';
    const leadSource = searchParams.get('leadSource') || '';
    const businessVertical = searchParams.get('businessVertical') || '';
    const city = searchParams.get('city') || '';
    const state = searchParams.get('state') || '';
    const country = searchParams.get('country') || '';
    const sortBy = searchParams.get('sortBy') || 'createdAt';
    const sortDir = searchParams.get('sortDir') || 'desc';
    const createdFrom = searchParams.get('createdFrom') || '';
    const createdTo = searchParams.get('createdTo') || '';

    // Build where clause
    const where: Prisma.LeadWhereInput = {};
    const AND: Prisma.LeadWhereInput[] = [];

    if (search) {
      const searchTerm = search.trim().toLowerCase();
      AND.push({
        OR: [
          { companyName: { contains: searchTerm, mode: 'insensitive' } },
          { contactPerson: { contains: searchTerm, mode: 'insensitive' } },
          { email: { contains: searchTerm, mode: 'insensitive' } },
          { mobile: { contains: searchTerm, mode: 'insensitive' } },
          { city: { contains: searchTerm, mode: 'insensitive' } },
          { state: { contains: searchTerm, mode: 'insensitive' } },
          { notes: { contains: searchTerm, mode: 'insensitive' } },
        ],
      });
    }

    if (status) AND.push({ status: status.toUpperCase() });
    if (leadSource) AND.push({ leadSource: leadSource.toUpperCase() });
    if (businessVertical) AND.push({ businessVerticals: { contains: businessVertical, mode: 'insensitive' } });
    if (city) AND.push({ city: { contains: city, mode: 'insensitive' } });
    if (state) AND.push({ state: { contains: state, mode: 'insensitive' } });
    if (country) AND.push({ country: { contains: country, mode: 'insensitive' } });
    if (createdFrom) AND.push({ createdAt: { gte: new Date(createdFrom) } });
    if (createdTo) AND.push({ createdAt: { lte: new Date(createdTo) } });

    if (AND.length > 0) where.AND = AND;

    // Validate sort field
    const validSortFields = ['companyName', 'contactPerson', 'email', 'status', 'leadSource', 'createdAt', 'updatedAt'];
    const orderField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const orderDir = sortDir === 'asc' ? 'asc' : 'desc';

    const [leads, totalElements] = await Promise.all([
      prisma.lead.findMany({
        where,
        orderBy: { [orderField]: orderDir },
        skip: page * size,
        take: size,
        include: {
          assignedBa: { select: { firstName: true, lastName: true } },
        },
      }),
      prisma.lead.count({ where }),
    ]);

    const content = leads.map((lead) => ({
      id: lead.id,
      companyName: lead.companyName,
      contactPerson: lead.contactPerson,
      email: lead.email,
      mobile: lead.mobile,
      status: lead.status,
      leadSource: lead.leadSource,
      assignedBaName: lead.assignedBa ? `${lead.assignedBa.firstName} ${lead.assignedBa.lastName}` : null,
      createdAt: lead.createdAt,
      updatedAt: lead.updatedAt,
    }));

    return NextResponse.json({
      content,
      page,
      size,
      totalElements,
      totalPages: Math.ceil(totalElements / size),
      last: (page + 1) * size >= totalElements,
    });
  } catch (error: any) {
    console.error('GET /api/leads error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const lead = await prisma.lead.create({
      data: {
        companyName: body.companyName,
        contactPerson: body.contactPerson,
        mobile: body.mobile || null,
        email: body.email || null,
        country: body.country || null,
        state: body.state || null,
        city: body.city || null,
        leadSource: body.leadSource,
        businessVerticals: body.businessVerticals ? JSON.stringify(body.businessVerticals) : null,
        notes: body.notes || null,
        status: 'NEW',
      },
    });

    // Log activity
    await prisma.leadActivity.create({
      data: {
        leadId: lead.id,
        activityType: 'CREATED',
        description: `Lead created for company: ${lead.companyName}`,
      },
    });

    return NextResponse.json(lead, { status: 201 });
  } catch (error: any) {
    console.error('POST /api/leads error:', error);
    return NextResponse.json({ message: error.message || 'Failed to create lead' }, { status: 400 });
  }
}
