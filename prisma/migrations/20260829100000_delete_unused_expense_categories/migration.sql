-- Data-only. These placeholder categories (Rent, Marketing, etc.) were
-- deactivated in favor of the company's real category list (see
-- 20260829090100_seed_expense_categories) but left in place rather than
-- deleted, in case any expense/budget already referenced one.
--
-- Now removing them outright per explicit request — but only where it's
-- actually safe: a category with zero dependent expenses/budgets can be
-- deleted with no data loss and no FK violation. Any category that still
-- has real history is deliberately left behind (already inactive, so it
-- never shows in the app) rather than cascading the delete and losing
-- that financial data.
DELETE FROM expense_categories ec
WHERE ec.name IN ('Rent', 'Utilities', 'Marketing', 'Travel', 'Office Supplies', 'Software & Subscriptions', 'Professional Fees', 'Miscellaneous')
  AND NOT EXISTS (SELECT 1 FROM expenses e WHERE e.category_id = ec.id)
  AND NOT EXISTS (SELECT 1 FROM expense_budgets b WHERE b.category_id = ec.id);
