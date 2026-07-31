import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { assistantAgent } from '@/lib/assistant/agent';

export const dynamic = 'force-dynamic';

interface AssistantTurn {
  role: 'user' | 'assistant';
  content: string;
}

// Non-streaming for now (Phase 1) — keeps Phase 2's voice layer trivial:
// speak the whole reply once it's ready rather than synchronizing TTS with
// a token stream. Revisit in Phase 4 if latency needs it.
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const transcript: unknown = body.transcript;
    const history: AssistantTurn[] = Array.isArray(body.history) ? body.history : [];

    if (typeof transcript !== 'string' || !transcript.trim()) {
      return NextResponse.json({ message: 'transcript is required' }, { status: 400 });
    }

    // Conversation state is client-side only (see plan) — the caller resends
    // the last few turns each request, nothing is persisted server-side.
    const messages = [
      ...history.map((turn) => ({ role: turn.role, content: turn.content })),
      { role: 'user' as const, content: transcript },
    ];

    const result = await assistantAgent.generate({ messages });

    return NextResponse.json({ text: result.text });
  } catch (error: any) {
    console.error('POST /api/assistant error:', error);
    return NextResponse.json({ message: 'Sorry, something went wrong.' }, { status: 500 });
  }
}
