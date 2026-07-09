-- CreateTable
CREATE TABLE "roles" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "module" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" INTEGER NOT NULL,
    "permission_id" INTEGER NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "phone" TEXT,
    "avatar_url" TEXT,
    "role_id" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" SERIAL NOT NULL,
    "company_name" TEXT NOT NULL,
    "contact_person" TEXT NOT NULL,
    "mobile" TEXT,
    "email" TEXT,
    "country" TEXT,
    "state" TEXT,
    "city" TEXT,
    "jewellery_business_type" TEXT,
    "number_of_branches" INTEGER,
    "existing_erp" TEXT,
    "lead_source" TEXT NOT NULL,
    "assigned_ba_id" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "business_verticals" TEXT,
    "notes" TEXT,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_activities" (
    "id" SERIAL NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "activity_type" TEXT NOT NULL,
    "description" TEXT,
    "performed_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "demos" (
    "id" SERIAL NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "demo_type" TEXT NOT NULL,
    "assigned_to" INTEGER,
    "scheduled_date" TIMESTAMP(3),
    "actual_date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "attendees" TEXT,
    "modules_demonstrated" TEXT,
    "customer_interest_level" TEXT,
    "questions" TEXT,
    "next_action" TEXT,
    "feedback" TEXT,
    "recording_url" TEXT,
    "stakeholder_feedback" TEXT,
    "approval_status" TEXT DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "demos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotations" (
    "id" SERIAL NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "quotation_number" TEXT NOT NULL,
    "software_modules" JSONB,
    "business_module" TEXT,
    "implementation_cost" DECIMAL(15,2),
    "training_cost" DECIMAL(15,2),
    "annual_maintenance" DECIMAL(15,2),
    "custom_development_cost" DECIMAL(15,2),
    "discount_percentage" DECIMAL(5,2),
    "discount_amount" DECIMAL(15,2),
    "tax_percentage" DECIMAL(5,2),
    "tax_amount" DECIMAL(15,2),
    "total_amount" DECIMAL(15,2),
    "valid_until" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "client_country" TEXT,
    "client_state" TEXT,
    "client_city" TEXT,
    "currency_code" TEXT DEFAULT 'INR',
    "exchange_rate" DECIMAL(15,6) DEFAULT 1,
    "tax_breakdown" JSONB,
    "addons" JSONB,
    "pricing_snapshot" JSONB,
    "notes" TEXT,
    "created_by" INTEGER,
    "approved_by" INTEGER,
    "customer_approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "implementations" (
    "id" SERIAL NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "project_name" TEXT,
    "project_manager_id" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PLANNING',
    "start_date" TIMESTAMP(3),
    "target_end_date" TIMESTAMP(3),
    "actual_end_date" TIMESTAMP(3),
    "current_stage" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "implementations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_module_config" (
    "id" SERIAL NOT NULL,
    "module_code" TEXT NOT NULL,
    "module_name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "default_currency" TEXT NOT NULL DEFAULT 'INR',
    "default_country" TEXT NOT NULL DEFAULT 'IN',
    "base_license_cost" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "additional_user_cost" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "additional_branch_cost" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "additional_company_cost" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "implementation_cost" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "data_migration_cost" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "training_cost" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "custom_development_cost" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "cloud_hosting_cost" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "annual_maintenance_cost" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "support_charges" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "one_time_setup_fee" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "included_users" INTEGER NOT NULL DEFAULT 5,
    "included_branches" INTEGER NOT NULL DEFAULT 1,
    "included_companies" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotation_module_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_addon_config" (
    "id" SERIAL NOT NULL,
    "addon_code" TEXT NOT NULL,
    "addon_name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotation_addon_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "country_tax_master" (
    "id" SERIAL NOT NULL,
    "country_code" TEXT NOT NULL,
    "country_name" TEXT NOT NULL,
    "tax_name" TEXT NOT NULL,
    "tax_type" TEXT NOT NULL,
    "default_rate" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "effective_from" TIMESTAMP(3),
    "effective_to" TIMESTAMP(3),
    "currency_code" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "country_tax_master_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "state_tax_master" (
    "id" SERIAL NOT NULL,
    "country_code" TEXT NOT NULL,
    "state_code" TEXT NOT NULL,
    "state_name" TEXT NOT NULL,
    "tax_name" TEXT NOT NULL,
    "tax_type" TEXT NOT NULL,
    "rate" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "effective_from" TIMESTAMP(3),
    "effective_to" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "state_tax_master_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "currency_master" (
    "id" SERIAL NOT NULL,
    "currency_code" TEXT NOT NULL,
    "currency_name" TEXT NOT NULL,
    "currency_symbol" TEXT NOT NULL,
    "decimal_places" INTEGER NOT NULL DEFAULT 2,
    "exchange_rate_to_inr" DECIMAL(15,6) NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "currency_master_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_profile" (
    "id" SERIAL NOT NULL,
    "company_name" TEXT NOT NULL,
    "tagline" TEXT,
    "logo_url" TEXT,
    "address_line1" TEXT,
    "address_line2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT,
    "postal_code" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "gst_number" TEXT,
    "pan_number" TEXT,
    "bank_name" TEXT,
    "bank_account_number" TEXT,
    "bank_ifsc" TEXT,
    "authorized_signatory" TEXT,
    "signatory_designation" TEXT,
    "primary_color" TEXT DEFAULT '#1E3A5F',
    "secondary_color" TEXT DEFAULT '#D4AF37',
    "terms_and_conditions" TEXT,
    "payment_terms" TEXT,
    "warranty_terms" TEXT,
    "assumptions" TEXT,
    "exclusions" TEXT,
    "confidentiality_notice" TEXT,
    "supplier_state_code" TEXT DEFAULT 'TN',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT,
    "type" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" INTEGER,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "status_master" (
    "id" SERIAL NOT NULL,
    "module" TEXT NOT NULL,
    "status_value" TEXT NOT NULL,
    "display_label" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "color" TEXT,
    "description" TEXT,

    CONSTRAINT "status_master_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "action" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" INTEGER,
    "old_value" JSONB,
    "new_value" JSONB,
    "ip_address" TEXT,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_name_key" ON "permissions"("name");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "quotations_quotation_number_key" ON "quotations"("quotation_number");

-- CreateIndex
CREATE UNIQUE INDEX "quotation_module_config_module_code_key" ON "quotation_module_config"("module_code");

-- CreateIndex
CREATE UNIQUE INDEX "quotation_addon_config_addon_code_key" ON "quotation_addon_config"("addon_code");

-- CreateIndex
CREATE UNIQUE INDEX "country_tax_master_country_code_tax_name_effective_from_key" ON "country_tax_master"("country_code", "tax_name", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "state_tax_master_country_code_state_code_tax_name_effective_key" ON "state_tax_master"("country_code", "state_code", "tax_name", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "currency_master_currency_code_key" ON "currency_master"("currency_code");

-- CreateIndex
CREATE UNIQUE INDEX "status_master_module_status_value_key" ON "status_master"("module", "status_value");

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_ba_id_fkey" FOREIGN KEY ("assigned_ba_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demos" ADD CONSTRAINT "demos_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demos" ADD CONSTRAINT "demos_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "implementations" ADD CONSTRAINT "implementations_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "implementations" ADD CONSTRAINT "implementations_project_manager_id_fkey" FOREIGN KEY ("project_manager_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
