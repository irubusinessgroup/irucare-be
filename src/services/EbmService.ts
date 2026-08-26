/* eslint-disable no-useless-escape */
/* eslint-disable @typescript-eslint/no-explicit-any */
import axios from "axios";
import { prisma } from "../utils/client";
import {
  EbmItemPayload,
  EbmStockPayload,
  EbmStockItem,
  EbmSalesPayload,
  EbmSalesItem,
  // EbmReceiptData,
  EbmInitPayload,
  EbmConnectionStatusResponse,
  EbmResponse,
  EbmInsurancePayload,
} from "../utils/interfaces/ebm";
import { getReceiptMessages } from "../utils/receipt-helpers";
import AppError from "../utils/error";

export class EbmService {
  private static readonly BASE_URL = process.env.EBM_API_BASE_URL;
  private static readonly EBM_ITEMS_URL = `${this.BASE_URL}/items/saveItems`;
  private static readonly EBM_STOCK_URL = `${this.BASE_URL}/stock/saveStockItems`;
  private static readonly EBM_SALES_URL = `${this.BASE_URL}/trnsSales/saveSales`;
  private static readonly EBM_INITIALIZER_URL = `${this.BASE_URL}/initializer/selectInitInfo`;
  private static readonly EBM_CUSTOMER_URL = `${this.BASE_URL}/branches/saveBrancheCustomers`;
  private static readonly EBM_USER_URL = `${this.BASE_URL}/branches/saveBrancheUsers`;
  private static readonly EBM_INSURANCE_URL = `${this.BASE_URL}/branches/saveBrancheInsurances`;
  private static readonly EBM_SAVE_PURCHASES_URL = `${this.BASE_URL}/trnsPurchase/savePurchases`;
  private static readonly EBM_STOCK_MASTER_URL = `${this.BASE_URL}/stockMaster/saveStockMaster`;
  private static readonly EBM_IMPORTS_URL = `${this.BASE_URL}/imports/selectImportItems`;
  private static readonly EBM_IMPORT_UPDATE_URL = `${this.BASE_URL}/imports/updateImportItems`;
  private static readonly EBM_SELECT_ITEMS_URL = `${this.BASE_URL}/items/selectItems`;
  private static readonly EBM_SELECT_STOCK_ITEMS_URL = `${this.BASE_URL}/stock/selectStockItems`;

  private static requireCompanyId(company: any): string {
    const companyId = company?.id || company?.companyId;
    if (!companyId || typeof companyId !== "string") {
      throw new AppError(
        "Company id is required to resolve the EBM-initialized branch.",
        400,
      );
    }
    return companyId;
  }

  private static requireBhfId(bhfId?: string | null): string {
    const value = bhfId?.trim();
    if (!value) {
      throw new AppError(
        "EBM bhfId is required. Initialize the company branch first.",
        400,
      );
    }
    return value;
  }

  /**
   * Initializes or verifies the EBM device with the server.
   */
  public static async initializeDevice(
    tin: string,
    bhfId: string,
    dvcSrlNo: string,
  ): Promise<EbmResponse> {
    const resolvedBhfId = this.requireBhfId(bhfId);
    const payload: EbmInitPayload = {
      tin: this.formatTin(tin),
      bhfId: resolvedBhfId,
      dvcSrlNo: dvcSrlNo,
    };

    try {
      const response = await axios.post<EbmResponse>(
        this.EBM_INITIALIZER_URL,
        payload,
      );
      // console.log("[EBM Init] Response:", JSON.stringify(response.data, null, 2));
      return response.data;
    } catch (error: any) {
      console.error("[EBM Init] Error:", error.message);
      return {
        resultCd: "E999",
        resultMsg: error.message || "Connection to EBM service failed",
        resultDt: new Date().toISOString(),
        data: null,
      };
    }
  }

  /**
   * Pings the configured EBM base URL to verify the service is reachable.
   * Any HTTP response means the endpoint is reachable; transport errors mean disconnected.
   */
  public static async checkConnection(): Promise<EbmConnectionStatusResponse> {
    const checkedAt = new Date().toISOString();
    const baseUrl = this.BASE_URL?.trim() || null;

    if (!baseUrl) {
      return {
        connected: false,
        status: "DISCONNECTED",
        message: "EBM_API_BASE_URL is not configured.",
        checkedAt,
        baseUrl: null,
      };
    }

    try {
      const response = await axios.get(baseUrl, {
        timeout: 5000,
        validateStatus: () => true,
      });

      return {
        connected: true,
        status: "CONNECTED",
        message: `EBM API is reachable at ${baseUrl} (HTTP ${response.status}).`,
        checkedAt,
        baseUrl,
        responseStatus: response.status,
      };
    } catch (error: any) {
      const reason =
        error?.code === "ECONNABORTED"
          ? "Connection to EBM API timed out."
          : error?.message || "Unable to reach EBM API.";

      return {
        connected: false,
        status: "DISCONNECTED",
        message: `EBM API is disconnected: ${reason}`,
        checkedAt,
        baseUrl,
      };
    }
  }

  /**
   * Maps local item data to EBM payload and sends it to the EBM service.
   */
  public static async saveItemToEBM(
    itemData: any,
    company: any,
    user: any,
    branchId?: string | null,
  ): Promise<EbmResponse> {
    const payload = await this.mapToEbmPayload(
      itemData,
      company,
      user,
      branchId,
    );

    try {
      const response = await axios.post<EbmResponse>(
        this.EBM_ITEMS_URL,
        payload,
      );
      return response.data;
    } catch (error: any) {
      return {
        resultCd: "E999",
        resultMsg: error.message || "Connection to EBM service failed",
        resultDt: new Date().toISOString(),
        data: null,
      };
    }
  }

