import { prisma } from "../utils/client";
import { ItemService } from "./ItemService";
import { EbmService } from "./EbmService";
import { applyMarkup } from "../utils/pricing";
import AppError from "../utils/error";
import { InventoryService } from "./InventoryService";
import { renderImportsReport } from "../templates/pdf/ImportsReportTemplate";
import type { Request } from "express";
import {
  mergeBatchDates,
  parseCursorBatchDates,
} from "../utils/ebmDraftBatchDates";
import {
  deriveImportEbmStatus,
  draftRowStatusPriority,
  normalizeDraftStatusFilter,
  resolveImportRowStatus,
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
  return draftRowStatusPriority(resolveImportRowStatus(draft));
}

export class EbmImportService {
  public static async initDrafts(companyId: string): Promise<{
    lastSyncedAt: string;
    added: number;
    resultMsg: string;
  }> {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { TIN: true, isVatRegistered: true },
    });

    if (!company?.TIN) {
      throw new Error("Company TIN not found");
    }

    const bhfId = await EbmService.resolveCompanyBhfId(companyId);

    // Get company's current VAT registration status
    const isVat = company.isVatRegistered ?? false;

    // Step 1 — determine the datetime to request from
    const cursor = await prisma.ebmSyncCursor.findUnique({
      where: { companyId_type: { companyId, type: "IMPORT" } },
    });
    const lastReqDt = cursor?.lastSyncedAt
      ? incrementOneSec(cursor.lastSyncedAt)
      : SEED_DATE;

    // Step 2 — call EBM
    const response = (await EbmService.fetchImportedItems(
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

    const itemList: any[] = response.data?.itemList ?? [];

    // Step 3 — persist each import item as a draft row
    let added = 0;
    let syncedAt: string | undefined;
    if (itemList.length > 0) {
      const rows = itemList.map((item: any) => ({
        companyId,
        lastReqDt,
        isVat,
        payload: item,
      }));
      const result = await prisma.ebmImportDraft.createMany({ data: rows });
      added = result.count;

      // Step 4 — advance cursor only when EBM returned data, using Kigali now
      // so "Last synced up to" stays frozen until the next batch with real data.
      syncedAt = kigaliNow();
      const existingBatches = parseCursorBatchDates(cursor?.batchDates);
      const batchDates = mergeBatchDates(existingBatches, [lastReqDt]);
      await prisma.ebmSyncCursor.upsert({
        where: { companyId_type: { companyId, type: "IMPORT" } },
        create: {
          companyId,
          type: "IMPORT",
          lastSyncedAt: syncedAt,
          batchDates,
        },
        update: { lastSyncedAt: syncedAt, batchDates },
      });
    }

    const updatedCursor = await prisma.ebmSyncCursor.findUnique({
      where: { companyId_type: { companyId, type: "IMPORT" } },
    });
    const effectiveLastSyncedAt =
      updatedCursor?.lastSyncedAt ?? syncedAt ?? lastReqDt;

    console.log(
      `[EbmImportService.initDrafts] company=${companyId} | sentLastReqDt=${lastReqDt} | ebmResultDt=${resultDt} | added=${added} | cursorStoredAs=${effectiveLastSyncedAt} | msg="${resultMsg}"`,
    );
    console.log(
      added > 0
        ? `[EbmImportService.initDrafts] Cursor advanced → "${effectiveLastSyncedAt}" (Kigali now, data received)`
        : `[EbmImportService.initDrafts] No data — cursor unchanged at "${effectiveLastSyncedAt}"`,
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
      prisma.ebmImportDraft.findMany({
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
        where: { companyId_type: { companyId, type: "IMPORT" } },
      }),
      prisma.ebmImportDraft.findMany({
        where: { companyId },
        select: { lastReqDt: true },
        distinct: ["lastReqDt"],
      }),
    ]);

    const batchDates = mergeBatchDates(
      allBatchRows.map((row) => row.lastReqDt),
      parseCursorBatchDates(cursor?.batchDates),
    );

    // Return all drafts for the current VAT mode (pending, approved, canceled, saved).
    let drafts: any[] = rows.map((row) => {
      const payload = row.payload as Record<string, unknown>;
      const derivedStatus = deriveImportEbmStatus(payload);
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

      drafts = drafts.filter((item) => {
        const itemNm = String(item.itemNm || "").toLowerCase();
        const dclNo = String(item.dclNo || "").toLowerCase();
        const hsCd = String(item.hsCd || "").toLowerCase();
        const spplrNm = String(item.spplrNm || "").toLowerCase();

        return (
          itemNm.includes(query) ||
          dclNo.includes(query) ||
          hsCd.includes(query) ||
          spplrNm.includes(query)
        );
      });
    }

    if (branchId) {
      drafts = drafts.filter((row) =>
        matchesEbmDraftBranchScope(row, branchId, resolveImportRowStatus),
      );
    }

    const statusFilter = normalizeDraftStatusFilter(status);
    if (statusFilter) {
      drafts = drafts.filter(
        (row) => resolveImportRowStatus(row) === statusFilter,
      );
    }

    // Sort: Draft(0) → Approved(1) → Saved(2) → Canceled(3)
    drafts.sort((a, b) => getStatusPriority(a) - getStatusPriority(b));

    const totalItems = drafts.length;
    const pageNum = Number(page) > 0 ? Number(page) : 1;
    const limitNum = Number(limit) > 0 ? Number(limit) : 15;
    const paginatedDrafts = drafts.slice(
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
    const rows = await prisma.ebmImportDraft.findMany({ where: { companyId } });
    return rows.filter((row) => {
      const payload = row.payload as Record<string, unknown>;
      return (
        getStatusPriority(payload) === 0 &&
        matchesEbmDraftBranchScope(
          payload,
          branchId,
          resolveImportRowStatus,
        )
      );
    }).length;
  }

  /**
   * Delete import draft rows by their UUIDs after successful finalization.
   */
  public static async deleteDrafts(
    companyId: string,
    ids: string[],
  ): Promise<number> {
    if (!ids.length) return 0;
    const result = await prisma.ebmImportDraft.deleteMany({
      where: { companyId, id: { in: ids } },
    });
    return result.count;
  }

  /**
   * Updates the EBM status of import drafts (3 Approved/Saved, 4 Canceled)
   * by communicating with RRA and updating the local JSON payload.
   * Status codes are sent directly to EBM: "3" = Approved, "4" = Canceled
   */
  public static async updateImportStatus(
    companyId: string,
    userId: string,
    draftIds: string[],
    status: string,
  ) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { TIN: true },
    });
    if (!company?.TIN) throw new Error("Company TIN not found");

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("User not found");

    const results = [];

    for (const draftId of draftIds) {
      const draft = await prisma.ebmImportDraft.findUnique({
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
        // Determine the item code - use existing productCode if already mapped
        let itemCode = parsedData.itemCd || `RWM-${draftId.substring(0, 8)}`;

        // If this import was previously mapped to a local item, use that product code
        if (parsedData.mappedItemId) {
          const mappedItem = await prisma.items.findUnique({
            where: { id: parsedData.mappedItemId },
            select: { productCode: true },
          });
          if (mappedItem?.productCode) {
            itemCode = mappedItem.productCode;
          }
        }

        // 1. Notify RRA of the status update
        // Status codes sent from frontend: "3" = Approved, "4" = Canceled
        // These are sent directly to EBM as imptItemSttsCd
        const imptItemSttsCd = status; // Use status directly ("3" or "4")

        const ebmRes = await EbmService.updateImportItem(
          company.TIN,
          await EbmService.resolveCompanyBhfId(companyId),
          {
            ...parsedData,
            imptItemSttsCd,
            remark:
              status === "3"
                ? "Approved and saved to local inventory"
                : "Rejected/Canceled by user",
          },
          itemCode,
          user,
        );

        // 2. Update local draft status AND the EBM status code in the payload
        // This ensures that when getDrafts() retrieves the draft, it shows the correct status
        // and when RRA checks, they see the updated status, not the default "1"
        parsedData._localEbmStatus =
          status === "3" ? "APPROVED" : status === "4" ? "CANCELED" : status;

        // IMPORTANT: Persist the actual EBM status code to prevent reverting to "1"
        parsedData.imptItemSttsCd = imptItemSttsCd;

        await prisma.ebmImportDraft.update({
          where: { id: draftId },
          data: { payload: parsedData as any },
        });

        results.push({
          draftId,
          status: "SUCCESS",
          message: ebmRes?.resultMsg || "Status updated successfully",
        });
      } catch (err: any) {
        console.error(
          `EBM Import Status Update Failed for draft ${draftId}:`,
          err.message,
        );
        throw new Error(
          `Failed to complete EBM handshake with RRA: ${err.message}`,
        );
      }
    }

    return { success: true, processed: draftIds.length, results };
  }

  public static async saveImports(
    companyId: string,
    userId: string,
    branchId: string | null,
    imports: any[],
    draftIds?: string[],
  ): Promise<any> {
    const results: any[] = [];
    const processedItemIds: string[] = [];
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user) throw new Error("User not found");

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { TIN: true },
    });

    if (!company?.TIN) throw new Error("Company TIN not found");

    for (const importItem of imports) {
      try {
        // Find or create supplier
        let supplierId: string | null = null;
        if (importItem.spplrNm) {
          const supplierName = importItem.spplrNm
            .split("\n")[0]
            .substring(0, 100);
          let supplier = await prisma.suppliers.findFirst({
            where: { companyId, supplierName },
          });

          if (!supplier) {
            supplier = await prisma.suppliers.create({
              data: {
                companyId,
                TIN: "000000000",
                supplierName,
                email: `ebm-import-${Date.now()}@supplier.local`,
                phoneNumber: "0000000000",
                contactPerson: "EBM Import Auto",
              },
            });
          }
          supplierId = supplier.id;
        }

        // Determine if this EBM import is a service item.
        const isServiceItem = importItem.itemTypeCd === "3";

        // Service items have no inventory — skip stock logic.
        // The draft stays in the DB; the draftIds loop at the end marks it SAVED.
        if (isServiceItem) {
          results.push({
            dclNo: importItem.dclNo,
            status: "SUCCESS",
            message: "Service item — no inventory created.",
          });
          continue;
        }

        let dbItem;

        if (importItem.mappedItemId) {
          // User explicitly mapped this import to an existing item
          dbItem = await prisma.items.findUnique({
            where: { id: importItem.mappedItemId },
          });
          if (!dbItem) {
            throw new AppError(
              `Mapped item with ID ${importItem.mappedItemId} not found in local system.`,
              404,
            );
          }

          // Validation: EBM physical/stock items can only map to local stock items
          if (dbItem.isStockItem !== true) {
            throw new AppError(
              `Cannot map physical stock import "${importItem.itemNm}" to service item "${dbItem.itemFullName}". Physical imports must map to stock items only.`,
              400,
            );
          }
        } else {
          // Try to find an existing item by name (case-insensitive)
          dbItem = await prisma.items.findFirst({
            where: {
              companyId,
              OR: [
                {
                  itemFullName: {
                    equals: importItem.itemNm,
                    mode: "insensitive",
                  },
                },
              ],
            },
          });

          // Auto-match validation: If a Physical EBM item auto-matches a local service item by name,
          // throw an explicit error to prevent mixing stock models.
          if (dbItem && dbItem.isStockItem !== true) {
            throw new AppError(
              `Cannot map physical stock import "${importItem.itemNm}" to service item "${dbItem.itemFullName}". Physical imports must map to stock items only.`,
              400,
            );
          }

          // Create the item if it doesn't exist yet
          if (!dbItem) {
            const { productCode } =
              await ItemService.generateProductCodeWithClassifications(
                companyId,
                importItem.orgnNatCd || "RW",
                importItem.itemClsCd || "5022110801",
                importItem.pkgUnitCd || "NT",
                importItem.qtyUnitCd || "U",
              );

            let category = await prisma.itemCategories.findFirst({
              where: { companyId, categoryName: "Uncategorized" },
            });

            if (!category) {
              category = await prisma.itemCategories.create({
                data: {
                  companyId,
                  categoryName: "Uncategorized",
                  description: "Default category for EBM Items",
                },
              });
            }

            dbItem = await prisma.items.create({
              data: {
                companyId,
                itemFullName: importItem.itemNm,
                productCode,
                itemCodeSku: productCode,
                categoryId: category.id,
                insurancePrice: 0,
                minLevel: 5,
                maxLevel: 100,
                isTaxable: true,
                taxCode: "D",
                // Service items (itemTypeCd "3") have no physical stock
                isStockItem: !isServiceItem,
              },
            });
          }
        }

        const unitCost =
          (Number(importItem.invcFcurAmt) * Number(importItem.invcFcurExcrt)) /
            Number(importItem.qty) || 0;

        await prisma.$transaction(
          async (tx) => {
            const newReceipt = await tx.stockReceipts.create({
              data: {
                companyId,
                branchId,
                warehouseId: importItem.warehouseId || null,
                itemId: dbItem.id,
                supplierId,
                quantityReceived: importItem.qty,
                packSize: importItem.pkg ? Number(importItem.pkg) : undefined,
                unitCost,
                totalCost:
                  Number(importItem.invcFcurAmt) *
                    Number(importItem.invcFcurExcrt) || 0,
                invoiceNo: importItem.dclNo,
                dateReceived: resolveEbmDateReceived(importItem.cfmDt),
                expiryDate: importItem.expiryDate
                  ? new Date(importItem.expiryDate)
                  : undefined,
                remarksNotes:
                  importItem.remarksNotes || "Auto-synced from EBM Imports",
                receiptType: "IMPORT",
                ebmSynced: false, // Pending EBM sync
              },
            });

            const companyTools = await tx.companyTools.findFirst({
              where: { companyId },
            });
            const markupPercentage = Number(companyTools?.markupPrice || 0);
            const calculatedSellPrice = applyMarkup(unitCost, markupPercentage);

            await tx.approvals.create({
              data: {
                stockReceiptId: newReceipt.id,
                approvedByUserId: userId,
                ExpectedSellPrice: calculatedSellPrice,
                approvalStatus: "PENDING",
                dateApproved: new Date(),
                comments: "Auto-approved EBM Sync - Pending EBM Confirmation",
              },
            });

            // For stock items: ensure isStockItem is flagged correctly.
            // For service items: preserve isStockItem=false — do NOT override.
            if (!isServiceItem && !dbItem.isStockItem) {
              await tx.items.update({
                where: { id: dbItem.id },
                data: { isStockItem: true },
              });
            }

            // Service items (itemTypeCd "3") never get physical Stock units —
            // they are sold without any stock tracking.
            if (!isServiceItem) {
              const qty = Number(importItem.qty);
              if (qty > 0) {
                const stockUnits = Array.from({ length: qty }, () => ({
                  stockReceiptId: newReceipt.id,
                  status: "PENDING_EBM_SYNC",
                  quantity: 1,
                  quantityAvailable: 1,
                  companyId,
                  branchId,
                }));
                await tx.stock.createMany({ data: stockUnits });
              }
            }

            return newReceipt;
          },
          { maxWait: 300000, timeout: 600000 },
        );

        results.push({ dclNo: importItem.dclNo, status: "SUCCESS" });
        processedItemIds.push(dbItem.id);

        // Removed fire-and-forget EBM handshake - will happen during sync
        // Asynchronously notify RRA without blocking the database transaction
        EbmService.updateImportItem(
          company.TIN,
          await EbmService.resolveCompanyBhfId(companyId),
          importItem,
          dbItem.productCode || `RWM-${dbItem.id.substring(0, 8)}`,
          user,
        )
          .then((res: any) => {
            if (res && res.resultCd !== "000") {
              console.warn(
                "EBM Sync Warning for Import:",
                importItem.dclNo,
                res.resultMsg,
              );
            }
          })
          .catch((err) =>
            console.warn("Async EBM Import Handshake Failed:", err.message),
          );
      } catch (err: any) {
        console.error("Error saving EBM import item:", err);
        results.push({
          dclNo: importItem.dclNo,
          status: "ERROR",
          message: err.message,
        });
      }
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
          "[EbmImportService] Auto EBM sync failed (non-fatal):",
          syncErr instanceof Error ? syncErr.message : syncErr,
        );
      }
    }

    // Mark finalized drafts as SAVED so they are preserved for the PDF report
    // but no longer appear in the active draft list.
    if (draftIds?.length) {
      for (const draftId of draftIds) {
        const draft = await prisma.ebmImportDraft.findUnique({
          where: { id: draftId, companyId },
        });
        if (!draft) continue;
        const payload =
          typeof draft.payload === "string"
            ? JSON.parse(draft.payload)
            : draft.payload;
        payload._localStatus = "SAVED";
        payload._branchId = branchId;
        if (!payload._localEbmStatus) {
          payload._localEbmStatus = "APPROVED";
        }
        await prisma.ebmImportDraft.update({
          where: { id: draftId },
          data: { payload: payload as any },
        });
      }
    }

    return { results };
  }

  /**
   * Generate a landscape A4 PDF of all import drafts for a company.
   * Returns the raw PDF buffer; the caller is responsible for setting HTTP headers.
   */
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

    const rows = await prisma.ebmImportDraft.findMany({
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

    const items = rows.map((row) => {
      const payload = row.payload as any;
      return {
        requestDate: row.lastReqDt ? ymdFromEbmDt(row.lastReqDt) : "—",
        dclNo: payload.dclNo || "—",
        itemNm: payload.itemNm || "—",
        qty: payload.qty != null ? String(payload.qty) : "—",
        qtyUnitCd: payload.qtyUnitCd || "—",
        spplrNm: payload.spplrNm || "—",
        agntNm: payload.agntNm || "—",
        invoiceAmount:
          payload.invcFcurAmt != null
            ? new Intl.NumberFormat("en-RW").format(Number(payload.invcFcurAmt))
            : "—",
        currency: payload.invcFcurCd || "—",
      };
    });

    const buffer = await renderImportsReport({
      company: { name: company.name, tin: company.TIN ?? "" },
      items,
      dateRange,
    });
    const filename = `imports_report_${new Date().toISOString().slice(0, 10)}.pdf`;
    req.res!.setHeader("Content-Type", "application/pdf");
    req.res!.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`,
    );
    req.res!.end(buffer);
  }
}
