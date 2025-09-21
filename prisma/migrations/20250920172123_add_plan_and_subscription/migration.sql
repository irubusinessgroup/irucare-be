-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "setupFee" DOUBLE PRECISION,
    "additionalUser" DOUBLE PRECISION,
    "additionalLocation" DOUBLE PRECISION,
    "features" TEXT[],
    "period" TEXT,
    "userRange" TEXT,
    "locationRange" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "companyName" TEXT,
    "address" TEXT,
    "city" TEXT,
    "country" TEXT,
    "paymentMethod" TEXT NOT NULL,
    "paymentPhone" TEXT,
    "billingAddress" TEXT,
    "cardNumber" TEXT,
    "expiryDate" TEXT,
    "cvv" TEXT,
    "nameOnCard" TEXT,
    "selectedPlan" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "planPrice" DOUBLE PRECISION NOT NULL,
    "setupFee" DOUBLE PRECISION,
    "totalDueToday" DOUBLE PRECISION NOT NULL,
    "billingCycle" TEXT NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