  /**
   * Maps local stock receipt to EBM payload and sends it to the EBM service.
   */
  public static async saveStockToEBM(
    receipt: any,
    company: any,
    user: any,
    branchId?: string | null,
  ): Promise<EbmResponse> {
    // Stock receipts are single items, wrap in array for mapToEbmStockPayload
    const items = receipt.stocks ? receipt.stocks : [receipt];

    const payload = await this.mapToEbmStockPayload(
      "01", // SAR Type Code for stock receipt
      items,
      company,
      user,
      branchId,
      receipt.remarksNotes || "",
    );

    try {
      const response = await axios.post<EbmResponse>(
        this.EBM_STOCK_URL,
        payload,
      );
      return response.data;
    } catch (error: any) {
      return {
        resultCd: "E999",
        resultMsg: error.message || "Connection to EBM service failed",
        resultDt: new Date().toISOString(),
        data: null,
      };
    }
  }

  /**
   * Maps local sale record to EBM payload and sends it to the EBM service.
   */
  public static async saveSaleToEBM(
    sellRecord: any,
    company: any,
    user: any,
    branchId?: string | null,
    purchaseCode?: string,
  ): Promise<EbmResponse> {
    const payload = await this.mapToEbmSalesPayload(
      sellRecord,
      company,
      user,
      branchId,
      purchaseCode,
    );

    // console.log("EBM Sales Payload:", JSON.stringify(payload, null, 2));

    try {
      const response = await axios.post<EbmResponse>(
        this.EBM_SALES_URL,
        payload,
      );
      // console.log(
      //   "EBM Sales Response:",
      //   JSON.stringify(response.data, null, 2),
      // );
      return response.data;
    } catch (error: any) {
      // Fallback for Training/Proforma when EBM is offline
      if (
        (error.code === "ECONNREFUSED" || error.code === "ETIMEDOUT") &&
        (payload.salesTyCd === "T" || payload.salesTyCd === "P")
      ) {
        console.warn(
          "EBM Server offline. Returning MOCK success for Training/Proforma.",
        );
        return {
          resultCd: "000",
          resultMsg: "Mock Success (EBM Offline)",
          resultDt: new Date().toISOString(),
          data: {
            rcptNo: payload.invcNo,
            intrlData: "MOCK-INTERNAL-DATA",
            rcptSign: "MOCK-SIGNATURE",
            totRcptNo: 1,
            vsdcRcptPbctDate: new Date()
              .toISOString()
              .replace(/[-T:]/g, "")
              .slice(0, 14),
            sdcId: "MOCK-SDC-ID",
            mrcNo: "MOCK-MRC-NO",
          },
        };
      }

      return {
        resultCd: "E999",
        resultMsg: error.message || "Connection to EBM service failed",
        resultDt: new Date().toISOString(),
        data: null,
      };
    }
  }

  /**
   * Pings EBM server acknowledging that a purchase was successfully mapped locally.
   */
  public static async savePurchasesToEbm(
    tin: string,
    bhfId: string,
    purchaseInfo: any,
    statusOverride?: string,
  ): Promise<EbmResponse> {
    const payload = {
      tin: this.formatTin(tin),
      bhfId: this.requireBhfId(bhfId),
      invcNo: purchaseInfo.invcNo || purchaseInfo.spplrInvcNo || 0,
      orgInvcNo: purchaseInfo.orgInvcNo || 0,
      spplrTin: purchaseInfo.spplrTin,
      spplrNm: purchaseInfo.spplrNm || "Unknown",
      spplrBhfId: purchaseInfo.spplrBhfId || "00",
      spplrInvcNo: purchaseInfo.spplrInvcNo || purchaseInfo.invcNo,
      regTyCd: purchaseInfo.regTyCd || "A", // usually 'A' for auto-reg
      pchsTyCd: purchaseInfo.pchsTyCd || "N",
      rcptTyCd: purchaseInfo.rcptTyCd === "R" ? "R" : "P",
      pmtTyCd: purchaseInfo.pmtTyCd || "01",
      pchsSttsCd: statusOverride || "02", // default 02 -> APPROVED
      cfmDt: new Date()
        .toISOString()
        .replace(/[-T:\.Z]/g, "")
        .slice(0, 14),
      pchsDt: new Date()
        .toISOString()
        .replace(/[-T:\.Z]/g, "")
        .slice(0, 8),
      wrhsDt: new Date()
        .toISOString()
        .replace(/[-T:\.Z]/g, "")
        .slice(0, 14),
      cnclReqDt:
        statusOverride === "04"
          ? new Date()
              .toISOString()
              .replace(/[-T:\.Z]/g, "")
              .slice(0, 14)
          : null,
      cnclDt:
        statusOverride === "04"
          ? new Date()
              .toISOString()
              .replace(/[-T:\.Z]/g, "")
              .slice(0, 14)
          : null,
      rfdDt: null,
      totItemCnt: purchaseInfo.totItemCnt || purchaseInfo.itemList?.length || 0,
      taxblAmtA: purchaseInfo.taxblAmtA || 0,
      taxblAmtB: purchaseInfo.taxblAmtB || 0,
      taxblAmtC: purchaseInfo.taxblAmtC || 0,
      taxblAmtD: purchaseInfo.taxblAmtD || 0,
      taxRtA: purchaseInfo.taxRtA || 0,
      taxRtB: purchaseInfo.taxRtB || 0,
      taxRtC: purchaseInfo.taxRtC || 0,
      taxRtD: purchaseInfo.taxRtD || 0,
      taxAmtA: purchaseInfo.taxAmtA || 0,
      taxAmtB: purchaseInfo.taxAmtB || 0,
      taxAmtC: purchaseInfo.taxAmtC || 0,
      taxAmtD: purchaseInfo.taxAmtD || 0,
      totTaxblAmt: purchaseInfo.totTaxblAmt || 0,
      totTaxAmt: purchaseInfo.totTaxAmt || 0,
      totAmt: purchaseInfo.totAmt || 0,
      remark: purchaseInfo.remark || "Saved via Irucare Integration",
      regrId: purchaseInfo.regrId || "SYS",
      regrNm: purchaseInfo.regrNm || "System",
      modrId: purchaseInfo.modrId || "SYS",
      modrNm: purchaseInfo.modrNm || "System",
      itemList: purchaseInfo.itemList || [],
    };

    try {
      const response = await axios.post<EbmResponse>(
        this.EBM_SAVE_PURCHASES_URL,
        payload,
      );
      return response.data;
    } catch (error: any) {
      return {
        resultCd: "E999",
        resultMsg: error.message || "Connection to EBM service failed",
        resultDt: new Date().toISOString(),
        data: null,
      };
    }
  }

