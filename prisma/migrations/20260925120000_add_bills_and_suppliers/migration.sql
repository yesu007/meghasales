-- Bill & Expense Management: vendor bills keyed in manually (no OCR), a
-- Supplier master, per-sub-category GST type / TDS %, and a unique
-- expenses.bill_id linking each posted bill to its one auto-created
-- BILL expense.

-- Sub-category tax treatment
ALTER TABLE "expense_sub_categories" ADD COLUMN "gst_type" TEXT NOT NULL DEFAULT 'INPUT';
ALTER TABLE "expense_sub_categories" ADD COLUMN "tds_applicable" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "expense_sub_categories" ADD COLUMN "tds_percent" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- Suppliers
CREATE TABLE "suppliers" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "gstin" TEXT,
    "pan" TEXT,
    "address" TEXT,
    "state_code" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "suppliers_gstin_key" ON "suppliers"("gstin");
CREATE INDEX "suppliers_name_idx" ON "suppliers"("name");

-- Bills
CREATE TABLE "bills" (
    "id" SERIAL NOT NULL,
    "bill_number" TEXT NOT NULL,
    "bill_type" TEXT NOT NULL,
    "supplier_id" INTEGER NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "invoice_date" TIMESTAMP(3) NOT NULL,
    "category_id" INTEGER NOT NULL,
    "item_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cgst_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sgst_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "igst_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "gst_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tds_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "payable_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "payment_status" TEXT NOT NULL DEFAULT 'UNPAID',
    "paid_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paid_date" TIMESTAMP(3),
    "payment_method" TEXT,
    "attachment_url" TEXT,
    "attachment_name" TEXT,
    "notes" TEXT,
    "posted_at" TIMESTAMP(3),
    "created_by" INTEGER,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bills_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "bills_bill_number_key" ON "bills"("bill_number");
CREATE INDEX "bills_supplier_id_idx" ON "bills"("supplier_id");
CREATE INDEX "bills_category_id_idx" ON "bills"("category_id");
CREATE INDEX "bills_status_idx" ON "bills"("status");
CREATE INDEX "bills_payment_status_idx" ON "bills"("payment_status");
CREATE INDEX "bills_invoice_date_idx" ON "bills"("invoice_date");
ALTER TABLE "bills" ADD CONSTRAINT "bills_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bills" ADD CONSTRAINT "bills_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bills" ADD CONSTRAINT "bills_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Bill line items
CREATE TABLE "bill_items" (
    "id" SERIAL NOT NULL,
    "bill_id" INTEGER NOT NULL,
    "sub_category_id" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "item_value" DECIMAL(14,2) NOT NULL,
    "cgst_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "sgst_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "igst_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "cgst_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sgst_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "igst_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "gst_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "gst_type" TEXT NOT NULL DEFAULT 'INPUT',
    "tds_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "tds_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "payable_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "bill_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "bill_items_bill_id_idx" ON "bill_items"("bill_id");
CREATE INDEX "bill_items_sub_category_id_idx" ON "bill_items"("sub_category_id");
ALTER TABLE "bill_items" ADD CONSTRAINT "bill_items_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bill_items" ADD CONSTRAINT "bill_items_sub_category_id_fkey" FOREIGN KEY ("sub_category_id") REFERENCES "expense_sub_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Expense <- Bill link
ALTER TABLE "expenses" ADD COLUMN "bill_id" INTEGER;
CREATE UNIQUE INDEX "expenses_bill_id_key" ON "expenses"("bill_id");
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "bills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Atomic BILL-00001 numbering (same approach as expense_number_seq)
CREATE SEQUENCE IF NOT EXISTS "bill_number_seq" START 1;
