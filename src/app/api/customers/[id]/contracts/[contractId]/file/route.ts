import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/rbac';
import { serveStoredDocument } from '@/lib/documentDownload';

export const dynamic = 'force-dynamic';

// View/download a Customer contract's attached file, decrypted
// server-side. Same view_leads gate as GET /api/customers/[id]/contracts;
// the contract must belong to this customer.
export async function GET(request: NextRequest, { params }: { params: { id: string; contractId: string } }) {
  const denied = await requirePermission('view_leads');
  if (denied) return denied;

  const leadId = parseInt(params.id, 10);
  const contractId = parseInt(params.contractId, 10);
  if (!leadId || !contractId) return NextResponse.json({ message: 'Invalid contract' }, { status: 400 });

  const contract = await prisma.customerContract.findFirst({ where: { id: contractId, leadId } });
  if (!contract?.fileUrl) return NextResponse.json({ message: 'Document not found' }, { status: 404 });

  return serveStoredDocument(request, { url: contract.fileUrl, fileName: contract.fileName || 'contract', mimeType: contract.mimeType });
}
