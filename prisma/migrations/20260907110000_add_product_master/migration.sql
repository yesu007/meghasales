-- CreateTable
-- Product master — same shape/convention as the Project master
-- (prisma/migrations/20260901070000_add_project_master), a separate table
-- rather than a sub-type of Project. customer_id is nullable from the
-- start (Project's own column started NOT NULL and was relaxed later in
-- 20260905090000_make_project_customer_optional — Product just begins in
-- that already-relaxed shape).
CREATE TABLE "products" (
    "id" SERIAL NOT NULL,
    "product_name" TEXT NOT NULL,
    "customer_id" INTEGER,
    "lead_id" INTEGER,
    "vertical_id" INTEGER NOT NULL,
    "head_id" INTEGER,
    "budget" DECIMAL(15,2),
    "budget_currency_code" TEXT DEFAULT 'INR',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "products_customer_id_idx" ON "products"("customer_id");

-- CreateIndex
CREATE INDEX "products_lead_id_idx" ON "products"("lead_id");

-- CreateIndex
CREATE INDEX "products_vertical_id_idx" ON "products"("vertical_id");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_vertical_id_fkey" FOREIGN KEY ("vertical_id") REFERENCES "verticals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_head_id_fkey" FOREIGN KEY ("head_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Permissions — Product is a general-purpose master like Project/Vertical;
-- view_products mirrors view_projects' roster, manage_products mirrors
-- manage_projects' ADMIN/MANAGEMENT-only roster.
INSERT INTO permissions (name, description, module)
VALUES
  ('view_products', 'View the product master list', 'PRODUCTS'),
  ('manage_products', 'Create/edit/deactivate products', 'PRODUCTS')
ON CONFLICT (name) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE p.name = 'view_products'
  AND r.name IN ('ADMIN', 'MANAGEMENT', 'FINANCE', 'BUSINESS_ANALYST', 'SALES', 'DEMO_TEAM')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE p.name = 'manage_products'
  AND r.name IN ('ADMIN', 'MANAGEMENT')
ON CONFLICT (role_id, permission_id) DO NOTHING;
