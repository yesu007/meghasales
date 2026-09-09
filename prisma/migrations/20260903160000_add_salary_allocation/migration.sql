-- CreateTable
CREATE TABLE "allocation_categories" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "allocation_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_resources" (
    "id" SERIAL NOT NULL,
    "resource_type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "max_salary" DECIMAL(15,2),
    "increment_provision" DECIMAL(15,2),
    "remark" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salary_resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_allocation_splits" (
    "id" SERIAL NOT NULL,
    "resource_id" INTEGER NOT NULL,
    "category_id" INTEGER NOT NULL,
    "percentage" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "salary_allocation_splits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "allocation_categories_name_key" ON "allocation_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "allocation_categories_code_key" ON "allocation_categories"("code");

-- CreateIndex
CREATE INDEX "salary_resources_sort_order_idx" ON "salary_resources"("sort_order");

-- CreateIndex
CREATE INDEX "salary_allocation_splits_category_id_idx" ON "salary_allocation_splits"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "salary_allocation_splits_resource_id_category_id_key" ON "salary_allocation_splits"("resource_id", "category_id");

-- AddForeignKey
ALTER TABLE "salary_resources" ADD CONSTRAINT "salary_resources_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_allocation_splits" ADD CONSTRAINT "salary_allocation_splits_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "salary_resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_allocation_splits" ADD CONSTRAINT "salary_allocation_splits_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "allocation_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