  /**
   * Fetch taxpayer imported items from EBM server.
   * Endpoint: /imports/selectImportItems
   */
  public static async fetchImportedItems(
    tin: string,
    bhfId: string,
    lastReqDt: string, // Expected format: yyyyMMddhhmmss
  ): Promise<EbmResponse> {
    const payload = {
      tin: this.formatTin(tin),
      bhfId: this.requireBhfId(bhfId),
      lastReqDt: lastReqDt,
    };

    try {
      const response = await axios.post<EbmResponse>(
        this.EBM_IMPORTS_URL,
        payload,
      );
      const itemList = Array.isArray(response.data?.data?.itemList)
        ? response.data.data.itemList.filter(
            (item: any) => !this.isCancelledImportRecord(item),
          )
        : [];

      return {
        ...response.data,
        data: {
          ...(response.data?.data ?? {}),
          itemList,
        },
      };
    } catch (error: any) {
      console.error(
        "EBM Fetch Imports Error:",
        error?.response?.data || error.message,
      );
      return {
        resultCd: "E999",
        resultMsg: error.message || "Connection to EBM service failed",
        resultDt: new Date().toISOString(),
        data: null,
      };
    }
  }

  /**
   * Fetch registered items (product list) from EBM server.
   * Endpoint: /items/selectItems
   */
  public static async fetchEbmItems(
    tin: string,
    bhfId: string,
    lastReqDt: string, // Expected format: yyyyMMddhhmmss
  ): Promise<EbmResponse> {
    const payload = {
      tin: this.formatTin(tin),
      bhfId: this.requireBhfId(bhfId),
      lastReqDt: lastReqDt,
    };

    try {
      const response = await axios.post<EbmResponse>(
        this.EBM_SELECT_ITEMS_URL,
        payload,
      );
      return response.data;
    } catch (error: any) {
      console.error(
        "EBM Fetch Items Error:",
        error?.response?.data || error.message,
      );
      return {
        resultCd: "E999",
        resultMsg: error.message || "Connection to EBM service failed",
        resultDt: new Date().toISOString(),
        data: null,
      };
    }
  }

  /**
   * Fetch stock movement list from EBM server.
   * Endpoint: /stock/selectStockItems
   */
  public static async fetchEbmStockItems(
    tin: string,
    bhfId: string,
    lastReqDt: string, // Expected format: yyyyMMddhhmmss
  ): Promise<EbmResponse> {
    const payload = {
      tin: this.formatTin(tin),
      bhfId: this.requireBhfId(bhfId),
      lastReqDt: lastReqDt,
    };

    try {
      const response = await axios.post<EbmResponse>(
        this.EBM_SELECT_STOCK_ITEMS_URL,
        payload,
      );
      return response.data;
    } catch (error: any) {
      console.error(
        "EBM Fetch Stock Items Error:",
        error?.response?.data || error.message,
      );
      return {
        resultCd: "E999",
        resultMsg: error.message || "Connection to EBM service failed",
        resultDt: new Date().toISOString(),
        data: null,
      };
    }
  }

  /**
   * Revise imported item information in EBM server.
   * Endpoint: /imports/updateImportItems
   */
  public static async updateImportItem(
    tin: string,
    bhfId: string,
    importData: any,
    itemCode: string,
    user: any,
  ): Promise<EbmResponse> {
    // CRITICAL: Validate that imptItemSttsCd is provided and not left to default
    // Default "1" causes status reversions to initial state in RRA - BUG FIX
    const imptItemSttsCd = importData.imptItemSttsCd;
    if (
      !imptItemSttsCd ||
      !["1", "2", "3", "4"].includes(String(imptItemSttsCd))
    ) {
      console.warn(
        `[EBM Warning] updateImportItem called without valid imptItemSttsCd. Using: ${imptItemSttsCd}`,
      );
    }

    const payload = {
      tin: this.formatTin(tin),
      bhfId: this.requireBhfId(bhfId),
      taskCd: importData.taskCd,
      dclDe: importData.dclDe,
      itemSeq: importData.itemSeq,
      hsCd: importData.hsCd,
      itemClsCd: "5022110801", // Using standard imported classification code from spec
      itemCd: itemCode,
      imptItemSttsCd: imptItemSttsCd, // Use provided status code only - NO DEFAULT
      remark: importData.remark || "Imported item added to local stock",
      modrNm:
        `${user.firstName || ""} ${user.lastName || ""}`
          .trim()
          .substring(0, 20) || "Admin",
      modrId: this.formatUserId(
        user.username || user.email || user.id || "Admin",
      ),
    };

    try {
      const response = await axios.post<EbmResponse>(
        this.EBM_IMPORT_UPDATE_URL,
        payload,
      );

      // console.log(`EBM Import Update Response [${itemCode}]:`, response.data);
      return response.data;
    } catch (error: any) {
      console.error(
        "EBM Update Import Error:",
        error?.response?.data || error.message,
      );
      return {
        resultCd: "E999",
        resultMsg: error.message || "Connection to EBM service failed",
        resultDt: new Date().toISOString(),
        data: null,
      };
    }
  }

