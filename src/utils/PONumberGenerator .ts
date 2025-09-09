import { prisma } from "../utils/client";
import AppError from "../utils/error";

export class PONumberGenerator {
  public static async generatePONumber(
    companyId: string,
    prefix: string = "PO",
  ): Promise<string> {
    const currentDate = new Date();
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, "0");
    const day = String(currentDate.getDate()).padStart(2, "0");
    const dateStr = `${year}${month}${day}`;

    let attempts = 0;
    const maxAttempts = 100;

    // helper to generate N random uppercase letters
    const randomLetters = (n: number) => {
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      let out = "";
      for (let i = 0; i < n; i++) {
        out += chars[Math.floor(Math.random() * chars.length)];
      }
      return out;
    };

    // derive two letters from company name (deterministic)
    const getCompanyLetters = async (companyId: string) => {
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { name: true },
      });
      const name = (company?.name || "").trim();
      if (!name) return randomLetters(2);
      const parts = name.split(/\s+/).filter(Boolean);
      if (parts.length > 1) {
        const first = parts[0][0] ?? "X";
        const last = parts[parts.length - 1][0] ?? "X";
        return (first + last).toUpperCase();
      } else {
        const word = parts[0];
        const first = word[0] ?? "X";
        // If the second character exists and is a vowel, keep it.
        const secondChar = word[1];
        if (secondChar && /[aeiouAEIOU]/.test(secondChar)) {
          return (first + secondChar).toUpperCase();
        }
        // Otherwise, try to find the first vowel after the first character
        const vowelMatch = word.slice(1).match(/[aeiouAEIOU]/);
        if (vowelMatch) return (first + vowelMatch[0]).toUpperCase();
        // Fallback to second character if available, else 'X'
        if (word.length >= 2) return (first + word[1]).toUpperCase();
        return (first + "X").toUpperCase();
      }
    };

    // derive letters once (deterministic for the company)
    const companyLetters = await getCompanyLetters(companyId);

    while (attempts < maxAttempts) {
      try {
        const startOfDay = new Date(
          year,
          currentDate.getMonth(),
          currentDate.getDate(),
        );
        const endOfDay = new Date(
          year,
          currentDate.getMonth(),
          currentDate.getDate() + 1,
        );

        // Fetch today's PO numbers for the company and determine the highest used sequence.
        const todaysPOs = await prisma.purchaseOrder.findMany({
          where: {
            companyId,
            createdAt: {
              gte: startOfDay,
              lt: endOfDay,
            },
          },
          select: {
            poNumber: true,
          },
        });

        // Parse numeric suffixes (last hyphen-separated segment) and compute max.
        let maxSeq = 0;
        for (const po of todaysPOs) {
          const parts = po.poNumber?.split("-");
          if (!parts || parts.length === 0) continue;
          const last = parts[parts.length - 1];
          const parsed = parseInt(last, 10); // works even if suffix has letters, e.g. "0001AB"
          if (!isNaN(parsed) && parsed > maxSeq) {
            maxSeq = parsed;
          }
        }

        // Start from next available sequence
        let nextSeq = maxSeq + 1;
        // Pad to 4 digits to reduce collision likelihood and allow more orders/day
        const padLength = 4;

        // Try to find a free sequence in this loop. Insert company-derived letters before the date to form: PREFIX-LLYYYYMMDD-SEQ
        let letters = companyLetters;
        let poNumber = `${prefix}-${letters}${dateStr}-${String(nextSeq).padStart(padLength, "0")}${randomLetters(1)}`;
        // If collision detected, increment sequence, regenerate letters, and retry
        while (
          await prisma.purchaseOrder.findFirst({
            where: { poNumber, companyId },
            select: { id: true },
          })
        ) {
          nextSeq++;
          attempts++;
          if (attempts >= maxAttempts) {
            throw new AppError(
              `Failed to generate unique PO number after ${maxAttempts} attempts`,
              400,
            );
          }
          // keep company-derived letters deterministic; fall back to random only if needed
          letters = companyLetters || randomLetters(2);
          poNumber = `${prefix}-${letters}${dateStr}-${String(nextSeq).padStart(padLength, "0")}${randomLetters(1)}`;
        }

        // Unique poNumber found
        return poNumber;
      } catch (error) {
        attempts++;
        if (attempts >= maxAttempts) {
          throw new AppError(
            `Failed to generate unique PO number after ${maxAttempts} attempts`,
            400,
          );
        }
        // small backoff could be added here if desired (not required)
      }
    }
    throw new AppError("Unable to generate unique PO number", 400);
  }
}
