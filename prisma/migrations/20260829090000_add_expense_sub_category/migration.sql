-- CreateTable
CREATE TABLE "expense_sub_categories" (
    "id" SERIAL NOT NULL,
    "category_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_sub_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "expense_sub_categories_category_id_idx" ON "expense_sub_categories"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "expense_sub_categories_category_id_name_key" ON "expense_sub_categories"("category_id", "name");

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN "sub_category_id" INTEGER;

-- CreateIndex
CREATE INDEX "expenses_sub_category_id_idx" ON "expenses"("sub_category_id");

-- AddForeignKey
ALTER TABLE "expense_sub_categories" ADD CONSTRAINT "expense_sub_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_sub_category_id_fkey" FOREIGN KEY ("sub_category_id") REFERENCES "expense_sub_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
