import { ToolLoopAgent, stepCountIs } from 'ai';
import { registerTools } from './registry';
import { readLeadStatus } from './tools/readLeadStatus';
import { readDashboardStats } from './tools/readDashboardStats';
import { readPendingInvoices } from './tools/readPendingInvoices';

// Fetched from `curl https://ai-gateway.vercel.sh/v1/models` at Phase 0 time
// rather than assumed from memory — model slugs change.
const ASSISTANT_MODEL = 'anthropic/claude-sonnet-5';

// Phase 1: read-only tools only. Write tools (src/lib/assistant/tools/write*)
// are added here in Phase 3 once the write path exists.
const tools = registerTools({
  readLeadStatus,
  readDashboardStats,
  readPendingInvoices,
});

export const assistantAgent = new ToolLoopAgent({
  model: ASSISTANT_MODEL,
  instructions:
    'You are the voice assistant for MeghaSales, a jewellery-software sales CRM. ' +
    'Answer questions about leads, demos, quotations, and invoices using the tools available to you. ' +
    'Keep replies short and speakable: plain sentences, no markdown, no bullet lists or headings, since your reply is read aloud by text-to-speech. ' +
    "If a tool result has error: 'permission_denied' or 'unauthorized', tell the user plainly that they don't have permission for that, rather than repeating the raw error. " +
    "If a lookup tool returns found: false, say directly that you couldn't find it.",
  tools,
  stopWhen: stepCountIs(6),
});
