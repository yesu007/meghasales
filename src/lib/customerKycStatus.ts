// Customer KYC verification status — same {value,label,color} pattern as
// src/lib/leadStatus.ts, kept as its own file since this is a distinct
// status system (not the Lead pipeline status), per business requirement.
export const KYC_VERIFICATION_STATUSES = [
  { value: 'PENDING', label: 'Pending', color: 'bg-slate-100 text-slate-700' },
  { value: 'VERIFIED', label: 'Verified', color: 'bg-green-100 text-green-700' },
  { value: 'REJECTED', label: 'Rejected', color: 'bg-red-100 text-red-700' },
  { value: 'EXPIRED', label: 'Expired', color: 'bg-orange-100 text-orange-700' },
];

export function kycVerificationStatusColor(status: string): string {
  return KYC_VERIFICATION_STATUSES.find((s) => s.value === status)?.color || 'bg-slate-100 text-slate-700';
}

export function kycVerificationStatusLabel(status: string): string {
  return KYC_VERIFICATION_STATUSES.find((s) => s.value === status)?.label || status;
}
