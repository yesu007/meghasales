import { describe, it, expect } from 'vitest';
import { allocationCheck, computeVerticalWeightage } from './salaryAllocation';

describe('allocationCheck', () => {
  it('is OK at exactly 100%', () => {
    expect(allocationCheck(100)).toBe('OK');
  });
  it('tolerates rounding dust around 100', () => {
    expect(allocationCheck(99.999)).toBe('OK');
  });
  it('is SHARED at 0% — a deliberate overhead row, not a gap', () => {
    expect(allocationCheck(0)).toBe('SHARED');
  });
  it('is MISMATCH for anything else', () => {
    expect(allocationCheck(60)).toBe('MISMATCH');
  });
});

describe('computeVerticalWeightage', () => {
  const keys = ['AI', 'RETAIL'];

  it("splits each employee's salary across verticals by their own percentage", () => {
    const result = computeVerticalWeightage(
      [{ monthlySalary: 100000, splits: [{ verticalKey: 'AI', percentage: 60 }, { verticalKey: 'RETAIL', percentage: 40 }] }],
      keys
    );
    expect(result.find((r) => r.verticalKey === 'AI')?.allocatedAmount).toBe(60000);
    expect(result.find((r) => r.verticalKey === 'RETAIL')?.allocatedAmount).toBe(40000);
    expect(result.find((r) => r.verticalKey === 'AI')?.weightagePct).toBe(60);
    expect(result.find((r) => r.verticalKey === 'RETAIL')?.weightagePct).toBe(40);
  });

  it('excludes a fully-unallocated (0%) employee from the weightage entirely', () => {
    const result = computeVerticalWeightage(
      [
        { monthlySalary: 100000, splits: [{ verticalKey: 'AI', percentage: 100 }] },
        { monthlySalary: 10000, splits: [{ verticalKey: 'AI', percentage: 0 }, { verticalKey: 'RETAIL', percentage: 0 }] },
      ],
      keys
    );
    expect(result.find((r) => r.verticalKey === 'AI')?.weightagePct).toBe(100);
    expect(result.find((r) => r.verticalKey === 'RETAIL')?.weightagePct).toBe(0);
  });

  it('returns 0% weightage everywhere when nothing is allocated', () => {
    const result = computeVerticalWeightage([], keys);
    expect(result.every((r) => r.weightagePct === 0)).toBe(true);
  });
});
