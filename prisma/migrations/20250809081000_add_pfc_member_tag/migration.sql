-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DiscountSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "discountPercent" REAL NOT NULL DEFAULT 0,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "pfcMemberTag" TEXT NOT NULL DEFAULT 'plastic-free-club',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_DiscountSettings" ("createdAt", "discountPercent", "id", "isEnabled", "shop", "updatedAt") SELECT "createdAt", "discountPercent", "id", "isEnabled", "shop", "updatedAt" FROM "DiscountSettings";
DROP TABLE "DiscountSettings";
ALTER TABLE "new_DiscountSettings" RENAME TO "DiscountSettings";
CREATE UNIQUE INDEX "DiscountSettings_shop_key" ON "DiscountSettings"("shop");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