  private static async mapToEbmPayload(
    item: any,
    company: any,
    user: any,
    branchId?: string | null,
  ): Promise<EbmItemPayload> {
    const bhfId = await this.resolveCompanyBhfId(this.requireCompanyId(company));
    const itemTyCd = this.generateItemTyCd(item);
    const itemClsCd = "5059690800"; // Generic classification default

    const tin = this.formatTin(company.TIN);

    return {
      tin: tin,
      bhfId: bhfId,
      itemCd: item.productCode || "",
      itemClsCd: itemClsCd,
      itemTyCd: itemTyCd,
      itemNm: item.itemFullName || "",
      orgnNatCd: "RW",
      pkgUnitCd: "NT",
      qtyUnitCd: "U",
      taxTyCd: item.taxCode || "A",
      dftPrc: Number(item.expectedSellPrice || item.insurancePrice || 0),
      isrcAplcbYn: Number(item.insurancePrice || 0) > 0 ? "Y" : "N",
      useYn: "Y",
      regrNm: `${user.firstName} ${user.lastName}`.trim(),
      regrId: this.formatUserId(user.email || user.id),
      modrNm: `${user.firstName} ${user.lastName}`.trim(),
      modrId: this.formatUserId(user.email || user.id),
    };
  }

  public static async saveStockItems(
    sarTyCd: string,
    items: any[],
    company: any,
    user: any,
    branchId?: string | null,
    remark?: string,
  ): Promise<EbmResponse> {
    try {
      if (!company?.TIN) {
        throw new Error(
          "Company TIN missing for EBM Stock Item synchronization",
        );
      }

      const payload = await this.mapToEbmStockPayload(
        sarTyCd,
        items,
        company,
        user,
        branchId,
        remark,
      );

      // Save to RRA natively
      const response = await axios.post<EbmResponse>(
        this.EBM_STOCK_URL,
        payload,
      );

      if (response.data?.resultCd !== "000") {
        throw new Error(`EBM Rejected Stock Item: ${response.data?.resultMsg}`);
      }

      return response.data;
    } catch (error: any) {
      console.error(
        `EBM Save Stock Items Error [SAR Code ${sarTyCd}]:`,
        error?.response?.data || error.message,
      );
      throw new Error(
        error?.response?.data?.resultMsg ||
          error.message ||
          "EBM Save Stock Items failed",
      );
    }
  }

  private static async mapToEbmStockPayload(
    sarTyCd: string,
    items: any[],
    company: any,
    user: any,
    branchId?: string | null,
    remark?: string,
  ): Promise<EbmStockPayload> {
    const bhfId = await this.resolveCompanyBhfId(this.requireCompanyId(company));
    const tin = this.formatTin(company.TIN);

    // generateSarNo needs a unique fast seed
    const sarNo = Number(new Date().getTime().toString().slice(-9)) || 1;

    const occurrenceDate = new Date()
      .toISOString()
      .split("T")[0]
      .replace(/-/g, "");

    let totTaxblAmt = 0;
    let totTaxAmt = 0;
    let totAmt = 0;

    const stockItemList: EbmStockItem[] = items.map(
      (item: any, index: number) => {
        // Extract from multiple sources (SellItem, Inventory, or ReceiptItem)
        const qty = Math.abs(
          Number(item.quantity || item.quantityReceived || item.delta || 0),
        );
        const prcRaw = Number(
          item.sellPrice || item.unitCost || item.item?.expectedSellPrice || 0,
        );
        const prc = Number(prcRaw.toFixed(2));
        const taxRate = Number(item.item?.taxRate || item.taxRate || 0);

        const splyAmt = Number((prc * qty).toFixed(2));
        const taxAmt = Number(
          (splyAmt * (taxRate / (100 + taxRate))).toFixed(2),
        );
        const itemTotAmt = Number((splyAmt + taxAmt).toFixed(2));

        totTaxblAmt += splyAmt;
        totTaxAmt += taxAmt;
        totAmt += itemTotAmt;

        return {
          itemSeq: index + 1,
          itemCd: item.item?.productCode || item.productCode || "",
          itemClsCd: "5059690800",
          itemNm: item.item?.itemFullName || item.itemFullName || "",
          bcd: null,
          pkgUnitCd: "NT",
          pkg: Number(item.packSize || 1),
          qtyUnitCd: "U",
          qty: qty,
          itemExprDt: item.expiryDate
            ? new Date(item.expiryDate)
                .toISOString()
                .split("T")[0]
                .replace(/-/g, "")
            : null,
          prc: prc,
          splyAmt: splyAmt,
          totDcAmt: 0,
          taxblAmt: splyAmt,
          taxTyCd: item.item?.taxCode || item.taxCode || "A",
          taxAmt: taxAmt,
          totAmt: itemTotAmt,
        };
      },
    );

    const regrName = `${user.firstName} ${user.lastName}`.trim();
    const regrId = this.formatUserId(user.email || user.id);

    return {
      tin: tin,
      bhfId: bhfId,
      sarNo: sarNo,
      orgSarNo: sarNo,
      regTyCd: "M", // Explicit Manual trigger requested by CIS schemas
      custTin: null,
      custNm: null,
      custBhfId: null,
      sarTyCd: sarTyCd,
      ocrnDt: occurrenceDate,
      totItemCnt: stockItemList.length,
      totTaxblAmt: Number(totTaxblAmt.toFixed(2)),
      totTaxAmt: Number(totTaxAmt.toFixed(2)),
      totAmt: Number(totAmt.toFixed(2)),
      remark: remark || `Automated EBM Stock Action ${sarTyCd}`,
      regrId: regrId,
      regrNm: regrName,
      modrId: regrId,
      modrNm: regrName,
      itemList: stockItemList,
    };
  }

