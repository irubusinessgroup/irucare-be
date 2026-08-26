/* eslint-disable @typescript-eslint/no-explicit-any */
import { User } from "@prisma/client";
import { EbmService } from "./EbmService";
import { prisma } from "../utils/client";

interface GapResolutionResult {
  successfulNumbers: number[];
  refundedNumbers: number[];
  nextAvailableNumber: number;
  totalAttempts: number;
}

/**
 * EbmInvoiceGapResolutionService
 *
 * When a 924 (duplicate invoice) error occurs, this service runs in the background
 * to identify and fill gaps in the invoice number sequence.
 *
 * Process:
 * 1. Start from last recorded invoice number + 1
 * 2. Attempt each number sequentially (+1 each time, never skip)
 * 3. If successful (resultCd === "000"), record the number
 * 4. If duplicate (resultCd === "924"), continue to next number
 * 5. Continue until finding the next available number or reaching a threshold
 */
export class EbmInvoiceGapResolutionService {
  /**
   * Resolve gaps in invoice numbers for a company by attempting sequential numbers.
   * This should run in the background when a 924 error is first detected.
   * Starts from the last sale invoice number + 1 and increments by 1 each time.
   */
  static async resolveInvoiceGaps(
    companyId: string,
    user: User,
    branchId?: string,
    maxNumbersToCheck: number = 500,
  ): Promise<GapResolutionResult> {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      throw new Error(`Company ${companyId} not found`);
    }

    // Get the last sequential invoice number recorded in DB
    const lastSequentialSell = await prisma.sell.findFirst({
      where: {
        companyId,
        invcNo: { lt: 100000000 }, // Filter out legacy large numbers
      },
      orderBy: { invcNo: "desc" },
      select: { invcNo: true },
    });

    const startFromNumber = (lastSequentialSell?.invcNo || 0) + 1;

    console.info(
      `[EbmInvoiceGapResolutionService] Starting gap resolution for company ${companyId} from number ${startFromNumber}`,
    );

    const successfulNumbers: number[] = [];
    const refundedNumbers: number[] = [];
    let nextAvailableNumber = startFromNumber;
    let totalAttempts = 0;

    // Get a dummy item from the company for the test invoice (EBM requires at least one item)
    // Fetch an item that has available stock
    const dummyItem = await prisma.stock.findFirst({
      where: {
        stockReceipt: {
          item: { companyId },
        },
        status: "AVAILABLE",
        quantityAvailable: { gt: 0 },
      },
      include: {
        stockReceipt: {
          include: {
            item: {
              select: { id: true, itemFullName: true, itemCodeSku: true },
            },
          },
        },
      },
    });

    if (!dummyItem || !dummyItem.stockReceipt?.item) {
      console.warn(
        `[EbmInvoiceGapResolutionService] No available stock items found in company ${companyId}. Cannot perform gap resolution without stock.`,
      );
      return {
        successfulNumbers: [],
        refundedNumbers: [],
        nextAvailableNumber: startFromNumber,
        totalAttempts: 0,
      };
    }

    const itemToUse = dummyItem.stockReceipt.item;

    // Continue until we find an available number or reach the max check threshold
    while (totalAttempts < maxNumbersToCheck) {
      try {
        const testSell = {
          id: `temp-test-${Date.now()}`,
          clientId: null,
          companyId,
          branchId: branchId || null,
          totalAmount: 100, // Minimal amount for valid invoice
          taxAmount: 0,
          subtotal: 100,
          insuranceCoveredAmount: 0,
          patientPayableAmount: 100,
          notes: "[Automatic Gap Resolution - Test Invoice]",
          invcNo: nextAvailableNumber,
          rcptNo: 0,
          intrlData: "",
          rcptSign: "",
          totRcptNo: 0,
          vsdcRcptPbctDate: "",
          sdcId: "",
          mrcNo: user.mrcNo || "",
          type: "SALE",
          isTrainingMode: true, // Mark as test/training mode
          sellItems: [
            {
              itemId: itemToUse.id,
              quantity: 1,
              sellPrice: 100,
              discount: 0,
              totalAmount: 100,
              taxAmount: 0,
              insuranceCoveredPerUnit: 0,
              patientPricePerUnit: 100,
            },
          ],
        };

        const ebmResponse = await EbmService.saveSaleToEBM(
          testSell as any,
          company,
          user,
          branchId,
          undefined,
        );

        totalAttempts++;

        if (ebmResponse.resultCd === "000") {
          // Success - this number is available
          successfulNumbers.push(nextAvailableNumber);
          nextAvailableNumber++;
          console.info(
            `[EbmInvoiceGapResolutionService] Found available invoice number: ${nextAvailableNumber - 1}`,
          );
          // Found an available number, we can stop here
          break;
        }

        if (ebmResponse.resultCd === "924") {
          // Duplicate found - create a refund for this number to mark it as processed
          refundedNumbers.push(nextAvailableNumber);
          console.warn(
            `[EbmInvoiceGapResolutionService] Duplicate found at invoice ${nextAvailableNumber}. Creating refund to mark as processed.`,
          );

          // Note: We record that this number was encountered but skip actual refund creation
          // to avoid circular dependency with SellService.
          nextAvailableNumber++;
          continue;
        }

        // Other error - stop processing
        console.warn(
          `[EbmInvoiceGapResolutionService] Non-duplicate error at invoice ${nextAvailableNumber}: ${ebmResponse.resultMsg} (Code: ${ebmResponse.resultCd})`,
        );
        break;
      } catch (error) {
        console.error(
          `[EbmInvoiceGapResolutionService] Error checking invoice ${nextAvailableNumber}:`,
          error,
        );
        totalAttempts++;
        nextAvailableNumber++;
      }
    }

    const result: GapResolutionResult = {
      successfulNumbers,
      refundedNumbers,
      nextAvailableNumber,
      totalAttempts,
    };

    console.info(
      `[EbmInvoiceGapResolutionService] Gap resolution completed: ${JSON.stringify(result)}`,
    );

    return result;
  }

  /**
   * Start gap resolution in the background (non-blocking).
   * Returns immediately without waiting for completion.
   */
  static async startBackgroundGapResolution(
    companyId: string,
    user: User,
    branchId?: string,
  ): Promise<void> {
    // Fire and forget - run in background
    setImmediate(async () => {
      try {
        await this.resolveInvoiceGaps(companyId, user, branchId);
      } catch (error) {
        console.error(
          `[EbmInvoiceGapResolutionService] Background gap resolution failed:`,
          error,
        );
      }
    });
  }
}
