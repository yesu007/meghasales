import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const demo = await prisma.demo.findUnique({
      where: { id: parseInt(params.id) },
      include: {
        lead: { select: { companyName: true, contactPerson: true, mobile: true, email: true } },
        assignedTo: { select: { firstName: true, lastName: true } },
      },
    });
    if (!demo) return NextResponse.json({ message: 'Demo not found' }, { status: 404 });
    return NextResponse.json(demo);
  } catch (error) {
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    const id = parseInt(params.id);

    const existing = await prisma.demo.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ message: 'Demo not found' }, { status: 404 });

    const demo = await prisma.demo.update({
      where: { id },
      data: {
        ...(body.demoType && { demoType: body.demoType }),
        ...(body.status && { status: body.status }),
        ...(body.scheduledDate !== undefined && { scheduledDate: body.scheduledDate ? new Date(body.scheduledDate) : null }),
        ...(body.actualDate !== undefined && { actualDate: body.actualDate ? new Date(body.actualDate) : null }),
        ...(body.assignedToId !== undefined && { assignedToId: body.assignedToId ? parseInt(body.assignedToId) : null }),
        ...(body.attendees !== undefined && { attendees: body.attendees }),
        ...(body.modulesDemonstrated !== undefined && { modulesDemonstrated: body.modulesDemonstrated }),
        ...(body.customerInterestLevel !== undefined && { customerInterestLevel: body.customerInterestLevel }),
        ...(body.questions !== undefined && { questions: body.questions }),
        ...(body.nextAction !== undefined && { nextAction: body.nextAction }),
        ...(body.feedback !== undefined && { feedback: body.feedback }),
        ...(body.recordingUrl !== undefined && { recordingUrl: body.recordingUrl }),
        ...(body.stakeholderFeedback !== undefined && { stakeholderFeedback: body.stakeholderFeedback }),
        ...(body.approvalStatus !== undefined && { approvalStatus: body.approvalStatus }),
      },
    });

    // Log status change activity
    if (body.status && body.status !== existing.status) {
      await prisma.leadActivity.create({
        data: {
          leadId: demo.leadId,
          activityType: 'DEMO_STATUS_CHANGED',
          description: `Demo status changed from ${existing.status} to ${body.status}`,
        },
      });
    }

    return NextResponse.json(demo);
  } catch (error: any) {
    return NextResponse.json({ message: error.message || 'Failed to update demo' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await prisma.demo.delete({ where: { id: parseInt(params.id) } });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return NextResponse.json({ message: 'Failed to delete demo' }, { status: 400 });
  }
}