  private static async mapToEbmSalesPayload(
    sell: any,
    company: any,
    user: any,
    branchId?: string | null,
    purchaseCode?: string,
  ): Promise<EbmSalesPayload> {
    const bhfId = await this.resolveCompanyBhfId(this.requireCompanyId(company));
    const tin = this.formatTin(company.TIN);

    // Use provided invoice number or generate if missing
    const invcNo =
      sell.invcNo && Number(sell.invcNo) > 0
        ? Number(sell.invcNo)
        : this.generateSarNo(sell.id);
    const salesDate = new Date(sell.createdAt || new Date())
      .toISOString()
      .split("T")[0]
      .replace(/-/g, "");
    const cfmDt = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);

    // Refund Logic
    const isRefund = sell.type === "REFUND";

    let rcptTyCd = isRefund ? "R" : "S";
    let salesTyCd = "N";

    if ((sell as any).isTrainingMode) {
      salesTyCd = "T";
    } else if (sell.type === "PROFORMA") {
      salesTyCd = "P";
      rcptTyCd = "S";
    }

    // Purchase Code (mandatory for INSUREE and B2B Refunds)
    // For Refunds, we need original invoice number (invcNo), not receipt number (rcptNo)
    const orgInvcNo =
      isRefund && sell.parentSell?.invcNo ? sell.parentSell.invcNo : 0;

    // It is a generated code from the buyer. We cannot fallback to receipt number.
    const prcOrdCd = purchaseCode || null;

    // If we don't have a Purchase Code, we CANNOT send custTin, otherwise EBM demands the code.
    // Downgrading to Consumer Refund if code is missing.
    const custTin = prcOrdCd
      ? this.formatTin(sell.client?.tin || sell.customerTin)
      : null;
    const custNm = sell.client?.name || sell.customerName || null;

    const itemList: EbmSalesItem[] = sell.sellItems.map(
      (item: any, index: number) => {
        const qty = Math.abs(Number(item.quantity || 0));
        const taxRate = Number(item.item?.taxRate || 0);
        const unitPrice = Math.abs(Number(item.sellPrice || 0));
        const discount = Math.abs(Number(item.discount || 0));

        // EBM Requirement & Receipt Logic: Inputs are Tax Inclusive.
        const prc = Number(unitPrice.toFixed(2));

        // Supply Amount (Inclusive) = Inclusive Price * Quantity
        const splyAmt = Number((prc * qty).toFixed(2));

        // Discount Rate
        const dcRt = discount;

        // Discount Amount
        let dcAmt = 0;
        if (discount > 0) {
          dcAmt = Number((splyAmt * (discount / 100)).toFixed(2));
        }

        // Total Amount (Inclusive) = Supply - Discount
        const totAmt = Number((splyAmt - dcAmt).toFixed(2));

        // EBM expects the line taxable amount to be the gross line amount.
        // The tax is reported separately in taxAmt.
        // Use stored tax to avoid recomputing and drifting on rounding.
        const taxAmt = Math.abs(Number(Number(item.taxAmount || 0).toFixed(2)));
        const taxblAmt = Math.abs(Number(totAmt.toFixed(2)));

        // Insurance fields logic
        const isrccCd = sell.insuranceCard?.insurance?.tin || null;
        const isrccNm = sell.insuranceCard?.insurance?.name || null;

        let isrcRt = null;
        let isrcAmt = null;

        // Only populate insurance fields when the sale is genuinely insured:
        // client must be INSUREE, have a card, and have a non-zero coverage percentage.
        const isActuallyInsured =
          sell.clientType === "INSUREE" &&
          !!sell.insuranceCardId &&
          sell.insurancePercentage !== null &&
          sell.insurancePercentage !== undefined &&
          Number(sell.insurancePercentage) > 0;

        if (isActuallyInsured) {
          // EBM expects Insurance Coverage Rate (e.g. 90%), but system stores Client Pay Rate (e.g. 10%)
          isrcRt = 100 - Number(sell.insurancePercentage);

          // amount covered by insurance for this line item
          if (item.insuranceCoveredPerUnit) {
            isrcAmt = Math.abs(
              Number((Number(item.insuranceCoveredPerUnit) * qty).toFixed(2)),
            );
          }
        }

        return {
          itemSeq: index + 1,
          itemCd: item.item?.productCode || "",
          itemClsCd: "5059690800",
          itemNm: item.item?.itemFullName || "",
          bcd: null,
          pkgUnitCd: "NT",
          pkg: 1,
          qtyUnitCd: "U",
          qty: qty,
          prc: prc,
          splyAmt: splyAmt,
          dcRt: dcRt,
          dcAmt: dcAmt,
          isrccCd: isrccCd,
          isrccNm: isrccNm,
          isrcRt: isrcRt,
          isrcAmt: isrcAmt,
          taxTyCd: item.item?.taxCode || "A",
          taxblAmt: taxblAmt,
          taxAmt: taxAmt,
          totAmt: totAmt,
        };
      },
    );

    const totTaxblAmt = Number(
      itemList.reduce((sum, item) => sum + item.taxblAmt, 0).toFixed(2),
    );
    const totTaxAmt = Number(
      itemList.reduce((sum, item) => sum + Number(item.taxAmt), 0).toFixed(2),
    );
    const totAmt = Number(
      itemList.reduce((sum, item) => sum + item.totAmt, 0).toFixed(2),
    );

    const getTaxTotals = (ty: string) => {
      const filtered = itemList.filter((i) => i.taxTyCd === ty);
      const taxableAmount = Number(
        filtered.reduce((sum, i) => sum + Number(i.totAmt), 0).toFixed(2),
      );
      return {
        bl: taxableAmount,
        rt: ty === "B" || filtered.some((i) => i.taxTyCd === "B") ? 18 : 0,
        amt: Number(
          filtered.reduce((sum, i) => sum + Number(i.taxAmt), 0).toFixed(2),
        ),
      };
    };

