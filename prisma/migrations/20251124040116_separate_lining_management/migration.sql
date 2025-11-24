/*
  Warnings:

  - You are about to drop the column `liningPrice` on the `FabricColorPrice` table. All the data in the column will be lost.
  - You are about to drop the column `liningPrice` on the `FabricPrice` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "Lining" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "price" REAL NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LiningPrice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "liningId" TEXT NOT NULL,
    "price" REAL NOT NULL,
    "effectiveDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    CONSTRAINT "LiningPrice_liningId_fkey" FOREIGN KEY ("liningId") REFERENCES "Lining" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_FabricColorPrice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "colorId" TEXT NOT NULL,
    "fabricPrice" REAL NOT NULL,
    "effectiveDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    CONSTRAINT "FabricColorPrice_colorId_fkey" FOREIGN KEY ("colorId") REFERENCES "FabricColor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_FabricColorPrice" ("colorId", "createdAt", "createdBy", "effectiveDate", "fabricPrice", "id") SELECT "colorId", "createdAt", "createdBy", "effectiveDate", "fabricPrice", "id" FROM "FabricColorPrice";
DROP TABLE "FabricColorPrice";
ALTER TABLE "new_FabricColorPrice" RENAME TO "FabricColorPrice";
CREATE TABLE "new_FabricPrice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fabricId" TEXT NOT NULL,
    "fabricPrice" REAL NOT NULL,
    "effectiveDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    CONSTRAINT "FabricPrice_fabricId_fkey" FOREIGN KEY ("fabricId") REFERENCES "Fabric" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_FabricPrice" ("createdAt", "createdBy", "effectiveDate", "fabricId", "fabricPrice", "id") SELECT "createdAt", "createdBy", "effectiveDate", "fabricId", "fabricPrice", "id" FROM "FabricPrice";
DROP TABLE "FabricPrice";
ALTER TABLE "new_FabricPrice" RENAME TO "FabricPrice";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Lining_type_key" ON "Lining"("type");
