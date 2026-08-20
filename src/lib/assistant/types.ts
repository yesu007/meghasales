import { z } from 'zod';

export interface AssistantToolContext {
  userId: number;
  roles: string[];
}

export type AssistantToolDenial =
  | { error: 'unauthorized' }
  | { error: 'permission_denied'; permission: string };

// Config accepted by createAssistantTool() (src/lib/assistant/registry.ts).
// Every voice-invokable capability is defined this way so RBAC and (for
// write tools) audit logging can't be skipped by a tool author.
export interface AssistantToolConfig<TInput> {
  description: string;
  permission: string;
  inputSchema: z.ZodType<TInput>;
  handler: (input: TInput, ctx: AssistantToolContext) => Promise<unknown>;
}
