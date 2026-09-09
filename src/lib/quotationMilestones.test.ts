import { describe, it, expect } from 'vitest';
import { validateMilestonePlan, materializeMilestonePlan } from './quotationMilestones';

describe('validateMilestonePlan', () => {
  it('accepts an empty plan (milestones are optional)', () => {
    expect(validateMilestonePlan([])).toBeNull();
  });

  it('accepts percentages that add up to exactly 100', () => {
    expect(validateMilestonePlan([{ percentage: 50, gapDays: 0 }, { percentage: 50, gapDays: 15 }])).toBeNull();
  });

  it('tolerates rounding dust (33.33 x2 + 33.34)', () => {
    const plan = [{ percentage: 33.33, gapDays: 0 }, { percentage: 33.33, gapDays: 15 }, { percentage: 33.34, gapDays: 20 }];
    expect(validateMilestonePlan(plan)).toBeNull();
  });

  it('rejects percentages that do not add up to 100', () => {
    expect(validateMilestonePlan([{ percentage: 40, gapDays: 0 }, { percentage: 40, gapDays: 15 }])).toMatch(/100/);
  });

  it('rejects a non-positive percentage', () => {
    expect(validateMilestonePlan([{ percentage: 0, gapDays: 0 }])).toMatch(/greater than 0/);
  });

  it('rejects a negative gap on a non-first milestone', () => {
    expect(validateMilestonePlan([{ percentage: 50, gapDays: 0 }, { percentage: 50, gapDays: -5 }])).toMatch(/gap/);
  });

  it('ignores milestone 1\'s own gapDays', () => {
    expect(validateMilestonePlan([{ percentage: 100, gapDays: -999 }])).toBeNull();
  });
});

describe('materializeMilestonePlan', () => {
  const approvalDate = new Date('2026-01-01T00:00:00.000Z');

  it('schedules milestone 1 on the approval date itself, regardless of its gapDays', () => {
    const [m1] = materializeMilestonePlan([{ percentage: 100, gapDays: 999 }], 1000, approvalDate);
    expect(m1.scheduledDate.toISOString()).toBe(approvalDate.toISOString());
    expect(m1.gapDays).toBe(0);
  });

  it('accumulates gapDays off the PRECEDING milestone, not off approval', () => {
    const plan = [{ percentage: 50, gapDays: 0 }, { percentage: 30, gapDays: 15 }, { percentage: 20, gapDays: 20 }];
    const [m1, m2, m3] = materializeMilestonePlan(plan, 1000, approvalDate);
    expect(m1.scheduledDate.toISOString().slice(0, 10)).toBe('2026-01-01');
    expect(m2.scheduledDate.toISOString().slice(0, 10)).toBe('2026-01-16'); // +15
    expect(m3.scheduledDate.toISOString().slice(0, 10)).toBe('2026-02-05'); // +15+20
  });

  it('the last milestone absorbs the rounding remainder so amounts sum exactly', () => {
    const plan = [{ percentage: 33.33, gapDays: 0 }, { percentage: 33.33, gapDays: 15 }, { percentage: 33.34, gapDays: 20 }];
    const schedule = materializeMilestonePlan(plan, 100, approvalDate);
    const sum = schedule.reduce((s, m) => s + m.amount, 0);
    expect(Math.round(sum * 100) / 100).toBe(100);
  });

  it('assigns sequence numbers 1-based in order', () => {
    const plan = [{ percentage: 50, gapDays: 0 }, { percentage: 50, gapDays: 10 }];
    const schedule = materializeMilestonePlan(plan, 1000, approvalDate);
    expect(schedule.map((m) => m.sequence)).toEqual([1, 2]);
  });
});
