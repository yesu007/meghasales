-- Resource-based costing mode (Quotation Calculator) — additive columns on
-- quotations, alongside the existing catalog/module-driven fields. All
-- nullable or defaulted, so existing catalog-based rows are unaffected.
ALTER TABLE "quotations" ADD COLUMN     "admin_cost" DECIMAL(15,2),
ADD COLUMN     "calculated_total_amount" DECIMAL(15,2),
ADD COLUMN     "costing_mode" TEXT NOT NULL DEFAULT 'CATALOG',
ADD COLUMN     "margin_percent" DECIMAL(5,2),
ADD COLUMN     "markup_amount" DECIMAL(15,2),
ADD COLUMN     "markup_percentage" DECIMAL(5,2),
ADD COLUMN     "outsourcing_cost" DECIMAL(15,2),
ADD COLUMN     "project_name" TEXT,
ADD COLUMN     "resource_cost_total" DECIMAL(15,2),
ADD COLUMN     "total_amount_overridden" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "travel_cost" DECIMAL(15,2),
ADD COLUMN     "vertical_id" INTEGER;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_vertical_id_fkey" FOREIGN KEY ("vertical_id") REFERENCES "verticals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
