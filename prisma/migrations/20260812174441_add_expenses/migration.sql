-- CreateTable
CREATE TABLE "expense_categories" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" SERIAL NOT NULL,
    "expense_number" TEXT NOT NULL,
    "category_id" INTEGER NOT NULL,
    "vendor" TEXT,
    "expense_date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency_code" TEXT NOT NULL DEFAULT 'INR',
    "exchange_rate" DECIMAL(15,6) NOT NULL DEFAULT 1,
    "payment_method" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paid_date" TIMESTAMP(3),
    "reference_number" TEXT,
    "attachment_url" TEXT,
    "attachment_name" TEXT,
    "notes" TEXT,
    "recorded_by" INTEGER,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "expense_categories_name_key" ON "expense_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_expense_number_key" ON "expenses"("expense_number");

-- CreateIndex
CREATE INDEX "expenses_status_idx" ON "expenses"("status");

-- CreateIndex
CREATE INDEX "expenses_category_id_idx" ON "expenses"("category_id");

-- CreateIndex
CREATE INDEX "expenses_expense_date_idx" ON "expenses"("expense_date");

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Atomic expense-number generator, same reasoning as invoice_number_seq
-- (see 20260716120000_add_invoice_number_sequence): a count()-based scheme
-- races under concurrent creation, nextval() can't collide. No backfill
-- needed — this is a brand-new table.
CREATE SEQUENCE IF NOT EXISTS expense_number_seq;

-- Starter categories so a fresh install isn't starting with an empty,
-- unusable category dropdown — same convention as the Leave Types seed
-- in 20260814090100_seed_leave_permission_and_types.
INSERT INTO expense_categories (name, sort_order, updated_at)
SELECT v.name, v.sort_order, CURRENT_TIMESTAMP
FROM (VALUES
  ('Rent', 0),
  ('Utilities', 1),
  ('Marketing', 2),
  ('Travel', 3),
  ('Office Supplies', 4),
  ('Software & Subscriptions', 5),
  ('Professional Fees', 6),
  ('Miscellaneous', 7)
) AS v(name, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM expense_categories WHERE name = v.name);