    const taxA = getTaxTotals("A");
    const taxB = getTaxTotals("B");
    const taxC = getTaxTotals("C");
    const taxD = getTaxTotals("D");

    const regrNm = `${user.firstName} ${user.lastName}`.trim();
    const regrId = this.formatUserId(user.email || user.id);

    return {
      tin: tin,
      bhfId: bhfId,
      invcNo: invcNo,
      orgInvcNo: orgInvcNo,
      custTin: sell.client?.tin ? this.formatTin(sell.client.tin) : null,
      prcOrdCd: prcOrdCd,
      custNm: sell.client?.name || null,
      salesTyCd: salesTyCd,
      rcptTyCd: rcptTyCd,
      // Map Prisma Database Enums to explicit RRA Code Classification 07 (Payment Methods)
      pmtTyCd: (() => {
        // 02 CREDIT maps automatically to B2B TIN transactions or INSUREE mode
        if (sell.clientType === "INSUREE" || !!sell.client?.tin) return "02";
        if (sell.paymentMode === "CREDIT") return "02";
        // 03 CASH/CREDIT perfectly handles HALF_PAID combinations
        if (sell.paymentMode === "HALF_PAID") return "03";
        // 01-07 Exact Classification Mapping for standard modes
        switch (sell.paymentMethod) {
          case "CASH":
            return "01";
          case "BANK_CHECK":
          case "CHEQUE":
            return "04";
          case "CARD":
            return "05";
          case "MOBILE_PAYMENT":
          case "MOBILE_MONEY":
          case "MOMO":
          case "AIRTEL_MONEY":
          case "MTN_MOBILE_MONEY":
            return "06"; // Mobile Money fallback network
          case "BANK_TRANSFER":
            return "07"; // Other fallback
          default:
            return "01"; // Safety fallback
        }
      })(),
      salesSttsCd: "02",
      cfmDt: cfmDt,
      salesDt: salesDate,
      stockRlsDt: cfmDt,
      cnclReqDt: null,
      cnclDt: null,
      rfdDt: isRefund ? cfmDt : null,
      rfdRsnCd: isRefund ? sell.refundReasonCode || "06" : null,
      totItemCnt: itemList.length,
      taxblAmtA: taxA.bl,
      taxblAmtB: taxB.bl,
      taxblAmtC: taxC.bl,
      taxblAmtD: taxD.bl,
      taxRtA: taxA.rt,
      taxRtB: taxB.rt,
      taxRtC: taxC.rt,
      taxRtD: taxD.rt,
      taxAmtA: taxA.amt,
      taxAmtB: taxB.amt,
      taxAmtC: taxC.amt,
      taxAmtD: taxD.amt,
      totTaxblAmt: totTaxblAmt,
      totTaxAmt: Number(totTaxAmt.toFixed(2)),
      totAmt: totAmt,
      prchrAcptcYn: "N",
      remark: sell.notes || (isRefund ? sell.refundReasonNote : null),
      regrId: regrId,
      regrNm: regrNm,
      modrId: regrId,
      modrNm: regrNm,
      receipt: {
        custTin: custTin, // Use properly sanitized TIN
        custMblNo: sell.client?.phone || null,
        rptNo: 1,
        trdeNm: company.name || "",
        ...getReceiptMessages(company),
        prchrAcptcYn: "N",
      },
      itemList: itemList,
    };
  }

  private static formatTin(rawTin: string): string {
    const cleaned = (rawTin || "").trim();
    if (cleaned.length > 0 && /^\d+$/.test(cleaned)) {
      return cleaned.padStart(9, "0");
    }
    return cleaned;
  }

  public static generateSarNo(id: string): number {
    const hex = id.replace(/-/g, "").slice(-8);
    const fullNumber = parseInt(hex, 16);
    // Use modulo to keep under INT4 max value (2,147,483,647)
    // This generates numbers from 0 to 2147483646
    return (fullNumber % 2147483647) + 1; // +1 to start from 1 instead of 0
  }

  /**
   * Returns the bhfId of the company's EBM-initialized branch, or null.
   * Prefer Branch.isEbmInitialized, then CompanyTools.ebmBhfId cache.
   */
  public static async getInitializedBhfId(
    companyId: string,
  ): Promise<string | null> {
    const active = await prisma.branch.findFirst({
      where: { companyId, isEbmInitialized: true },
      select: { bhfId: true },
    });
    if (active?.bhfId?.trim()) return active.bhfId.trim();

    const tools = await prisma.companyTools.findFirst({
      where: { companyId },
      select: { ebmBhfId: true, ebmDeviceSerialNumber: true },
    });
    const cached = tools?.ebmBhfId?.trim();
    if (!cached) return null;

    // Heal: tools has ebmBhfId but branch flag was never set (legacy / partial init)
    const matching = await prisma.branch.findFirst({
      where: { companyId, bhfId: cached },
      select: { id: true },
    });
    if (matching) {
      await prisma.$transaction([
        prisma.branch.updateMany({
          where: { companyId, isEbmInitialized: true },
          data: { isEbmInitialized: false },
        }),
        prisma.branch.update({
          where: { id: matching.id },
          data: {
            isEbmInitialized: true,
            ebmDeviceSerialNumber: tools?.ebmDeviceSerialNumber ?? null,
          },
        }),
      ]);
    }

    return cached;
  }

  /**
   * Company-level / VSDC EBM calls must use the branch the device was
   * initialized with. Never invent "00" — that causes Missing Header / cmc_key_enc errors.
   */
  public static async resolveCompanyBhfId(companyId: string): Promise<string> {
    const bhfId = await this.getInitializedBhfId(companyId);
    if (bhfId) return bhfId;

    throw new AppError(
      "No EBM-initialized branch for this company. Open RRA/EBM Settings and initialize the device for the correct branch first.",
      400,
    );
  }

  /**
   * Resolve bhfId for EBM payloads.
   * Always prefer the company EBM-initialized branch over a user's local branch UUID.
   * (TIN may have many branches; VSDC keys are tin/bhfId/serial — wrong bhfId = header errors.)
   */
  public static async resolveEbmBhfId(
    companyId: string,
    _branchId?: string | null,
  ): Promise<string> {
    return this.resolveCompanyBhfId(companyId);
  }

  /** @deprecated use resolveEbmBhfId / resolveCompanyBhfId */
  private static async resolveBhfId(
    branchId?: string | null,
    companyId?: string,
  ): Promise<string> {
    if (companyId) {
      return this.resolveCompanyBhfId(companyId);
    }

    if (branchId && /^\d{2}$/.test(branchId)) {
      return branchId;
    }

    if (branchId) {
      const branch = await prisma.branch.findUnique({
        where: { id: branchId },
        select: { bhfId: true, companyId: true, isEbmInitialized: true },
      });
      if (branch?.companyId) {
        return this.resolveCompanyBhfId(branch.companyId);
      }
      if (branch?.bhfId) return branch.bhfId;
    }

    throw new AppError(
      "Unable to resolve EBM branch (bhfId). Initialize the device for a company branch first.",
      400,
    );
  }

  /**
   * Mark one branch as the EBM-initialized/active branch for the company.
   * Clears the flag on all other branches.
   */
  public static async markBranchEbmInitialized(opts: {
    companyId: string;
    bhfId: string;
    dvcSrlNo: string;
  }): Promise<void> {
    const bhfId = opts.bhfId.trim();
    const serial = opts.dvcSrlNo.trim();

    const branch = await prisma.branch.findFirst({
      where: { companyId: opts.companyId, bhfId },
      select: { id: true },
    });

    if (!branch) {
      throw new AppError(
        `Branch with bhfId "${bhfId}" was not found for this company. Create the branch first, then initialize EBM.`,
        400,
      );
    }

    await prisma.$transaction([
      prisma.branch.updateMany({
        where: { companyId: opts.companyId, isEbmInitialized: true },
        data: { isEbmInitialized: false },
      }),
      prisma.branch.update({
        where: { id: branch.id },
        data: {
          isEbmInitialized: true,
          ebmDeviceSerialNumber: serial,
        },
      }),
    ]);
  }

  private static generateItemTyCd(item: any): string {
    const name = (item.itemFullName || "").toLowerCase();
    const serviceKeywords = [
      "service",
      "consultation",
      "repair",
      "training",
      "visit",
      "fee",
    ];

    if (serviceKeywords.some((kw) => name.includes(kw))) {
      return "2";
    }

    return "1";
  }

  private static formatUserId(id: string): string {
    return (id || "").substring(0, 20);
  }

  private static normalizeStatus(value: unknown): string {
    return String(value ?? "")
      .trim()
      .toUpperCase();
  }

  private static coerceRecord(record: any): any {
    if (typeof record !== "string") return record;

    try {
      return JSON.parse(record);
    } catch {
      return record;
    }
  }

  public static isCancelledPurchaseRecord(record: any): boolean {
    const payload = this.coerceRecord(record);
    const status = this.normalizeStatus(
      payload?.pchsSttsCd ?? payload?._localEbmStatus ?? payload?.status,
    );

    return (
      status === "04" ||
      status === "CANCELLED" ||
      status === "CANCELED" ||
      payload?.cnclDt != null ||
      payload?.cnclReqDt != null ||
      payload?.cancelledAt != null ||
      payload?.isCancelled === true
    );
  }

  public static isCancelledImportRecord(record: any): boolean {
    const payload = this.coerceRecord(record);
    const status = this.normalizeStatus(
      payload?.imptItemSttsCd ?? payload?._localEbmStatus ?? payload?.status,
    );

    return (
      status === "4" ||
      status === "CANCELLED" ||
      status === "CANCELED" ||
      payload?.cnclDt != null ||
      payload?.cnclReqDt != null ||
      payload?.cancelledAt != null ||
      payload?.isCancelled === true
    );
  }

  /**
   * Fetches EBM notices for a company
   */
  public static async fetchNotices(
    tin: string,
    bhfId: string,
    lastReqDt: string,
  ): Promise<EbmResponse> {
    const url = `${this.BASE_URL}/notices/selectNotices`;

    try {
      const response = await axios.post<EbmResponse>(url, {
        tin: this.formatTin(tin),
        bhfId: this.requireBhfId(bhfId),
        lastReqDt,
      });
      return response.data;
    } catch (error: any) {
      return {
        resultCd: "E999",
        resultMsg: error.message || "Failed to fetch EBM notices",
        resultDt: new Date().toISOString(),
        data: null,
      };
    }
  }

  /**
   * Fetches EBM unregistered purchases for a company
   */
  public static async fetchPurchases(
    tin: string,
    bhfId: string,
    lastReqDt: string,
  ): Promise<EbmResponse> {
    const url = `${this.BASE_URL}/trnsPurchase/selectTrnsPurchaseSales`;

    try {
      const response = await axios.post<EbmResponse>(url, {
        tin: this.formatTin(tin),
        bhfId: this.requireBhfId(bhfId),
        lastReqDt,
      });
      const saleList = Array.isArray(response.data?.data?.saleList)
        ? response.data.data.saleList.filter(
            (sale: any) => !this.isCancelledPurchaseRecord(sale),
          )
        : [];

      return {
        ...response.data,
        data: {
          ...(response.data?.data ?? {}),
          saleList,
        },
      };
    } catch (error: any) {
      return {
        resultCd: "E999",
        resultMsg: error.message || "Failed to fetch EBM purchases",
        resultDt: new Date().toISOString(),
        data: null,
      };
    }
  }

  /**
   * Saves customer to EBM
   */
  public static async saveCustomerToEBM(
    clientData: any,
    company: any,
    user: any,
    branchId?: string | null,
  ): Promise<EbmResponse> {
    try {
      // Generate customer number - must be exactly 9 characters
      let custNo: string;
      if (clientData.phone && clientData.phone.length >= 9) {
        // Use last 9 digits of phone number
        custNo = clientData.phone.slice(-9);
      } else {
        // Generate 9-digit number using timestamp
        custNo = String(Date.now()).slice(-9);
      }

      const payload: any = {
        tin: this.formatTin(company.TIN),
        bhfId: await this.resolveCompanyBhfId(this.requireCompanyId(company)),
        custNo: custNo,
        ...(clientData.tin ? { custTin: clientData.tin } : {}),
        custNm: clientData.name,
        adrs: clientData.address || null,
        telNo: clientData.phone || null,
        email: clientData.email || null,
        faxNo: null,
        useYn: "Y",
        remark: null,
        regrNm: `${user.firstName} ${user.lastName}`,
        regrId: this.formatUserId(user.id),
        modrNm: `${user.firstName} ${user.lastName}`,
        modrId: this.formatUserId(user.id),
      };

      const response = await axios.post<EbmResponse>(
        this.EBM_CUSTOMER_URL,
        payload,
      );
      return response.data;
    } catch (error: any) {
      return {
        resultCd: "E999",
        resultMsg: error.message || "Failed to save customer to EBM",
        resultDt: new Date().toISOString(),
        data: null,
      };
    }
  }

  /**
   * Saves user/staff to EBM
   */
  public static async saveUserToEBM(
    userData: any,
    company: any,
    creatorUser: any,
    branchId?: string | null,
  ): Promise<EbmResponse> {
    try {
      const userId =
        userData.firstName && userData.lastName
          ? `${userData.firstName}${userData.lastName}`
              .toLowerCase()
              .replace(/\s+/g, "")
          : userData.email?.split("@")[0] || `user${Date.now()}`;

      const payload: any = {
        tin: this.formatTin(company.TIN),
        bhfId: await this.resolveCompanyBhfId(this.requireCompanyId(company)),
        userId: userId,
        userNm: `${userData.firstName} ${userData.lastName}`,
        pwd: "12341234", // Default password for EBM
        adrs: null,
        cntc: userData.phoneNumber || null,
        authCd: null,
        remark: null,
        useYn: "Y",
        regrNm: `${creatorUser.firstName} ${creatorUser.lastName}`,
        regrId: this.formatUserId(creatorUser.id),
        modrNm: `${creatorUser.firstName} ${creatorUser.lastName}`,
        modrId: this.formatUserId(creatorUser.id),
      };

      const response = await axios.post<EbmResponse>(
        this.EBM_USER_URL,
        payload,
      );
      return response.data;
    } catch (error: any) {
      return {
        resultCd: "E999",
        resultMsg: error.message || "Failed to save user to EBM",
        resultDt: new Date().toISOString(),
        data: null,
      };
    }
  }

  /**
   * Saves insurance to EBM
   */
  public static async saveInsuranceToEBM(
    insuranceData: any,
    company: any,
    user: any,
    _branchId?: string | null,
  ): Promise<EbmResponse> {
    try {
      const resolvedBhfId = await EbmService.resolveCompanyBhfId(
        this.requireCompanyId(company),
      );

      const payload: EbmInsurancePayload = {
        tin: this.formatTin(company.TIN),
        bhfId: resolvedBhfId,
        isrccCd: insuranceData.isrccCd,
        isrccNm: insuranceData.isrccNm,
        isrcRt: Number(insuranceData.isrcRt),
        useYn: insuranceData.useYn || "Y",
        regrNm: `${user.firstName} ${user.lastName}`,
        regrId: this.formatUserId(user.id),
        modrNm: `${user.firstName} ${user.lastName}`,
        modrId: this.formatUserId(user.id),
      };

      const response = await axios.post<EbmResponse>(
        this.EBM_INSURANCE_URL,
        payload,
      );
      return response.data;
    } catch (error: any) {
      return {
        resultCd: "E999",
        resultMsg: error.message || "Failed to save insurance to EBM",
        resultDt: new Date().toISOString(),
        data: null,
      };
    }
  }

  /**
   * Syncs current stock quantity (rsdQty) to EBM via stockMaster
   */
  public static async saveStockMasterToEbm(
    tin: string,
    bhfId: string,
    itemCode: string,
    rsdQty: number,
    userAuthInfo: {
      firstName: string;
      lastName: string;
      id: string | undefined;
      email: string | undefined;
    },
  ): Promise<EbmResponse> {
    const payload = {
      tin: this.formatTin(tin),
      bhfId: this.requireBhfId(bhfId),
      itemCd: itemCode,
      rsdQty: Number(rsdQty),
      regrId: this.formatUserId(
        userAuthInfo.email || userAuthInfo.id || "Admin",
      ),
      regrNm: `${userAuthInfo.firstName} ${userAuthInfo.lastName}`.trim(),
      modrId: this.formatUserId(
        userAuthInfo.email || userAuthInfo.id || "Admin",
      ),
      modrNm: `${userAuthInfo.firstName} ${userAuthInfo.lastName}`.trim(),
    };

    try {
      const response = await axios.post<EbmResponse>(
        this.EBM_STOCK_MASTER_URL,
        payload,
      );
      return response.data;
    } catch (error: any) {
      return {
        resultCd: "E999",
        resultMsg:
          error.message || "Connection to EBM stockMaster service failed",
        resultDt: new Date().toISOString(),
        data: null,
      };
    }
  }
}
