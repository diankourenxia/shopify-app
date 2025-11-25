-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_OrderStatus" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "lineItemId" TEXT,
    "status" TEXT NOT NULL,
    "note" TEXT,
    "sfWaybillNo" TEXT,
    "sfLabelUrl" TEXT,
    "sfInvoiceUrl" TEXT,
    "sfCreatedAt" DATETIME,
    "sfPrintCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_OrderStatus" ("createdAt", "id", "lineItemId", "note", "orderId", "sfCreatedAt", "sfInvoiceUrl", "sfLabelUrl", "sfWaybillNo", "status", "updatedAt") SELECT "createdAt", "id", "lineItemId", "note", "orderId", "sfCreatedAt", "sfInvoiceUrl", "sfLabelUrl", "sfWaybillNo", "status", "updatedAt" FROM "OrderStatus";
DROP TABLE "OrderStatus";
ALTER TABLE "new_OrderStatus" RENAME TO "OrderStatus";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
