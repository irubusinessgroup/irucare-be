-- CreateTable
CREATE TABLE "EbmCodeClass" (
    "id" TEXT NOT NULL,
    "cdCls" TEXT NOT NULL,
    "cdClsNm" TEXT NOT NULL,
    "cdClsDesc" TEXT,
    "useYn" TEXT NOT NULL DEFAULT 'Y',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EbmCodeClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EbmCodeDetail" (
    "id" TEXT NOT NULL,
    "codeClassId" TEXT NOT NULL,
    "cd" TEXT NOT NULL,
    "cdNm" TEXT NOT NULL,
    "cdDesc" TEXT,
    "useYn" TEXT NOT NULL DEFAULT 'Y',
    "srtOrd" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EbmCodeDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductCodeSequence" (
    "id" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "lastSeq" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductCodeSequence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EbmCodeClass_cdCls_key" ON "EbmCodeClass"("cdCls");

-- CreateIndex
CREATE INDEX "EbmCodeDetail_codeClassId_idx" ON "EbmCodeDetail"("codeClassId");

-- CreateIndex
CREATE UNIQUE INDEX "EbmCodeDetail_codeClassId_cd_key" ON "EbmCodeDetail"("codeClassId", "cd");

-- CreateIndex
CREATE UNIQUE INDEX "ProductCodeSequence_prefix_key" ON "ProductCodeSequence"("prefix");

-- AddForeignKey
ALTER TABLE "EbmCodeDetail" ADD CONSTRAINT "EbmCodeDetail_codeClassId_fkey" FOREIGN KEY ("codeClassId") REFERENCES "EbmCodeClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;
