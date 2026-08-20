import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock('next-auth/next', () => ({ getServerSession }));

import { createAssistantTool, registerTools } from './registry';

// Minimal fake ToolExecutionOptions — this repo's tools never read
// toolCallId/messages, only the input and the session-derived context.
const fakeCallOptions = { toolCallId: 'test-call', messages: [] } as any;

function makeTool(handler = vi.fn(async (input: { value: string }) => ({ echoed: input.value }))) {
  return {
    handler,
    tool: createAssistantTool({
      description: 'test tool',
      permission: 'manage_test_thing',
      inputSchema: z.object({ value: z.string() }),
      handler,
    }),
  };
}

describe('createAssistantTool', () => {
  beforeEach(() => {
    getServerSession.mockReset();
  });

  it('returns unauthorized and never calls the handler when there is no session', async () => {
    getServerSession.mockResolvedValue(null);
    const { tool, handler } = makeTool();

    const result = await tool.execute!({ value: 'x' }, fakeCallOptions);

    expect(result).toEqual({ error: 'unauthorized' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('returns permission_denied and never calls the handler when the session lacks the permission', async () => {
    getServerSession.mockResolvedValue({
      user: { id: '1', roles: ['SALES'], permissions: ['some_other_permission'] },
    });
    const { tool, handler } = makeTool();

    const result = await tool.execute!({ value: 'x' }, fakeCallOptions);

    expect(result).toEqual({ error: 'permission_denied', permission: 'manage_test_thing' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('calls the handler with derived context when the session holds the permission', async () => {
    getServerSession.mockResolvedValue({
      user: { id: '42', roles: ['SALES'], permissions: ['manage_test_thing'] },
    });
    const { tool, handler } = makeTool();

    const result = await tool.execute!({ value: 'x' }, fakeCallOptions);

    expect(result).toEqual({ echoed: 'x' });
    expect(handler).toHaveBeenCalledWith({ value: 'x' }, { userId: 42, roles: ['SALES'] });
  });

  it('calls the handler for ADMIN even without the specific permission (implicit bypass)', async () => {
    getServerSession.mockResolvedValue({
      user: { id: '1', roles: ['ADMIN'], permissions: [] },
    });
    const { tool, handler } = makeTool();

    const result = await tool.execute!({ value: 'x' }, fakeCallOptions);

    expect(result).toEqual({ echoed: 'x' });
    expect(handler).toHaveBeenCalledWith({ value: 'x' }, { userId: 1, roles: ['ADMIN'] });
  });
});

describe('registerTools', () => {
  it('merges multiple tool maps into one', () => {
    const { tool: toolA } = makeTool();
    const { tool: toolB } = makeTool();

    const merged = registerTools({ toolA }, { toolB });

    expect(Object.keys(merged)).toEqual(['toolA', 'toolB']);
  });
});
