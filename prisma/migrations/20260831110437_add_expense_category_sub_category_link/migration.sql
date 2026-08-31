-- CreateTable
CREATE TABLE "expense_category_sub_category_links" (
    "id" SERIAL NOT NULL,
    "category_id" INTEGER NOT NULL,
    "sub_category_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_category_sub_category_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "expense_category_sub_category_links_category_id_idx" ON "expense_category_sub_category_links"("category_id");

-- CreateIndex
CREATE INDEX "expense_category_sub_category_links_sub_category_id_idx" ON "expense_category_sub_category_links"("sub_category_id");

-- CreateIndex
CREATE UNIQUE INDEX "expense_category_sub_category_links_category_id_sub_categor_key" ON "expense_category_sub_category_links"("category_id", "sub_category_id");

-- AddForeignKey
ALTER TABLE "expense_category_sub_category_links" ADD CONSTRAINT "expense_category_sub_category_links_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_category_sub_category_links" ADD CONSTRAINT "expense_category_sub_category_links_sub_category_id_fkey" FOREIGN KEY ("sub_category_id") REFERENCES "expense_sub_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
