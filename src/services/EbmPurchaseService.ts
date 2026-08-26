import { prisma } from "../utils/client";
import { EbmService } from "./EbmService";
import { ItemService } from "./ItemService";
import { ItemCodeGenerator } from "../utils/itemCodeGenerator";
import { StockService } from "./StockService";
import { applyMarkup } from "../utils/pricing";
import AppError from "../utils/error";
import { InventoryService } from "./InventoryService";
import { renderPurchasesReport } from "../templates/pdf/PurchasesReportTemplate";
import type { Request } from "express";
import {
  mergeBatchDates,
  parseCursorBatchDates,
} from "../utils/ebmDraftBatchDates";
import {
  derivePurchaseEbmStatus,
  draftRowStatusPriority,
  normalizeDraftStatusFilter,
  resolvePurchaseFlatRowStatus,
  matchesEbmDraftBranchScope,
} from "../utils/ebmDraftStatus";
import { resolveEbmDateReceived } from "../utils/ebmDateTime";

const SEED_DATE = "20190524000000";

/** Returns the current Kigali time (UTC+2, CAT — no DST) as yyyyMMddHHmmss */
function kigaliNow(): string {
  const d = new Date(Date.now() + 2 * 60 * 60 * 1000); // shift to UTC+2
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds())
  );
}

/** Adds one second to a yyyyMMddHHmmss datetime string to avoid re-fetching the last record. */
function incrementOneSec(dt: string): string {
  const d = new Date(
    Date.UTC(
      Number(dt.slice(0, 4)),
      Number(dt.slice(4, 6)) - 1,
      Number(dt.slice(6, 8)),
      Number(dt.slice(8, 10)),
      Number(dt.slice(10, 12)),
      Number(dt.slice(12, 14)) + 1,
    ),
  );
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds())
  );
}

function getStatusPriority(draft: Record<string, unknown>): number {
  return draftRowStatusPriority(resolvePurchaseFlatRowStatus(draft));
}

export class EbmPurchaseService {
  /**
   * Fetch EBM unregistered purchases for a company branch.
   * (Legacy method kept for backward compatibility.)
   */
  public static async getPurchases(
    companyId: string,
    lastReqDt: string,
  ): Promise<any> {
    try {
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { TIN: true, name: true },
      });

      if (!company?.TIN) {
        throw new Error(`Company has no TIN configured`);
      }

      const bhfId = await EbmService.resolveCompanyBhfId(companyId);
      const response = (await EbmService.fetchPurchases(
        company.TIN,
        bhfId,
        lastReqDt,
      )) as any;

      if (response.resultCd !== "000" || !response.data?.saleList) {
        console.log(`No purchases for ${company.name} on date ${lastReqDt}`);
        return [];
      }

