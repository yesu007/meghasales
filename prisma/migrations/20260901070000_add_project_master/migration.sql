-- CreateTable
-- Project master — new Masters tab alongside Vertical/Package: a Customer
-- (Lead) + Vertical pairing with a responsible Head and Budget. Soft
-- -deleted (is_active) rather than hard-deleted, same convention as
-- verticals/packages.
CREATE TABLE "projects" (
    "id" SERIAL NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "vertical_id" INTEGER NOT NULL,
    "head_id" INTEGER,
    "budget" DECIMAL(15,2),
    "budget_currency_code" TEXT DEFAULT 'INR',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "projects_customer_id_idx" ON "projects"("customer_id");

-- CreateIndex
CREATE INDEX "projects_vertical_id_idx" ON "projects"("vertical_id");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_vertical_id_fkey" FOREIGN KEY ("vertical_id") REFERENCES "verticals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_head_id_fkey" FOREIGN KEY ("head_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Permissions — Project is a general-purpose master like Vertical/Package;
-- view_projects mirrors view_verticals' broad roster (every role that
-- touches leads/projects/deals), manage_projects mirrors manage_verticals'
-- ADMIN/MANAGEMENT-only roster.
INSERT INTO permissions (name, description, module)
VALUES
  ('view_projects', 'View the project master list', 'PROJECTS'),
  ('manage_projects', 'Create/edit/deactivate projects', 'PROJECTS')
ON CONFLICT (name) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE p.name = 'view_projects'
  AND r.name IN ('ADMIN', 'MANAGEMENT', 'FINANCE', 'BUSINESS_ANALYST', 'SALES', 'DEMO_TEAM')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE p.name = 'manage_projects'
  AND r.name IN ('ADMIN', 'MANAGEMENT')
ON CONFLICT (role_id, permission_id) DO NOTHING;
