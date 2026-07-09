import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const impl = await prisma.implementation.findUnique({
      where: { id: parseInt(params.id) },
      include: {
        lead: { select: { companyName: true, contactPerson: true, mobile: true, email: true } },
        projectManager: { select: { firstName: true, lastName: true } },
      },
    });
    if (!impl) return NextResponse.json({ message: 'Implementation not found' }, { status: 404 });
    return NextResponse.json(impl);
  } catch (error) {
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    const id = parseInt(params.id);

    const existing = await prisma.implementation.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ message: 'Implementation not found' }, { status: 404 });

    const impl = await prisma.implementation.update({
      where: { id },
      data: {
        ...(body.projectName !== undefined && { projectName: body.projectName }),
        ...(body.status && { status: body.status }),
        ...(body.projectManagerId !== undefined && { projectManagerId: body.projectManagerId ? parseInt(body.projectManagerId) : null }),
        ...(body.startDate !== undefined && { startDate: body.startDate ? new Date(body.startDate) : null }),
        ...(body.targetEndDate !== undefined && { targetEndDate: body.targetEndDate ? new Date(body.targetEndDate) : null }),
        ...(body.actualEndDate !== undefined && { actualEndDate: body.actualEndDate ? new Date(body.actualEndDate) : null }),
        ...(body.currentStage !== undefined && { currentStage: body.currentStage }),
        ...(body.notes !== undefined && { notes: body.notes }),
      },
    });

    return NextResponse.json(impl);
  } catch (error: any) {
    return NextResponse.json({ message: error.message || 'Failed to update' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await prisma.implementation.delete({ where: { id: parseInt(params.id) } });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return NextResponse.json({ message: 'Failed to delete implementation' }, { status: 400 });
  }
}
