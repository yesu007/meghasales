import { describe, it, expect, vi, beforeEach } from 'vitest';

// Contract test: each read tool must be bound to the SPECIFIC permission it
// claims, not just "any permission". A session holding a real but unrelated
// permission must still be denied — catches a tool accidentally wired to
// the wrong (too-broad or too-narrow) permission string.
const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock('next-auth/next', () => ({ getServerSession }));

import { readLeadStatus } from './readLeadStatus';
import { readDashboardStats } from './readDashboardStats';
import { readPendingInvoices } from './readPendingInvoices';

const fakeCallOptions = { toolCallId: 'test-call', messages: [] } as any;

const sessionWithOnly = (permission: string) => ({
  user: { id: '1', role: 'SALES', permissions: [permission] },
});

describe.each([
  ['readLeadStatus', readLeadStatus, 'view_leads', { companyName: 'Acme' }],
  ['readDashboardStats', readDashboardStats, 'view_leads', {}],
  ['readPendingInvoices', readPendingInvoices, 'view_accounting', {}],
] as const)('%s permission binding', (_name, tool, requiredPermission, input) => {
  beforeEach(() => {
    getServerSession.mockReset();
  });

  it(`is denied for a session holding an unrelated permission (not ${requiredPermission})`, async () => {
    getServerSession.mockResolvedValue(sessionWithOnly('some_unrelated_permission'));

    const result = await tool.execute!(input as any, fakeCallOptions);

    expect(result).toEqual({ error: 'permission_denied', permission: requiredPermission });
  });

  it('is denied when there is no session', async () => {
    getServerSession.mockResolvedValue(null);

    const result = await tool.execute!(input as any, fakeCallOptions);

    expect(result).toEqual({ error: 'unauthorized' });
  });
});
