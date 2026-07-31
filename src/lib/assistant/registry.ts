import { tool, Tool } from 'ai';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { checkPermission } from '@/lib/rbac';
import { AssistantToolConfig } from './types';

// Wraps ai's tool() so permission-checking is structurally impossible to
// skip: every assistant tool goes through this, not raw tool(). A denial is
// RETURNED as a tool result (not thrown) so the model can react to it in its
// next turn and phrase a natural spoken explanation, instead of aborting the
// whole generation.
export function createAssistantTool<TInput>(config: AssistantToolConfig<TInput>): Tool<TInput, unknown> {
  return tool({
    description: config.description,
    inputSchema: config.inputSchema,
    execute: async (input: TInput) => {
      const session = await getServerSession(authOptions);
      if (!session) {
        return { error: 'unauthorized' as const };
      }

      if (!checkPermission(session, config.permission)) {
        return { error: 'permission_denied' as const, permission: config.permission };
      }

      const userId = parseInt((session.user as any).id, 10);
      const role = (session.user as any).role;
      return config.handler(input, { userId, role });
    },
  });
}

// Merges tool maps from individual tool modules into the single map a
// ToolLoopAgent expects (src/lib/assistant/agent.ts). A plain object spread
// would do the same thing — this named helper exists so the phase-gating
// (Phase 1: read tools only, Phase 3: + write tools) reads as an intentional
// step at each call site rather than an ad-hoc spread.
export function registerTools(...toolMaps: Record<string, Tool<any, any>>[]): Record<string, Tool<any, any>> {
  return Object.assign({}, ...toolMaps);
}
