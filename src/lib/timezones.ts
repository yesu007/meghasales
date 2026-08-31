// Curated list rather than the full IANA database — covers the countries
// Tekfilo's legal entities/customers actually operate in (India, Hong Kong,
// China, Gulf, Singapore, UK, US, Australia) plus UTC as a neutral fallback.
export const TIMEZONES = [
  { value: 'Asia/Kolkata', label: 'India (IST, UTC+5:30)', short: 'IST' },
  { value: 'Asia/Dubai', label: 'Gulf (GST, UTC+4:00)', short: 'GST' },
  { value: 'Asia/Hong_Kong', label: 'Hong Kong (HKT, UTC+8:00)', short: 'HKT' },
  { value: 'Asia/Shanghai', label: 'China (CST, UTC+8:00)', short: 'CST' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT, UTC+8:00)', short: 'SGT' },
  { value: 'Europe/London', label: 'United Kingdom (GMT/BST)', short: 'UK' },
  { value: 'America/New_York', label: 'US Eastern (ET)', short: 'ET' },
  { value: 'America/Los_Angeles', label: 'US Pacific (PT)', short: 'PT' },
  { value: 'Australia/Sydney', label: 'Australia Eastern (AET)', short: 'AET' },
  { value: 'UTC', label: 'UTC', short: 'UTC' },
] as const;

export const DEFAULT_TIMEZONE = 'Asia/Kolkata';

export function timezoneShortLabel(tz: string | null | undefined): string {
  if (!tz) return '';
  return TIMEZONES.find((t) => t.value === tz)?.short || tz;
}