      return response.data.saleList || [];
    } catch (error) {
      console.error(
        `Error fetching purchases for company ${companyId}:`,
        error,
      );
      throw error;
    }
  }

  public static async initDrafts(companyId: string): Promise<{
    lastSyncedAt: string;
    added: number;
    resultMsg: string;
  }> {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { TIN: true, name: true, isVatRegistered: true },
    });

    if (!company?.TIN) {
      throw new Error("Company has no TIN configured");
    }

    // Get company's current VAT registration status
    const isVat = company.isVatRegistered ?? false;

    // Step 1 — determine the datetime to request from
    const cursor = await prisma.ebmSyncCursor.findUnique({
      where: { companyId_type: { companyId, type: "PURCHASE" } },
    });
    const lastReqDt = cursor?.lastSyncedAt
      ? incrementOneSec(cursor.lastSyncedAt)
      : SEED_DATE;

    // Step 2 — call EBM
    const bhfId = await EbmService.resolveCompanyBhfId(companyId);
    const response = (await EbmService.fetchPurchases(
      company.TIN,
      bhfId,
      lastReqDt,
    )) as any;

    const resultCd: string = response.resultCd ?? "";
    const resultMsg: string = response.resultMsg ?? "No message";
    const resultDt: string = response.resultDt ?? lastReqDt;

    if (resultCd !== "000" && resultCd !== "001") {
      // EBM returned an error (not "no results") — surface the real message, do not advance cursor
      throw new Error(`EBM Error [${resultCd}]: ${resultMsg}`);
    }

    const saleList: any[] = response.data?.saleList ?? [];

    // Step 3 — persist each invoice as a draft row
    let added = 0;
    let syncedAt: string | undefined;
    if (saleList.length > 0) {
      const rows = saleList.map((invoice: any) => ({
        companyId,
        lastReqDt,
        isVat,
        payload: invoice,
      }));
      const result = await prisma.ebmPurchaseDraft.createMany({
        data: rows,
        skipDuplicates: false, // duplicates are prevented at the cursor level
      });
      added = result.count;

      // Step 4 — advance cursor only when EBM returned data, using Kigali now
      // so "Last synced up to" stays frozen until the next batch with real data.
      syncedAt = kigaliNow();
      const existingBatches = parseCursorBatchDates(cursor?.batchDates);
      const batchDates = mergeBatchDates(existingBatches, [lastReqDt]);
      await prisma.ebmSyncCursor.upsert({
        where: { companyId_type: { companyId, type: "PURCHASE" } },
        create: {
          companyId,
          type: "PURCHASE",
          lastSyncedAt: syncedAt,
          batchDates,
        },
        update: { lastSyncedAt: syncedAt, batchDates },
      });
    }

    const updatedCursor = await prisma.ebmSyncCursor.findUnique({
      where: { companyId_type: { companyId, type: "PURCHASE" } },
    });
    const effectiveLastSyncedAt =
      updatedCursor?.lastSyncedAt ?? syncedAt ?? lastReqDt;

    console.log(
      `[EbmPurchaseService.initDrafts] company=${companyId} | sentLastReqDt=${lastReqDt} | ebmResultDt=${resultDt} | added=${added} | cursorStoredAs=${effectiveLastSyncedAt} | msg="${resultMsg}"`,
    );
    console.log(
      added > 0
        ? `[EbmPurchaseService.initDrafts] Cursor advanced → "${effectiveLastSyncedAt}" (Kigali now, data received)`
        : `[EbmPurchaseService.initDrafts] No data — cursor unchanged at "${effectiveLastSyncedAt}"`,
    );

    return { lastSyncedAt: effectiveLastSyncedAt, added, resultMsg };
  }

  public static async getDrafts(
    companyId: string,
    lastReqDt?: string,
    searchQuery?: string,
    dateFrom?: string,
    dateTo?: string,
    page?: number,
    limit?: number,
    status?: string,
    branchId?: string | null,
  ): Promise<{
    drafts: any[];
    totalItems: number;
    currentPage: number;
    itemsPerPage: number;
    lastSyncedAt: string | null;
    batchDates: string[];
    isVat: boolean;
  }> {
    const createdAtFilter: any = {};
    if (dateFrom) createdAtFilter.gte = new Date(dateFrom);
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      createdAtFilter.lte = end;
    }

    const [rows, cursor, allBatchRows] = await Promise.all([
      prisma.ebmPurchaseDraft.findMany({
        where: {
          companyId,
          ...(lastReqDt ? { lastReqDt } : {}),
          ...(Object.keys(createdAtFilter).length
            ? { createdAt: createdAtFilter }
            : {}),
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.ebmSyncCursor.findUnique({
        where: { companyId_type: { companyId, type: "PURCHASE" } },
      }),
      prisma.ebmPurchaseDraft.findMany({
        where: { companyId },
        select: { lastReqDt: true },
        distinct: ["lastReqDt"],
      }),
    ]);

    const batchDates = mergeBatchDates(
      allBatchRows.map((r) => r.lastReqDt),
      parseCursorBatchDates(cursor?.batchDates),
    );

    // Return all drafts for the current VAT mode (pending, approved, canceled, saved).
    let drafts: any[] = rows.map((row) => {
      const payload = row.payload as Record<string, unknown>;
      const derivedStatus = derivePurchaseEbmStatus(payload);
      return {
        _draftId: row.id,
        _lastReqDt: row.lastReqDt,
        isVat: row.isVat,
        ...payload,
        ...(derivedStatus && !payload._localEbmStatus
          ? { _localEbmStatus: derivedStatus }
          : {}),
      };
    });

    // Apply client-side search filter if searchQuery is provided
    if (searchQuery && searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();

      drafts = drafts.filter((draft) => {
        // Search in invoice-level fields
        const spplrNm = String(draft.spplrNm || "").toLowerCase();
        const spplrInvcNo = String(draft.spplrInvcNo || "").toLowerCase();
        const invcNo = String(draft.invcNo || "").toLowerCase();
        const spplrTin = String(draft.spplrTin || "").toLowerCase();

        const invoiceMatch =
          spplrNm.includes(query) ||
          spplrInvcNo.includes(query) ||
          invcNo.includes(query) ||
          spplrTin.includes(query);

        // Search in item-level fields
        const itemMatch =
          Array.isArray(draft.itemList) &&
          draft.itemList.some((item: any) => {
            const itemNm = String(item.itemNm || "").toLowerCase();
            const itemCd = String(item.itemCd || "").toLowerCase();
            return itemNm.includes(query) || itemCd.includes(query);
          });

        return invoiceMatch || itemMatch;
      });
    }

    // Flatten invoices → one entry per line item so sort is item-level, not invoice-level.
    // Each flat item carries invoice context and resolves effective status
    // (item-level _localEbmStatus overrides invoice-level).
    const flatItems = drafts.flatMap((invoice) => {
      const items = (invoice.itemList as Array<Record<string, unknown>>) ?? [];
      if (items.length === 0) return [invoice];
      return items.map((item) => ({
        _draftId: invoice._draftId,
        _lastReqDt: invoice._lastReqDt,
        invcNo: invoice.invcNo,
        spplrInvcNo: invoice.spplrInvcNo,
        spplrNm: invoice.spplrNm,
        spplrTin: invoice.spplrTin,
        cfmDt: invoice.cfmDt,
        salesDt: invoice.salesDt,
        pchsSttsCd: invoice.pchsSttsCd,
        prchrAcptcYn: invoice.prchrAcptcYn,
        isVat: invoice.isVat,
        // Invoice-level status as fallback; overridden below if item has its own
        _localStatus: invoice._localStatus,
        _localEbmStatus: invoice._localEbmStatus,
        // All item fields (including any per-item _localEbmStatus / _localStatus)
        ...item,
      }));
    });

    const statusFilter = normalizeDraftStatusFilter(status);
    let filteredItems = flatItems;
    if (branchId) {
      filteredItems = flatItems.filter((row) =>
        matchesEbmDraftBranchScope(
          row,
          branchId,
          resolvePurchaseFlatRowStatus,
        ),
      );
    }
    if (statusFilter) {
      filteredItems = filteredItems.filter(
        (row) => resolvePurchaseFlatRowStatus(row) === statusFilter,
      );
    }

    // Sort: Draft(0) → Approved(1) → Saved(2) → Canceled(3) at item level
    filteredItems.sort((a, b) => getStatusPriority(a) - getStatusPriority(b));

    const totalItems = filteredItems.length;
    const pageNum = Number(page) > 0 ? Number(page) : 1;
    const limitNum = Number(limit) > 0 ? Number(limit) : 15;
    const paginatedDrafts = filteredItems.slice(
      (pageNum - 1) * limitNum,
      pageNum * limitNum,
    );

    return {
      drafts: paginatedDrafts,
      totalItems,
      currentPage: pageNum,
      itemsPerPage: limitNum,
      lastSyncedAt: cursor?.lastSyncedAt ?? null,
      isVat: false,
      batchDates,
    };
  }

  public static async getPendingCount(
    companyId: string,
    branchId?: string | null,
  ): Promise<number> {
    const rows = await prisma.ebmPurchaseDraft.findMany({
      where: { companyId },
    });
    const flatItems = rows.flatMap((row) => {
      const payload = row.payload as Record<string, unknown>;
      const items = (payload.itemList as Array<Record<string, unknown>>) ?? [];
      if (items.length === 0) return [payload];
      return items.map((item) => ({ ...payload, ...item }));
    });
    return flatItems.filter(
      (item) =>
        getStatusPriority(item) === 0 &&
        matchesEbmDraftBranchScope(
          item,
          branchId,
          resolvePurchaseFlatRowStatus,
        ),
    ).length;
  }

  /**
   * Delete draft rows by their UUIDs after successful finalization.
   */
  public static async deleteDrafts(
    companyId: string,
    ids: string[],
  ): Promise<number> {
    if (!ids.length) return 0;
    const result = await prisma.ebmPurchaseDraft.deleteMany({
      where: { companyId, id: { in: ids } },
    });
    return result.count;
  }

  public static async savePurchases(
    companyId: string,
    userId: string,
    branchId: string | null,
    purchases: any[],
    draftIds?: string[],
  ): Promise<any> {
    try {
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { TIN: true, name: true },
      });

      if (!company?.TIN) {
        throw new Error(`Company has no TIN configured`);
      }

      const results: any[] = [];
      const processedItemIds: string[] = [];

      for (const purchase of purchases) {
        // Find or create supplier
        let supplierId = undefined;
        if (purchase.spplrTin) {
          let supplier = await prisma.suppliers.findFirst({
            where: { companyId, TIN: purchase.spplrTin },
          });
          if (!supplier) {
            supplier = await prisma.suppliers.create({
              data: {
                companyId,
                TIN: purchase.spplrTin,
                supplierName: purchase.spplrNm || "Unknown EBM Supplier",
                email: `ebm-${purchase.spplrTin}@supplier.local`,
                phoneNumber: purchase.spplrTin || "",
                contactPerson: "EBM Auto Generated",
              },
            });
          }
          supplierId = supplier.id;
        }

        const invoiceNo = String(
          purchase.spplrInvcNo || purchase.invcNo || Date.now(),
        );

        const itemList = purchase.itemList || [];

        for (const item of itemList) {
          // Determine if this purchase line is a service item.
          const isServiceItem = item.itemTypeCd === "3";

          if (isServiceItem) {
            continue; // Service items do not map locally and skip all stock logic
          }

          let dbItem;

          if (item.mappedItemId) {
            // User explicitly mapped this purchase to an existing item
            dbItem = await prisma.items.findUnique({
              where: { id: item.mappedItemId },
            });
            if (!dbItem) {
              throw new AppError(
                `Mapped item with ID ${item.mappedItemId} not found in local system.`,
                404,
              );
            }

            // Validation: EBM physical/stock items can only map to local stock items
            if (dbItem.isStockItem !== true) {
              throw new AppError(
                `Cannot map physical stock purchase "${item.itemNm}" to service item "${dbItem.itemFullName}". Physical purchases must map to stock items only.`,
                400,
              );
            }
          } else {
            dbItem = await prisma.items.findFirst({
              where: {
                companyId,
                OR: [
                  { productCode: item.itemCd },
                  {
                    itemFullName: { equals: item.itemNm, mode: "insensitive" },
                  },
                ],
              },
            });

            // Auto-match validation: If a Physical EBM item auto-matches a local service item by name,
            // throw an explicit error to prevent mixing stock models.
            if (dbItem && dbItem.isStockItem !== true) {
              throw new AppError(
                `Cannot map physical stock purchase "${item.itemNm}" to service item "${dbItem.itemFullName}". Physical purchases must map to stock items only.`,
                400,
              );
            }

            if (!dbItem) {
              const { productCode } =
                await ItemService.generateProductCodeWithClassifications(
                  companyId,
                  "RW",
                  item.itemClsCd || "5059690800",
                  item.pkgUnitCd || "NT",
                  item.qtyUnitCd || "U",
                );

              let category = await prisma.itemCategories.findFirst({
                where: { companyId, categoryName: "Uncategorized" },
              });

              if (!category) {
                category = await prisma.itemCategories.create({
                  data: {
                    companyId,
                    categoryName: "Uncategorized",
                    description: "Auto-generated for EBM purchases",
                  },
                });
              }

              const itemCodeSku = await ItemCodeGenerator.generate(category.id);
              const { isTaxable, taxCode, taxRate } =
                ItemService.normalizeTaxFields({ taxCode: item.taxTyCd });

              dbItem = await prisma.items.create({
                data: {
                  companyId,
                  branchId,
                  categoryId: category.id,
                  itemCodeSku,
                  productCode: item.itemCd || productCode,
                  itemFullName: item.itemNm || "Unknown EBM Item",
                  isTaxable,
                  taxCode,
                  taxRate,
                  minLevel: 10,
                  maxLevel: 100,
                  // Service items (itemTypeCd "3") have no physical stock
                  isStockItem: !isServiceItem,
                },
              });
            }
          }

          const quantityReceived = Number(item.qty || 0);
          const unitCost = Number(item.prc || 0);
          const totalCost = quantityReceived * unitCost;

          // Service items have no physical quantity — skip the entire stock
          // receipt + unit creation flow. They are registered as items in the
          // DB (above) but inventory is never touched.
          if (!isServiceItem && quantityReceived > 0) {
            processedItemIds.push(dbItem.id);
            await prisma.$transaction(
              async (tx) => {
                const newReceipt = await tx.stockReceipts.create({
                  data: {
                    companyId,
                    branchId: branchId,
                    warehouseId: item.warehouseId || null,
                    itemId: dbItem.id,
                    quantityReceived,
                    packSize: item.pkg ? Number(item.pkg) : undefined,
                    unitCost,
                    totalCost,
                    supplierId,
                    invoiceNo: invoiceNo,
                    dateReceived: resolveEbmDateReceived(
                      item.cfmDt,
                      purchase.cfmDt,
                      purchase.pchsDt,
                      purchase.salesDt,
                      purchase.wrhsDt,
                    ),
                    expiryDate: item.expiryDate
                      ? new Date(item.expiryDate)
                      : undefined,
                    remarksNotes:
                      item.remarksNotes || "Auto-synced from EBM Purchases",
                    receiptType: "PURCHASE",
                    ebmSynced: false, // Pending EBM sync
                  },
                });

                const companyTools = await tx.companyTools.findFirst({
                  where: { companyId },
                });
                const markupPercentage = Number(companyTools?.markupPrice || 0);
                const calculatedSellPrice = applyMarkup(
                  unitCost,
                  markupPercentage,
                );

                await tx.approvals.create({
                  data: {
                    stockReceiptId: newReceipt.id,
                    approvedByUserId: userId,
                    dateApproved: new Date(),
                    approvalStatus: "PENDING",
                    comments:
                      "Auto-approved EBM Sync - Pending EBM Confirmation",
                    ExpectedSellPrice: calculatedSellPrice,
                  },
                });

                // Ensure stock items are flagged; do not override service items.
                await tx.items.update({
                  where: { id: dbItem.id },
                  data: { isStockItem: true },
                });

                // Create stock units with PENDING_EBM_SYNC status
                const stockUnits = Array.from(
                  { length: quantityReceived },
                  () => ({
                    stockReceiptId: newReceipt.id,
                    status: "PENDING_EBM_SYNC",
                    quantity: 1,
                    quantityAvailable: 1,
                    companyId,
                    branchId,
                  }),
                );
                await tx.stock.createMany({ data: stockUnits });

                return newReceipt;
              },
              { maxWait: 300000, timeout: 600000 },
            );
          }
        }

        // Removed primary EBM handshake - Enforced via standalone 'Approve on EBM' user action
        // EbmService.savePurchasesToEbm(company.TIN, "00", purchase).catch(
        //   (err) => console.warn("Async EBM Sync Handshake Failed:", err.message),
        // );

        results.push({
          invcNo: purchase.spplrInvcNo || purchase.invcNo,
          status: "SUCCESS",
        });
      }

      // Auto-sync EBM stock master for only the items just saved
      if (processedItemIds.length > 0) {
        try {
          await InventoryService.syncEbmStockMaster(
            companyId,
            userId,
            branchId,
            processedItemIds,
          );
        } catch (syncErr: unknown) {
          console.warn(
            "[EbmPurchaseService] Auto EBM sync failed (non-fatal):",
            syncErr instanceof Error ? syncErr.message : syncErr,
          );
        }
      }

      // Mark finalized line items as SAVED per-item so siblings are not affected.
      if (draftIds?.length) {
        // Build draftId → saved item-sequence numbers from the purchases array
        const savedByDraft = new Map<string, Set<number>>();
        for (const purchase of purchases) {
          const p = purchase as Record<string, unknown>;
          const did = typeof p._draftId === "string" ? p._draftId : undefined;
          if (did) {
            const lines = (p.itemList ?? []) as Array<{ itemSeq?: number }>;
            savedByDraft.set(
              did,
              new Set(lines.map((i) => Number(i.itemSeq)).filter(Boolean)),
            );
          }
        }

        for (const draftId of draftIds) {
          const draft = await prisma.ebmPurchaseDraft.findUnique({
            where: { id: draftId, companyId },
          });
          if (!draft) continue;

          let parsedData: any;
          try {
            parsedData =
              typeof draft.payload === "string"
                ? JSON.parse(draft.payload)
                : draft.payload;
          } catch (e) {
            continue;
          }

          const savedSet = savedByDraft.get(draftId);
          if (
            savedSet &&
            savedSet.size > 0 &&
            Array.isArray(parsedData.itemList)
          ) {
            parsedData.itemList = (
              parsedData.itemList as Record<string, unknown>[]
            ).map((item) =>
              savedSet.has(Number(item.itemSeq))
                ? {
                    ...item,
                    _localStatus: "SAVED",
                    _localEbmStatus: item._localEbmStatus ?? "APPROVED",
                    _branchId: branchId,
                  }
                : item,
            );
            // If every item in this invoice is now SAVED, mark the invoice root too
            const allSaved = (
              parsedData.itemList as Record<string, unknown>[]
            ).every((i) => i._localStatus === "SAVED");
            if (allSaved) {
              parsedData._localStatus = "SAVED";
              parsedData._branchId = branchId;
            }
          } else {
            parsedData._localStatus = "SAVED";
            parsedData._branchId = branchId;
            if (!parsedData._localEbmStatus) {
              parsedData._localEbmStatus = "APPROVED";
            }
          }

          await prisma.ebmPurchaseDraft.update({
            where: { id: draftId },
            data: { payload: parsedData as any },
          });
        }
      }

      return {
        success: true,
        processed: purchases.length,
        results,
      };
    } catch (error) {
      console.error(`Error saving purchases for company ${companyId}:`, error);
      throw error;
    }
  }

  /**
   * Updates the EBM status of specific line items within purchase drafts.
   * Status is written per-item into itemList[n]._localEbmStatus so that
   * other items in the same invoice are not affected.
   */
  public static async updatePurchaseStatus(
    companyId: string,
    draftItems: Array<{ draftId: string; itemSeq: number }>,
    status: string,
  ) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) throw new Error("Company not found");

    // Group itemSeqs by draftId to minimise DB reads
    const byDraft = new Map<string, number[]>();
    for (const { draftId, itemSeq } of draftItems) {
      if (!byDraft.has(draftId)) byDraft.set(draftId, []);
      byDraft.get(draftId)!.push(Number(itemSeq));
    }

    const localStatus =
      status === "02" ? "APPROVED" : status === "04" ? "CANCELED" : status;

    const results = [];

    for (const [draftId, itemSeqs] of byDraft) {
      const draft = await prisma.ebmPurchaseDraft.findUnique({
        where: { id: draftId, companyId },
      });
      if (!draft) continue;

      let parsedData: any;
      try {
        parsedData =
          typeof draft.payload === "string"
            ? JSON.parse(draft.payload)
            : draft.payload;
      } catch (e) {
        continue;
      }

      try {
        // 1. Notify RRA (EBM API operates at invoice level)
        const ebmRes = await EbmService.savePurchasesToEbm(
          company.TIN,
          await EbmService.resolveCompanyBhfId(companyId),
          parsedData,
          status,
        );

        // 2. Write status per-item only — never stamp the invoice root
        if (Array.isArray(parsedData.itemList)) {
          parsedData.itemList = (
            parsedData.itemList as Record<string, unknown>[]
          ).map((item) =>
            itemSeqs.includes(Number(item.itemSeq))
              ? { ...item, _localEbmStatus: localStatus }
              : item,
          );
        }

        // Keep prchrAcptcYn for EBM API compatibility (invoice-level field)
        parsedData.prchrAcptcYn = status;

        await prisma.ebmPurchaseDraft.update({
          where: { id: draftId },
          data: { payload: parsedData as any },
        });

        results.push({
          draftId,
          status: "SUCCESS",
          message: ebmRes?.resultMsg || "It is succeeded",
        });
      } catch (err: any) {
        console.error(
          `EBM Status Update Failed for draft ${draftId}:`,
          err.message,
        );
        throw new Error(
          `Failed to complete EBM handshake with RRA: ${err.message}`,
        );
      }
    }

    return { success: true, processed: draftItems.length, results };
  }

  public static async generateDraftsPdf(
    req: Request,
    dateFrom?: string,
    dateTo?: string,
  ): Promise<void> {
    const companyId = req.user!.company!.companyId;
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true, TIN: true },
    });
    if (!company) throw new Error("Company not found");

    const createdAtFilter: any = {};
    if (dateFrom) createdAtFilter.gte = new Date(dateFrom);
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      createdAtFilter.lte = end;
    }

    const rows = await prisma.ebmPurchaseDraft.findMany({
      where: {
        companyId,
        ...(Object.keys(createdAtFilter).length
          ? { createdAt: createdAtFilter }
          : {}),
      },
      orderBy: { createdAt: "asc" },
    });

    function ymdFromEbmDt(dt: string): string {
      if (!dt || dt.length < 8) return "";
      return `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}`;
    }

    const dateRange =
      dateFrom && dateTo ? { from: dateFrom, to: dateTo } : undefined;

    const fmt = new Intl.NumberFormat("en-RW", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const invoices: {
      requestDate: string;
      spplrTin: string;
      spplrNm: string;
      invoiceNo: string;
      totalAmount: string;
      itemsText: string;
      itemCount: number;
    }[] = [];

    for (const row of rows) {
      const payload = row.payload as any;
      const itemList: any[] = payload.itemList ?? [];
      const requestDate = row.lastReqDt ? ymdFromEbmDt(row.lastReqDt) : "—";
      const spplrTin = payload.spplrTin || "—";
      const spplrNm = payload.spplrNm || "—";
      const invoiceNo = payload.spplrInvcNo || payload.invcNo || "—";

      if (itemList.length === 0) {
        invoices.push({
          requestDate,
          spplrTin,
          spplrNm,
          invoiceNo,
          totalAmount: fmt.format(0),
          itemsText: "—",
          itemCount: 0,
        });
      } else {
        for (const item of itemList) {
          const qty = Number(item.qty || 0);
          const prc = Number(item.prc || 0);
          invoices.push({
            requestDate,
            spplrTin,
            spplrNm,
            invoiceNo,
            totalAmount: fmt.format(qty * prc),
            itemsText: [
              item.itemNm,
              item.itemCd,
              `${qty}${item.qtyUnitCd || ""}`,
            ]
              .filter(Boolean)
              .join("=>"),
            itemCount: qty,
          });
        }
      }
    }

    const buffer = await renderPurchasesReport({
      company: { name: company.name, tin: company.TIN ?? "" },
      invoices,
      dateRange,
    });
    const filename = `purchases_report_${new Date().toISOString().slice(0, 10)}.pdf`;
    req.res!.setHeader("Content-Type", "application/pdf");
    req.res!.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`,
    );
    req.res!.end(buffer);
  }
}
