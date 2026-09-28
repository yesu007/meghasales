import { describe, expect, it } from 'vitest';
import { hasAnyPermission, hasPermission } from './permissions';

describe('hasPermission', () => {
  it('grants only permissions the roles actually hold', () => {
    expect(hasPermission(['SALES'], ['view_leads'], 'view_leads')).toBe(true);
    expect(hasPermission(['SALES'], ['view_leads'], 'edit_leads')).toBe(false);
  });

  it('gives ADMIN no automatic bypass', () => {
    expect(hasPermission(['ADMIN'], [], 'view_verticals')).toBe(false);
    expect(hasPermission(['ADMIN'], ['view_verticals'], 'view_verticals')).toBe(true);
    expect(hasAnyPermission(['ADMIN'], ['view_leads'], ['create_verticals', 'edit_verticals'])).toBe(false);
  });

  it('passes hasAnyPermission when any listed permission is held', () => {
    expect(hasAnyPermission(['FINANCE'], ['edit_customers'], ['edit_leads', 'edit_customers'])).toBe(true);
  });
});
