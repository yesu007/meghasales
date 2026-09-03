import { describe, it, expect } from 'vitest';
import { salaryAfterIncrement, allocationCheck, computeCategoryWeightage } from './salaryAllocation';

describe('salaryAfterIncrement', () => {
  it('sums both inputs', () => {
    expect(salaryAfterIncrement(80000, 10000)).toBe(90000);
  });
  it('treats a missing max salary as 0', () => {
    expect(salaryAfterIncrement(null, 3000)).toBe(3000);
  });
  it('treats a missing increment as 0', () => {
    expect(salaryAfterIncrement(123500, null)).toBe(123500);
  });
});

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

describe('computeCategoryWeightage', () => {
  const categories = [
    { id: 1, name: 'Megha', code: 'MEGHA' },
    { id: 2, name: 'Retail', code: 'RETAIL' },
  ];

  it('splits each resource\'s salary across categories by its own percentage', () => {
    const result = computeCategoryWeightage(
      [{ salaryAfterIncrement: 100000, splits: [{ categoryId: 1, percentage: 60 }, { categoryId: 2, percentage: 40 }] }],
      categories
    );
    expect(result.find((r) => r.code === 'MEGHA')?.allocatedAmount).toBe(60000);
    expect(result.find((r) => r.code === 'RETAIL')?.allocatedAmount).toBe(40000);
    expect(result.find((r) => r.code === 'MEGHA')?.weightagePct).toBe(60);
    expect(result.find((r) => r.code === 'RETAIL')?.weightagePct).toBe(40);
  });

  it('excludes a fully-unallocated (0%) resource from the weightage entirely', () => {
    const result = computeCategoryWeightage(
      [
        { salaryAfterIncrement: 100000, splits: [{ categoryId: 1, percentage: 100 }] },
        { salaryAfterIncrement: 10000, splits: [{ categoryId: 1, percentage: 0 }, { categoryId: 2, percentage: 0 }] },
      ],
      categories
    );
    expect(result.find((r) => r.code === 'MEGHA')?.weightagePct).toBe(100);
    expect(result.find((r) => r.code === 'RETAIL')?.weightagePct).toBe(0);
  });

  it('returns 0% weightage everywhere when nothing is allocated', () => {
    const result = computeCategoryWeightage([], categories);
    expect(result.every((r) => r.weightagePct === 0)).toBe(true);
  });
});
