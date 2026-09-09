import { describe, it, expect, vi, beforeEach } from 'vitest';

// getOwnershipFilter is the data-scope boundary closing the audit gap
// ("Vertical/ownership-based data access... aren't enforced") — every case
// here maps directly to a real access scenario (a BA seeing only their own
// leads, a Demo Team member not being scoped by a field that isn't theirs,
// oversight roles always seeing everything) rather than just exercising the
// code path.
const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock('next-auth/next', () => ({ getServerSession }));

import { getOwnershipFilter } from './rbac';

const sessionWithRoles = (roles: string[], id = '7') => ({ user: { id, roles, permissions: [] } });

describe('getOwnershipFilter', () => {
  beforeEach(() => {
    getServerSession.mockReset();
  });

  it('scopes a role whose job the ownership field is to their own rows plus unassigned ones', async () => {
    getServerSession.mockResolvedValue(sessionWithRoles(['BUSINESS_ANALYST']));

    const filter = await getOwnershipFilter('assignedBaId', ['BUSINESS_ANALYST', 'SALES']);

    expect(filter).toEqual({ OR: [{ assignedBaId: 7 }, { assignedBaId: null }] });
  });

  it('leaves a role not in scopedRoles unrestricted (e.g. DEMO_TEAM viewing leads by assignedBaId)', async () => {
    getServerSession.mockResolvedValue(sessionWithRoles(['DEMO_TEAM']));

    const filter = await getOwnershipFilter('assignedBaId', ['BUSINESS_ANALYST', 'SALES']);

    expect(filter).toBeNull();
  });

  it('never restricts an ADMIN, even if ADMIN is also passed as a scoped role', async () => {
    getServerSession.mockResolvedValue(sessionWithRoles(['ADMIN']));

    const filter = await getOwnershipFilter('assignedBaId', ['ADMIN']);

    expect(filter).toBeNull();
  });

  it('never restricts MANAGEMENT (default broad role)', async () => {
    getServerSession.mockResolvedValue(sessionWithRoles(['MANAGEMENT']));

    const filter = await getOwnershipFilter('assignedToId', ['DEMO_TEAM']);

    expect(filter).toBeNull();
  });

  it('a broad role wins over a scoped role held by the same multi-role user', async () => {
    getServerSession.mockResolvedValue(sessionWithRoles(['SALES', 'MANAGEMENT']));

    const filter = await getOwnershipFilter('assignedBaId', ['SALES']);

    expect(filter).toBeNull();
  });

  it('respects a custom broadRoles list instead of the ADMIN/MANAGEMENT default', async () => {
    getServerSession.mockResolvedValue(sessionWithRoles(['FINANCE']));

    const filter = await getOwnershipFilter('projectManagerId', ['FINANCE'], ['ADMIN', 'FINANCE']);

    expect(filter).toBeNull();
  });

  it('returns null when there is no session', async () => {
    getServerSession.mockResolvedValue(null);

    const filter = await getOwnershipFilter('assignedBaId', ['BUSINESS_ANALYST']);

    expect(filter).toBeNull();
  });

  it('returns null when the session user id is not a valid number', async () => {
    getServerSession.mockResolvedValue(sessionWithRoles(['BUSINESS_ANALYST'], 'not-a-number'));

    const filter = await getOwnershipFilter('assignedBaId', ['BUSINESS_ANALYST']);

    expect(filter).toBeNull();
  });
});
