-- Seeds the Country Master directly in SQL (idempotent, mirrors
-- prisma/seed.ts so this migration is self-sufficient in any environment
-- regardless of whether the seed script has run), then backfills existing
-- company_profile/leads rows to reference it. This is hand-written rather
-- than Prisma-generated because it needs cross-row lookups (matching a
-- lead's free-text country name to a countries row) that declarative
-- migrations can't express — same rationale as the invoice_number_seq
-- migration. Every statement is scoped to rows that still need it, so this
-- is safe to re-run.

INSERT INTO "countries" ("country_name", "iso_code", "currency_code", "currency_name", "currency_symbol", "default_tax_type", "default_tax_percentage", "flag_emoji", "is_active", "created_at", "updated_at")
VALUES
  ('India', 'IN', 'INR', 'Indian Rupee', '₹', 'GST', 18, '🇮🇳', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('United States', 'US', 'USD', 'US Dollar', '$', 'NONE', 0, '🇺🇸', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('United Arab Emirates', 'AE', 'AED', 'UAE Dirham', 'AED', 'VAT', 5, '🇦🇪', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('Thailand', 'TH', 'THB', 'Thai Baht', '฿', 'VAT', 7, '🇹🇭', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('United Kingdom', 'GB', 'GBP', 'British Pound', '£', 'VAT', 20, '🇬🇧', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('Singapore', 'SG', 'SGD', 'Singapore Dollar', 'SGD', 'GST', 9, '🇸🇬', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('Saudi Arabia', 'SA', 'SAR', 'Saudi Riyal', 'SAR', 'VAT', 15, '🇸🇦', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("iso_code") DO NOTHING;

-- Default the company's home country to India if not already set.
UPDATE "company_profile"
SET "default_country_id" = (SELECT "id" FROM "countries" WHERE "iso_code" = 'IN')
WHERE "id" = 1 AND "default_country_id" IS NULL;

-- Backfill existing leads by matching their free-text country name
-- (case-insensitive, trimmed) against the new Country Master.
UPDATE "leads" l
SET
  "country_id" = c."id",
  "currency_code" = c."currency_code",
  "currency_symbol" = c."currency_symbol",
  "tax_type" = c."default_tax_type"
FROM "countries" c
WHERE l."country_id" IS NULL
  AND l."country" IS NOT NULL
  AND lower(trim(l."country")) = lower(c."country_name");

-- Any remaining unmatched/blank leads fall back to the configured default
-- country (or India, if company_profile has none set for any reason).
UPDATE "leads" l
SET
  "country_id" = fc."id",
  "currency_code" = fc."currency_code",
  "currency_symbol" = fc."currency_symbol",
  "tax_type" = fc."default_tax_type"
FROM (
  SELECT COALESCE(
    (SELECT "default_country_id" FROM "company_profile" WHERE "id" = 1),
    (SELECT "id" FROM "countries" WHERE "iso_code" = 'IN')
  ) AS "fallback_id"
) AS f
JOIN "countries" fc ON fc."id" = f."fallback_id"
WHERE l."country_id" IS NULL;
