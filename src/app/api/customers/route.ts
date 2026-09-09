import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { resolveCustomerCountryFields } from '@/lib/customerCountry';
import { resolveBusinessVerticals } from '@/lib/businessVerticalValidation';
import { requirePermission } from '@/lib/rbac';
import { isValidEmail } from '@/lib/email';
import { CUSTOMER_STATUSES } from '@/lib/customerStatus';

export const dynamic = 'force-dynamic';

// Customer-owned create endpoint. There is no separate Customer table —
// "Customer" is a Lead row with status = CONFIRMED (see the module note in
// src/app/dashboard/customers/page.tsx) — so this still writes to the Lead
// table, but keeps its own validation/permission/audit handling here rather
// than calling into src/app/api/leads/route.ts, so Customer creation never
// depends on Lead's own request handling.
export async function POST(request: NextRequest) {
  const denied = await requirePermission('manage_leads');
  if (denied) return denied;

  try {
    const body = await request.json();

    if (!body.companyName) {
      return NextResponse.json({ message: 'Company name is required' }, { status: 400 });
    }
    if (!body.contactPerson) {
      return NextResponse.json({ message: 'Contact person is required' }, { status: 400 });
    }
    if (!body.mobile) {
      return NextResponse.json({ message: 'Mobile is required' }, { status: 400 });
    }
    if (!body.leadSource) {
      return NextResponse.json({ message: 'Source is required' }, { status: 400 });
    }
    let businessVerticals: string | null;
    try {
      businessVerticals = await resolveBusinessVerticals(body.businessVerticals);
    } catch (e: any) {
      return NextResponse.json({ message: e.message || 'Invalid business vertical' }, { status: 400 });
    }
    if (!body.countryId) {
      return NextResponse.json({ message: 'Country is required' }, { status: 400 });
    }
    // Dedicated recipient for payment reminders — required specifically on
    // Customer creation (unlike the general `email` field above, which
    // stays optional), see schema.prisma's Lead.financeEmail comment.
    if (!body.financeEmail) {
      return NextResponse.json({ message: 'Finance email is required' }, { status: 400 });
    }
    if (!isValidEmail(body.financeEmail)) {
      return NextResponse.json({ message: 'Enter a valid finance email address' }, { status: 400 });
    }
    if (body.customerStatus !== undefined && !CUSTOMER_STATUSES.some((s) => s.value === body.customerStatus)) {
      return NextResponse.json({ message: 'Invalid customer status' }, { status: 400 });
    }

    const session = await getServerSession(authOptions);
    const isAdmin = (session?.user?.roles || []).includes('ADMIN');
    let countryFields;
    try {
      countryFields = await resolveCustomerCountryFields(parseInt(body.countryId), { isAdmin, overrideCurrencyCode: body.currencyCode });
    } catch (e: any) {
      return NextResponse.json({ message: e.message || 'Invalid country selected' }, { status: 400 });
    }

    // Duplicate guard — a customer is treated as "the same" as an existing
    // one (any status='CONFIRMED' Lead) if it shares a company name within
    // the same country, or shares an email, or shares a phone number. Any
    // one of those matching is enough: a repeat company+country registration
    // is a genuine dupe of the find-or-create below, and a shared email/phone
    // usually means the same contact was re-entered under a different
    // company name. Checked before that find-or-create (inside the
    // transaction below) so a rejected duplicate never creates orphan
    // company rows.
    const trimmedCompanyName = String(body.companyName).trim();
    const trimmedEmail = body.email ? String(body.email).trim() : null;
    const trimmedMobile = body.mobile ? String(body.mobile).trim() : null;

    const duplicateConditions: any[] = [
      { companyName: { equals: trimmedCompanyName, mode: 'insensitive' }, countryId: countryFields.countryId },
    ];
    if (trimmedEmail) duplicateConditions.push({ email: { equals: trimmedEmail, mode: 'insensitive' } });
    if (trimmedMobile) duplicateConditions.push({ mobile: trimmedMobile });

    const duplicate = await prisma.lead.findFirst({
      where: { status: 'CONFIRMED', OR: duplicateConditions },
      select: { id: true, companyName: true, email: true, mobile: true, countryId: true },
    });

    if (duplicate) {
      let message = 'A matching customer already exists';
      if (duplicate.companyName.trim().toLowerCase() === trimmedCompanyName.toLowerCase() && duplicate.countryId === countryFields.countryId) {
        message = `A customer named "${duplicate.companyName}" already exists in this country`;
      } else if (trimmedEmail && duplicate.email && duplicate.email.toLowerCase() === trimmedEmail.toLowerCase()) {
        message = `A customer with email "${trimmedEmail}" already exists (${duplicate.companyName})`;
      } else if (trimmedMobile && duplicate.mobile === trimmedMobile) {
        message = `A customer with phone "${trimmedMobile}" already exists (${duplicate.companyName})`;
      }
      return NextResponse.json({ message, duplicateCustomerId: duplicate.id }, { status: 409 });
    }

    if (body.projectId) {
      const project = await prisma.project.findUnique({ where: { id: parseInt(body.projectId) }, select: { id: true } });
      if (!project) return NextResponse.json({ message: 'Selected project not found' }, { status: 404 });
    }

    // "Create New Project" sub-flow (the Product / Project field's own
    // combobox, "+ Create ..." option) — validated fully here, before any
    // row is written, so a bad Vertical (no Head assigned, same rule
    // POST /api/projects itself enforces) never gets as far as creating a
    // Customer. body.newProject = { projectName, verticalId }; mutually
    // exclusive with body.projectId (an existing Project was picked
    // instead) — the frontend only ever sends one of the two.
    let newProjectVertical: { id: number; headId: number } | null = null;
    if (body.newProject) {
      const projectName = body.newProject.projectName ? String(body.newProject.projectName).trim() : '';
      if (!projectName) return NextResponse.json({ message: 'New project name is required' }, { status: 400 });
      if (!body.newProject.verticalId) return NextResponse.json({ message: 'Vertical is required for the new project' }, { status: 400 });
      const vertical = await prisma.vertical.findUnique({ where: { id: parseInt(body.newProject.verticalId) }, select: { id: true, headId: true } });
      if (!vertical) return NextResponse.json({ message: 'Selected vertical not found' }, { status: 404 });
      if (!vertical.headId) return NextResponse.json({ message: 'Selected vertical has no Head assigned' }, { status: 400 });
      newProjectVertical = { id: vertical.id, headId: vertical.headId };
    }

    // Product's own "Product / Project" picker, same shape as newProject
    // above but for Product Master instead — a Product Name is a pick from
    // the Vertical Master's own "Product Vertical"-flagged rows (same
    // catalog ProductFormDrawer's own Product Name field sources from, see
    // that form's own comment), never an existing Product row: every
    // Product Master row already belongs to exactly one Customer/Lead (see
    // the Product model's own schema comment), so this always creates a
    // brand new one for the Customer being created here, the same way
    // ProductFormDrawer creates one for whichever Customer/Lead is picked
    // on its own form. body.newProduct = { verticalId }.
    let newProductVertical: { id: number; name: string; headId: number } | null = null;
    if (body.newProduct) {
      if (!body.newProduct.verticalId) return NextResponse.json({ message: 'Product is required' }, { status: 400 });
      const vertical = await prisma.vertical.findUnique({ where: { id: parseInt(body.newProduct.verticalId) }, select: { id: true, name: true, headId: true } });
      if (!vertical) return NextResponse.json({ message: 'Selected product not found' }, { status: 404 });
      if (!vertical.headId) return NextResponse.json({ message: 'Selected product\'s vertical has no Head assigned' }, { status: 400 });
      newProductVertical = { id: vertical.id, name: vertical.name, headId: vertical.headId };
    }

    // Everything below actually writes rows — the Customer, and (for the
    // "Create New Project"/Product sub-flows) its new Project/Product, run
    // as one atomic transaction: neither can be created until a real
    // Customer id exists to own it (Project.customerId/Product.customerId),
    // so the Customer row is written first inside this transaction, then
    // the Project/Product, then the Customer is updated to link back to it
    // (Lead.projectId/productId) — but since all of this happens inside the
    // same transaction, a failure at any point (e.g. an unexpected DB error
    // creating the Project/Product, despite the Vertical/Head already
    // having been validated above) rolls back the Customer insert too.
    // Nothing is left half-created, and the response is only ever 201 once
    // every row genuinely exists and is linked — never "Customer created,
    // but the Project failed" (the bug this replaces, from an earlier
    // version of this flow that made separate, non-transactional requests).
    const { customer, project, product } = await prisma.$transaction(async (tx) => {
      // Find-or-create the Customer Company Master by exact (case-
      // insensitive) name match, then find-or-create its legal entity for
      // the selected country — same find-or-create logic as before, just
      // run against the transaction client so a rollback also undoes a
      // company/entity created for a customer that ultimately failed.
      let company = await tx.company.findFirst({ where: { name: { equals: trimmedCompanyName, mode: 'insensitive' } } });
      if (!company) {
        const createdById = session?.user ? parseInt((session.user as any).id, 10) : null;
        company = await tx.company.create({ data: { name: trimmedCompanyName, createdById: Number.isFinite(createdById) ? createdById : null } });
      }

      let legalEntity = await tx.companyLegalEntity.findUnique({ where: { companyId_countryId: { companyId: company.id, countryId: countryFields.countryId } } });
      if (!legalEntity) {
        legalEntity = await tx.companyLegalEntity.create({
          data: {
            companyId: company.id,
            countryId: countryFields.countryId,
            legalName: body.legalName ? String(body.legalName).trim() : trimmedCompanyName,
            taxRegistrationNumber: body.taxRegistrationNumber || null,
            addressLine1: body.legalAddressLine1 || null,
            addressLine2: body.legalAddressLine2 || null,
            city: body.city || null,
            state: body.state || null,
            postalCode: body.postalCode || null,
            currencyCode: countryFields.currencyCode,
          },
        });
      }

      let customer = await tx.lead.create({
        data: {
          companyName: body.companyName,
          projectName: body.projectName || null,
          // Neither a new Project nor a new Product (below) exists yet at
          // this point — both get filled in by their own update at the
          // bottom of this block once they do. An existing Project picked
          // instead (body.projectId) is already known, so that can be set
          // immediately (Product has no such "existing" mode — see
          // newProductVertical's own comment above).
          projectId: !newProjectVertical && body.projectId ? parseInt(body.projectId) : null,
          contactPerson: body.contactPerson,
          designation: body.designation || null,
          mobile: body.mobile || null,
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
          status: 'CONFIRMED',
          customerStatus: body.customerStatus || 'ACTIVE',
          // Born a Customer, so the conversion moment is this same instant —
          // see schema.prisma's Lead.confirmedAt comment.
          confirmedAt: new Date(),
          companyId: company.id,
          legalEntityId: legalEntity.id,
        },
      });

      let project = null;
      if (newProjectVertical) {
        project = await tx.project.create({
          data: {
            projectName: String(body.newProject.projectName).trim(),
            customerId: customer.id,
            verticalId: newProjectVertical.id,
            headId: newProjectVertical.headId,
            // No Budget input in this inline-create flow — same default a
            // caller who genuinely has none yet would use; editable later
            // from the Project's own Edit form in Project Master.
            budget: 0,
            budgetCurrencyCode: 'INR',
          },
        });
        customer = await tx.lead.update({ where: { id: customer.id }, data: { projectId: project.id } });
      }

      let product = null;
      if (newProductVertical) {
        product = await tx.product.create({
          data: {
            // Same convention as ProductFormDrawer's own Product Name
            // field — the Product row's name mirrors the picked Vertical's
            // name at creation time (see newProductVertical's own comment).
            productName: newProductVertical.name,
            customerId: customer.id,
            verticalId: newProductVertical.id,
            headId: newProductVertical.headId,
            // No Budget input in this inline-create flow — same rationale
            // as the new-Project case above.
            budget: 0,
            budgetCurrencyCode: 'INR',
          },
        });
        customer = await tx.lead.update({ where: { id: customer.id }, data: { productId: product.id } });
      }

      return { customer, project, product };
    });

    await prisma.leadActivity.create({
      data: {
        leadId: customer.id,
        activityType: 'CREATED',
        description: `Customer created for company: ${customer.companyName}`,
      },
    });

    await logAudit({ action: 'CREATE', entityType: 'CUSTOMER', entityId: customer.id, newValue: customer, description: `Customer created: ${customer.companyName}`, request });

    if (project) {
      await logAudit({ action: 'CREATE', entityType: 'PROJECT', entityId: project.id, newValue: project, description: `Project "${project.projectName}" created for "${customer.companyName}"`, request });
    }
    if (product) {
      await logAudit({ action: 'CREATE', entityType: 'PRODUCT', entityId: product.id, newValue: product, description: `Product "${product.productName}" created for "${customer.companyName}"`, request });
    }

    // Optional initial Stage, picked on this form in place of Status (see
    // CustomerFormDrawer's `stage` field). When set, create the customer's
    // Implementation record immediately with it as currentStage — same
    // shape POST /api/implementations and the Customer table's own
    // ensureImplementationThenUpdate create, so this just does that create
    // up front instead of leaving it to happen lazily on first Stage edit.
    if (body.stage) {
      const impl = await prisma.implementation.create({
        data: { leadId: customer.id, sourceType: 'CUSTOMER', status: 'PLANNING', currentStage: body.stage },
      });
      await logAudit({ action: 'CREATE', entityType: 'IMPLEMENTATION', entityId: impl.id, newValue: impl, description: `Implementation created for ${customer.companyName}`, request });
    }

    // `project`/`product` are only present for their own "Create New ..."
    // sub-flow — the frontend doesn't currently need either (it invalidates
    // and refetches Project/Product Master data instead), included for
    // completeness/debugging.
    return NextResponse.json({ ...customer, project, product }, { status: 201 });
  } catch (error: any) {
    console.error('POST /api/customers error:', error);
    return NextResponse.json({ message: error.message || 'Failed to create customer' }, { status: 400 });
  }
}
