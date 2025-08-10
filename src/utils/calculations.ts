export class StockCalculations {
  static calculateTotalCost(quantity: number, unitCost: number): number {
    return Math.round(quantity * unitCost * 100) / 100;
  }

  static calculateDaysToExpiry(expiryDate: Date): number {
    const today = new Date();
    const expiry = new Date(expiryDate);
    const diffTime = expiry.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  static getExpiryAlertLevel(
    daysToExpiry: number
  ): "critical" | "warning" | "info" {
    if (daysToExpiry <= 7) return "critical";
    if (daysToExpiry <= 30) return "warning";
    return "info";
  }
}
