-- AlterTable
-- "Product Vertical" checkbox on the Create/Edit Vertical form — purely
-- informational, defaults false for every existing vertical.
ALTER TABLE "verticals" ADD COLUMN "is_product_vertical" BOOLEAN NOT NULL DEFAULT false;
