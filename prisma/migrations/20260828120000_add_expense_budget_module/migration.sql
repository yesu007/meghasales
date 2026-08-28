-- CreateTable
CREATE TABLE "verticals" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verticals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_budgets" (
    "id" SERIAL NOT NULL,
    "financial_year_start" TIMESTAMP(3) NOT NULL,
    "financial_year_end" TIMESTAMP(3) NOT NULL,
    "vertical_id" INTEGER,
    "category_id" INTEGER NOT NULL,
    "total_amount" DECIMAL(15,2) NOT NULL,
    "currency_code" TEXT NOT NULL DEFAULT 'INR',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "approved_by" INTEGER,
    "approved_at" TIMESTAMP(3),
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_budget_months" (
    "id" SERIAL NOT NULL,
    "budget_id" INTEGER NOT NULL,
    "month" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,

    CONSTRAINT "expense_budget_months_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_budget_revisions" (
    "id" SERIAL NOT NULL,
    "budget_id" INTEGER NOT NULL,
    "previous_amount" DECIMAL(15,2) NOT NULL,
    "new_amount" DECIMAL(15,2) NOT NULL,
    "reason" TEXT,
    "revised_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_budget_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "verticals_name_key" ON "verticals"("name");

-- CreateIndex
CREATE UNIQUE INDEX "verticals_code_key" ON "verticals"("code");

-- CreateIndex
CREATE INDEX "expense_budgets_vertical_id_idx" ON "expense_budgets"("vertical_id");

-- CreateIndex
CREATE INDEX "expense_budgets_category_id_idx" ON "expense_budgets"("category_id");

-- CreateIndex
CREATE INDEX "expense_budgets_status_idx" ON "expense_budgets"("status");

-- CreateIndex
CREATE UNIQUE INDEX "expense_budgets_financial_year_start_vertical_id_category_i_key" ON "expense_budgets"("financial_year_start", "vertical_id", "category_id");

-- CreateIndex
CREATE UNIQUE INDEX "expense_budget_months_budget_id_month_key" ON "expense_budget_months"("budget_id", "month");

-- AddForeignKey
ALTER TABLE "expense_budgets" ADD CONSTRAINT "expense_budgets_vertical_id_fkey" FOREIGN KEY ("vertical_id") REFERENCES "verticals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_budgets" ADD CONSTRAINT "expense_budgets_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_budgets" ADD CONSTRAINT "expense_budgets_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_budgets" ADD CONSTRAINT "expense_budgets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_budget_months" ADD CONSTRAINT "expense_budget_months_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "expense_budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_budget_revisions" ADD CONSTRAINT "expense_budget_revisions_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "expense_budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_budget_revisions" ADD CONSTRAINT "expense_budget_revisions_revised_by_fkey" FOREIGN KEY ("revised_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
