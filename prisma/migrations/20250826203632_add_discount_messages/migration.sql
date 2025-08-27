-- AlterTable
ALTER TABLE "DiscountSettings" ADD COLUMN "productDiscountMessage" TEXT NOT NULL DEFAULT 'PFC Member Discount';
ALTER TABLE "DiscountSettings" ADD COLUMN "shippingDiscountMessage" TEXT NOT NULL DEFAULT 'FREE SHIPPING FOR PFC MEMBERS';