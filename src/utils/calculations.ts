export class StockCalculations {
  static calculateTotalCost(quantity: number, unitCost: number): number {
    return Math.round(quantity * unitCost * 100) / 100;
  }

  static calculateDaysToExpiry(expiryDate?: Date) {
    if (!expiryDate) {
      return {
        isExpiringSoon: false,
        daysUntilExpiry: null,
        expiryStatus: "NO_EXPIRY" as const,
      };
    }

    const today = new Date();
    const expiry = new Date(expiryDate);
    const diffTime = expiry.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return {
        isExpiringSoon: true,
        daysUntilExpiry: diffDays,
        expiryStatus: "EXPIRED" as const,
      };
    } else if (diffDays <= 30) {
      return {
        isExpiringSoon: true,
        daysUntilExpiry: diffDays,
        expiryStatus: "EXPIRING_SOON" as const,
      };
    } else {
      return {
        isExpiringSoon: false,
        daysUntilExpiry: diffDays,
        expiryStatus: "GOOD" as const,
      };
    }
  }
}
