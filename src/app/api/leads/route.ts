import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { logAudit } from '@/lib/audit';
import { resolveLeadCountryFields } from '@/lib/leadCountry';
import { resolveBusinessVerticals } from '@/lib/businessVerticalValidation';
import { isFollowUpOverdue } from '@/lib/leadFollowUp';
import { requirePermission, getOwnershipFilter } from '@/lib/rbac';
import { dispatchDeadlineReminders } from '@/lib/deadlineReminders';
import { isValidEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const denied = await requirePermission('view_leads');
  if (denied) return denied;

  // On-demand dispatch, same pattern as the admin-ticket tickets list —
  // Vercel Hobby crons only run once a day, so the leads list (hit by
  // every dashboard-home visit too) doubles as the trigger that catches
  // events/follow-ups/deadlines crossing the 24h email threshold between
  // cron ticks. Best-effort: a dispatch hiccup must not block the list.
  try {
    await dispatchDeadlineReminders();
  } catch (error) {
    console.error('GET /api/leads on-demand deadline dispatch error:', error);
  }

  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '0');
    const size = parseInt(searchParams.get('size') || '10');
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';
    const customerStatus = searchParams.get('customerStatus') || '';
    const leadSource = searchParams.get('leadSource') || '';
    const businessVertical = searchParams.get('businessVertical') || '';
    const city = searchParams.get('city') || '';
    const state = searchParams.get('state') || '';
    const country = searchParams.get('country') || '';
    // 'new' = leads with no follow-up logged yet; 'followed-up' = leads with
    // at least one follow-up entry (see requirement: All Leads | New Leads |
    // Followed-up Leads toggle on the leads list).
    const view = searchParams.get('view') || '';
    const sortBy = searchParams.get('sortBy') || (view === 'followed-up' ? 'lastFollowUpDate' : 'createdAt');
    const sortDir = searchParams.get('sortDir') || 'desc';
    const createdFrom = searchParams.get('createdFrom') || '';
    const createdTo = searchParams.get('createdTo') || '';
    // Opt-in, passed only by the Leads page's own listing — every other
    // caller of this endpoint (Quotations, Demos, Implementations,
    // Accounting, Meetings reports) still needs Customer rows too, since
    // there's no separate Customer table (see src/app/api/customers/
    // route.ts's own comment: "Customer" is a Lead row with
    // status=CONFIRMED). A Customer created directly from the Customer tab
    // is excluded here — a genuinely-converted Lead (status reached
    // CONFIRMED via the pipeline) is not.
    const excludeDirectCustomers = searchParams.get('excludeDirectCustomers') === 'true';
    // Opt-in, passed only by the Customers page's own listing — joins each
    // row's most-recently-created Implementation (Stage/Status shown/edited
    // inline there, reusing the exact same values/UI as the Implementations
    // module — see src/lib/implementationStatus.ts) without adding an
    // unnecessary extra join to every other caller of this endpoint.
    const includeImplementation = searchParams.get('includeImplementation') === 'true';
    const implementationStatus = searchParams.get('implementationStatus') || '';

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
    if (customerStatus) AND.push({ customerStatus: customerStatus.toUpperCase() });
    if (leadSource) {
      AND.push({ leadSource: leadSource.toUpperCase() });
    } else {
      // Quotations created without picking an existing lead auto-create one
      // (leadSource: 'QUOTATION') purely to satisfy Quotation's required FK —
      // it's not a real, user-facing lead source (not in the UI's source
      // filter either), so keep it out of the default lead listing/pickers.
      AND.push({ leadSource: { not: 'QUOTATION' } });
    }
    if (businessVertical) AND.push({ businessVerticals: { contains: businessVertical, mode: 'insensitive' } });
    if (city) AND.push({ city: { contains: city, mode: 'insensitive' } });
    if (state) AND.push({ state: { contains: state, mode: 'insensitive' } });
    if (country) AND.push({ country: { contains: country, mode: 'insensitive' } });
    if (createdFrom) AND.push({ createdAt: { gte: new Date(createdFrom) } });
    if (createdTo) AND.push({ createdAt: { lte: new Date(createdTo) } });
    if (view === 'new') AND.push({ followUpCount: 0 });
    if (view === 'followed-up') AND.push({ followUpCount: { gt: 0 } });
    if (excludeDirectCustomers) {
      // Both /api/leads and /api/customers write exactly one CREATED
      // LeadActivity at creation, with a distinct description — the only
      // existing signal for "was this row ever a real Lead" since Customer
      // creation writes straight to the Lead table with no field of its
      // own recording origin.
      AND.push({ activities: { none: { activityType: 'CREATED', description: { startsWith: 'Customer created for company:' } } } });
    }
    if (implementationStatus) {
      // Matches the Implementations module's own filter semantics
      // (status.toUpperCase(), exact match) — see src/app/api/implementations/route.ts.
      AND.push({ implementations: { some: { status: implementationStatus.toUpperCase() } } });
    }

    // Ownership data-scope boundary — a Business Analyst / Sales rep sees
    // only leads assigned to them (plus unassigned ones); see
    // getOwnershipFilter's own comment for why other view_leads-holding
    // roles (DEMO_TEAM) are deliberately left unrestricted.
    const ownershipFilter = await getOwnershipFilter('assignedBaId', ['BUSINESS_ANALYST', 'SALES']);
    if (ownershipFilter) AND.push(ownershipFilter);

    if (AND.length > 0) where.AND = AND;

    // Validate sort field
    const validSortFields = ['companyName', 'contactPerson', 'email', 'status', 'leadSource', 'createdAt', 'confirmedAt', 'updatedAt', 'lastFollowUpDate', 'nextFollowUpDate'];
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
          countryRef: { select: { isoCode: true, countryName: true, flagEmoji: true } },
          ...(includeImplementation && {
            implementations: {
              orderBy: { createdAt: 'desc' as const },
              take: 1,
              select: { id: true, status: true, currentStage: true },
            },
          }),
        },
      }),
      prisma.lead.count({ where }),
    ]);

    const content = leads.map((lead) => ({
      id: lead.id,
      companyName: lead.companyName,
      projectName: lead.projectName,
      contactPerson: lead.contactPerson,
      designation: lead.designation,
      email: lead.email,
      financeEmail: lead.financeEmail,
      mobile: lead.mobile,
      whatsapp: lead.whatsapp,
      status: lead.status,
      customerStatus: lead.customerStatus,
      leadSource: lead.leadSource,
      businessVerticals: lead.businessVerticals,
      assignedBaId: lead.assignedBaId,
      assignedBaName: lead.assignedBa ? `${lead.assignedBa.firstName} ${lead.assignedBa.lastName}` : null,
      country: lead.countryRef,
      state: lead.state,
      createdAt: lead.createdAt,
      // Customer module's "Created"/"Customer Since" date — see
      // schema.prisma's Lead.confirmedAt comment. Additive alongside
      // createdAt (left untouched) so the Leads module's own "Created"
      // column, which must keep showing the Lead's original creation date,
      // is unaffected.
      confirmedAt: lead.confirmedAt,
      updatedAt: lead.updatedAt,
      lastFollowUpDate: lead.lastFollowUpDate,
      nextFollowUpDate: lead.nextFollowUpDate,
      followUpCount: lead.followUpCount,
      isOverdue: isFollowUpOverdue(lead.nextFollowUpDate, lead.status),
      // Only present when includeImplementation=true was passed (see above)
      // — this row's most-recently-created Implementation, or null if it
      // has none yet. `as any` since the include is conditional at runtime.
      ...(includeImplementation && {
        implementation: (lead as any).implementations?.[0]
          ? {
              id: (lead as any).implementations[0].id,
              status: (lead as any).implementations[0].status,
              currentStage: (lead as any).implementations[0].currentStage,
            }
          : null,
      }),
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
  const denied = await requirePermission('manage_leads');
  if (denied) return denied;

  try {
    const body = await request.json();

    if (!body.countryId) {
      return NextResponse.json({ message: 'Country is required' }, { status: 400 });
    }
    // Dedicated recipient for payment reminders — required on every Lead,
    // not just once it becomes a Customer. See schema.prisma's
    // Lead.financeEmail comment.
    if (!body.financeEmail) {
      return NextResponse.json({ message: 'Finance email is required' }, { status: 400 });
    }
    if (!isValidEmail(body.financeEmail)) {
      return NextResponse.json({ message: 'Enter a valid finance email address' }, { status: 400 });
    }

    let businessVerticals: string | null;
    try {
      businessVerticals = await resolveBusinessVerticals(body.businessVerticals);
    } catch (e: any) {
      return NextResponse.json({ message: e.message || 'Invalid business vertical' }, { status: 400 });
    }

    const session = await getServerSession(authOptions);
    const isAdmin = (session?.user?.roles || []).includes('ADMIN');
    let countryFields;
    try {
      countryFields = await resolveLeadCountryFields(parseInt(body.countryId), { isAdmin, overrideCurrencyCode: body.currencyCode });
    } catch (e: any) {
      return NextResponse.json({ message: e.message || 'Invalid country selected' }, { status: 400 });
    }

    if (body.projectId) {
      const project = await prisma.project.findUnique({ where: { id: parseInt(body.projectId) }, select: { id: true } });
      if (!project) return NextResponse.json({ message: 'Selected project not found' }, { status: 404 });
    }

    const lead = await prisma.lead.create({
      data: {
        companyName: body.companyName,
        projectName: body.projectName || null,
        projectId: body.projectId ? parseInt(body.projectId) : null,
        contactPerson: body.contactPerson,
        designation: body.designation || null,
        mobile: body.mobile || null,
        whatsapp: body.whatsapp || null,
        email: body.email || null,
        financeEmail: body.financeEmail,
        country: countryFields.country,
        countryId: countryFields.countryId,
        currencyCode: countryFields.currencyCode,
        currencySymbol: countryFields.currencySymbol,
        taxType: countryFields.taxType,
        state: body.state || null,
        city: body.city || null,
        addressLine1: body.addressLine1 || null,
        addressLine2: body.addressLine2 || null,
        leadSource: body.leadSource,
        businessVerticals,
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

    await logAudit({ action: 'CREATE', entityType: 'LEAD', entityId: lead.id, newValue: lead, description: `Lead created: ${lead.companyName}`, request });

    return NextResponse.json(lead, { status: 201 });
  } catch (error: any) {
    console.error('POST /api/leads error:', error);
    return NextResponse.json({ message: error.message || 'Failed to create lead' }, { status: 400 });
  }
}
