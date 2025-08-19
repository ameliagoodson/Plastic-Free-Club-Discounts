-- Remove bestPriceWinsEnabled column from DiscountSettings table
-- This column is no longer needed as best price wins behavior is automatic
-- (Shopify discounts can only reduce prices, never increase them)

ALTER TABLE "DiscountSettings" DROP COLUMN "bestPriceWinsEnabled";