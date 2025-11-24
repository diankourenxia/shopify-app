-- CreateTable
CREATE TABLE "Fabric" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "FabricColor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fabricId" TEXT NOT NULL,
    "colorCode" TEXT NOT NULL,
    "colorName" TEXT,
    "fullCode" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FabricColor_fabricId_fkey" FOREIGN KEY ("fabricId") REFERENCES "Fabric" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FabricPrice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fabricId" TEXT NOT NULL,
    "fabricPrice" REAL NOT NULL,
    "liningPrice" REAL NOT NULL,
    "effectiveDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    CONSTRAINT "FabricPrice_fabricId_fkey" FOREIGN KEY ("fabricId") REFERENCES "Fabric" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FabricColorPrice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "colorId" TEXT NOT NULL,
    "fabricPrice" REAL NOT NULL,
    "liningPrice" REAL NOT NULL,
    "effectiveDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    CONSTRAINT "FabricColorPrice_colorId_fkey" FOREIGN KEY ("colorId") REFERENCES "FabricColor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Fabric_code_key" ON "Fabric"("code");

-- CreateIndex
CREATE UNIQUE INDEX "FabricColor_fullCode_key" ON "FabricColor"("fullCode");

-- CreateIndex
CREATE UNIQUE INDEX "FabricColor_fabricId_colorCode_key" ON "FabricColor"("fabricId", "colorCode");
