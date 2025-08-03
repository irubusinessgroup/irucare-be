-- CreateTable
CREATE TABLE "DrugsCategories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DrugsCategories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Drugs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "drugCategoryId" TEXT NOT NULL,
    "drugCode" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "designation" TEXT NOT NULL,
    "instruction" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Drugs_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Drugs" ADD CONSTRAINT "Drugs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Drugs" ADD CONSTRAINT "Drugs_drugCategoryId_fkey" FOREIGN KEY ("drugCategoryId") REFERENCES "DrugsCategories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
