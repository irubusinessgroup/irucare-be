import axios from "axios";
import { prisma } from "../utils/client";
import {
  EbmItemPayload,
  EbmStockPayload,
  EbmStockItem,
  EbmPurchasePayload,
  EbmPurchaseItem,
  EbmSalesPayload,
  EbmSalesItem,
  EbmReceiptData,
  EbmInitPayload,
  EbmResponse,
} from "../utils/interfaces/ebm";

export class EbmService {
  private static readonly BASE_URL = process.env.EBM_API_BASE_URL;
  private static readonly EBM_ITEMS_URL = `${this.BASE_URL}/items/saveItems`;
  private static readonly EBM_STOCK_URL = `${this.BASE_URL}/stock/saveStockItems`;
  private static readonly EBM_PURCHASE_URL = `${this.BASE_URL}/trnsPurchase/savePurchases`;
  private static readonly EBM_SALES_URL = `${this.BASE_URL}/trnsSales/saveSales`;
  private static readonly EBM_INITIALIZER_URL = `${this.BASE_URL}/initializer/selectInitInfo`;

  /**
   * Initializes or verifies the EBM device with the server.
   */
  public static async initializeDevice(
    tin: string,
    bhfId: string,
    dvcSrlNo: string,
  ): Promise<EbmResponse> {
    const payload: EbmInitPayload = {
      tin: this.formatTin(tin),
      bhfId: bhfId || "00",
      dvcSrlNo: dvcSrlNo,
    };

    try {
      const response = await axios.post<EbmResponse>(this.EBM_INITIALIZER_URL, payload);
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
      const response = await axios.post<EbmResponse>(this.EBM_ITEMS_URL, payload);
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
    const payload = await this.mapToEbmStockPayload(
      receipt,
      company,
      user,
      branchId,
    );

    try {
      const response = await axios.post<EbmResponse>(this.EBM_STOCK_URL, payload);
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
   * Maps local purchase order to EBM payload and sends it to the EBM service.
   */
  public static async savePurchaseToEBM(
    purchaseOrder: any,
    company: any,
    user: any,
    branchId?: string | null,
  ): Promise<EbmResponse> {
    const payload = await this.mapToEbmPurchasePayload(
      purchaseOrder,
      company,
      user,
      branchId,
    );

    try {
      const response = await axios.post<EbmResponse>(this.EBM_PURCHASE_URL, payload);
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
  ): Promise<EbmResponse> {
    const payload = await this.mapToEbmSalesPayload(
      sellRecord,
      company,
      user,
      branchId,
    );

    try {
      const response = await axios.post<EbmResponse>(this.EBM_SALES_URL, payload);
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

  private static async mapToEbmPayload(
    item: any,
    company: any,
    user: any,
    branchId?: string | null,
  ): Promise<EbmItemPayload> {
    const bhfId = await this.resolveBhfId(branchId);
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
      dftPrc: Number(item.insurancePrice || 0),
      isrcAplcbYn: Number(item.insurancePrice || 0) > 0 ? "Y" : "N",
      useYn: "Y",
      regrNm: `${user.firstName} ${user.lastName}`.trim(),
      regrId: user.email || user.id,
      modrNm: `${user.firstName} ${user.lastName}`.trim(),
      modrId: user.email || user.id,
    };
  }

  private static async mapToEbmStockPayload(
    receipt: any,
    company: any,
    user: any,
    branchId?: string | null,
  ): Promise<EbmStockPayload> {
    const bhfId = await this.resolveBhfId(branchId);
    const tin = this.formatTin(company.TIN);

    const sarNo = this.generateSarNo(receipt.id);

    const occurrenceDate = new Date(receipt.dateReceived)
      .toISOString()
      .split("T")[0]
      .replace(/-/g, "");

    const splyAmt = Number(receipt.totalCost || 0);
    const taxRate = Number(receipt.item?.taxRate || 0);
    const taxAmt = Number((splyAmt * (taxRate / 100)).toFixed(2));

    const stockItem: EbmStockItem = {
      itemSeq: 1,
      itemCd: receipt.item?.productCode || "",
      itemClsCd: "5059690800",
      itemNm: receipt.item?.itemFullName || "",
      bcd: null,
      pkgUnitCd: "AM",
      pkg: Number(receipt.packSize || 1),
      qtyUnitCd: "U",
      qty: Number(receipt.quantityReceived || 0),
      itemExprDt: receipt.expiryDate
        ? new Date(receipt.expiryDate).toISOString().split("T")[0].replace(/-/g, "")
        : null,
      prc: Number(receipt.unitCost || 0),
      splyAmt: splyAmt,
      totDcAmt: 0,
      taxblAmt: splyAmt,
      taxTyCd: receipt.item?.taxCode || "A",
      taxAmt: taxAmt,
      totAmt: splyAmt,
    };

    const regrName = `${user.firstName} ${user.lastName}`.trim();
    const regrId = user.email || user.id;

    return {
      tin: tin,
      bhfId: bhfId,
      sarNo: sarNo,
      orgSarNo: sarNo,
      regTyCd: "M",
      custTin: null,
      custNm: null,
      custBhfId: null,
      sarTyCd: "11",
      ocrnDt: occurrenceDate,
      totItemCnt: 1,
      totTaxblAmt: splyAmt,
      totTaxAmt: taxAmt,
      totAmt: splyAmt,
      remark: receipt.remarksNotes || null,
      regrId: regrId,
      regrNm: regrName,
      modrId: regrId,
      modrNm: regrName,
      itemList: [stockItem],
    };
  }

  private static async mapToEbmPurchasePayload(
    po: any,
    company: any,
    user: any,
    branchId?: string | null,
  ): Promise<EbmPurchasePayload> {
    const bhfId = await this.resolveBhfId(branchId);
    const tin = this.formatTin(company.TIN);

    // Map unique invcNo from poNumber (extracting numeric parts if possible)
    const invcNo = this.generateSarNo(po.id); 

    const pchsDt = new Date(po.createdAt).toISOString().split("T")[0].replace(/-/g, "");
    const cfmDt = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);

    const itemList: EbmPurchaseItem[] = po.items.map((item: any, index: number) => {
      const splyAmt = Number(item.totalPrice || 0);
      const taxRate = Number(item.item?.taxRate || 0);
      const taxAmt = splyAmt * (taxRate / 100);
      const totAmt = splyAmt + taxAmt;

      return {
        itemSeq: index + 1,
        itemCd: item.item?.productCode || "",
        itemClsCd: "5059690800",
        itemNm: item.item?.itemFullName || "",
        bcd: null,
        spplrItemClsCd: null,
        spplrItemCd: null,
        spplrItemNm: null,
        pkgUnitCd: "NT",
        pkg: Number(item.packSize || 1),
        qtyUnitCd: "U",
        qty: Number(item.quantityIssued || item.quantity || 0),
        prc: Number(item.unitPrice || 0),
        splyAmt: splyAmt,
        dcRt: 0,
        dcAmt: 0,
        taxblAmt: splyAmt,
        taxTyCd: item.item?.taxCode || "A",
        taxAmt: taxAmt,
        totAmt: totAmt,
        itemExprDt: item.expiryDate 
          ? new Date(item.expiryDate).toISOString().split("T")[0].replace(/-/g, "")
          : null,
      };
    });

    const totTaxblAmt = itemList.reduce((sum, item) => sum + item.taxblAmt, 0);
    const totTaxAmt = itemList.reduce((sum, item) => sum + item.taxAmt, 0);
    const totAmt = itemList.reduce((sum, item) => sum + item.totAmt, 0);

    // Aggregate by tax type (A=0, B=18, C=Exempt, D=Zero)
    const getTaxTotals = (ty: string) => {
      const filtered = itemList.filter(i => i.taxTyCd === ty);
      return {
        bl: filtered.reduce((sum, i) => sum + i.taxblAmt, 0),
        rt: ty === "B" || filtered.some(i => i.taxTyCd === "B") ? 18 : 0, 
        amt: filtered.reduce((sum, i) => sum + i.taxAmt, 0)
      };
    };

    const taxA = getTaxTotals("A");
    const taxB = getTaxTotals("B");
    const taxC = getTaxTotals("C");
    const taxD = getTaxTotals("D");

    return {
      tin: tin,
      bhfId: bhfId,
      invcNo: invcNo,
      orgInvcNo: 0,
      spplrTin: po.suppliers?.TIN ? this.formatTin(po.suppliers.TIN) : null,
      spplrBhfId: "00", // Default
      spplrNm: po.suppliers?.supplierName || null,
      spplrInvcNo: null,
      regTyCd: "M",
      pchsTyCd: "N", // Normal
      rcptTyCd: "P", // Purchase
      pmtTyCd: "01", // Cash (default for simplicity)
      pchsSttsCd: "02", // Approved/Finalized
      cfmDt: cfmDt,
      pchsDt: pchsDt,
      wrhsDt: "",
      cnclReqDt: "",
      cnclDt: "",
      rfdDt: "",
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
      totTaxAmt: totTaxAmt,
      totAmt: totAmt,
      remark: po.notes || null,
      regrNm: `${user.firstName} ${user.lastName}`.trim(),
      regrId: user.email || user.id,
      modrNm: `${user.firstName} ${user.lastName}`.trim(),
      modrId: user.email || user.id,
      itemList: itemList,
    };
  }

  private static async mapToEbmSalesPayload(
    sell: any,
    company: any,
    user: any,
    branchId?: string | null,
  ): Promise<EbmSalesPayload> {
    const bhfId = await this.resolveBhfId(branchId);
    const tin = this.formatTin(company.TIN);

    const invcNo = this.generateSarNo(sell.id);
    const salesDate = new Date(sell.createdAt || new Date()).toISOString().split("T")[0].replace(/-/g, "");
    const cfmDt = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);

    const itemList: EbmSalesItem[] = sell.sellItems.map((item: any, index: number) => {
      const totalAmount = Number(item.totalAmount || 0);
      const taxRate = Number(item.item?.taxRate || 0);
      
      // Calculate tax from inclusive total
      const divisor = 1 + (taxRate / 100);
      const splyAmt = totalAmount; // In the sample splyAmt = totAmt
      const taxblAmt = totalAmount; 
      const taxAmt = totalAmount - (totalAmount / divisor);

      return {
        itemSeq: index + 1,
        itemCd: item.item?.productCode || "",
        itemClsCd: "5059690800",
        itemNm: item.item?.itemFullName || "",
        bcd: null,
        pkgUnitCd: "NT",
        pkg: 1,
        qtyUnitCd: "U",
        qty: Number(item.quantity || 0),
        prc: Number(item.sellPrice || 0),
        splyAmt: splyAmt,
        dcRt: 0,
        dcAmt: 0,
        isrccCd: null,
        isrccNm: null,
        isrcRt: null,
        isrcAmt: null,
        taxTyCd: item.item?.taxCode || "A",
        taxblAmt: taxblAmt,
        taxAmt: Number(taxAmt.toFixed(2)),
        totAmt: totalAmount,
      };
    });

    const totTaxblAmt = itemList.reduce((sum, item) => sum + item.taxblAmt, 0);
    const totTaxAmt = itemList.reduce((sum, item) => sum + Number(item.taxAmt), 0);
    const totAmt = itemList.reduce((sum, item) => sum + item.totAmt, 0);

    const getTaxTotals = (ty: string) => {
      const filtered = itemList.filter(i => i.taxTyCd === ty);
      return {
        bl: filtered.reduce((sum, i) => sum + i.taxblAmt, 0),
        rt: ty === "B" || filtered.some(i => i.taxTyCd === "B") ? 18 : 0,
        amt: filtered.reduce((sum, i) => sum + Number(i.taxAmt), 0)
      };
    };

    const taxA = getTaxTotals("A");
    const taxB = getTaxTotals("B");
    const taxC = getTaxTotals("C");
    const taxD = getTaxTotals("D");

    const regrNm = `${user.firstName} ${user.lastName}`.trim();
    const regrId = user.email || user.id;

    return {
      tin: tin,
      bhfId: bhfId,
      invcNo: invcNo,
      orgInvcNo: 0,
      custTin: sell.client?.tin ? this.formatTin(sell.client.tin) : null,
      prcOrdCd: null,
      custNm: sell.client?.name || null,
      salesTyCd: "N",
      rcptTyCd: "S",
      pmtTyCd: sell.paymentMethod === "CASH" ? "01" : "02", // Mapping simple CASH to 01, others to 02
      salesSttsCd: "02",
      cfmDt: cfmDt,
      salesDt: salesDate,
      stockRlsDt: cfmDt,
      cnclReqDt: null,
      cnclDt: null,
      rfdDt: null,
      rfdRsnCd: null,
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
      remark: sell.notes || null,
      regrId: regrId,
      regrNm: regrNm,
      modrId: regrId,
      modrNm: regrNm,
      receipt: {
        custTin: sell.client?.tin ? this.formatTin(sell.client.tin) : null,
        custMblNo: sell.client?.phone || null,
        rptNo: 1,
        trdeNm: company.name || "",
        adrs: company.district || "",
        topMsg: "HealthLinker Sales",
        btmMsg: "Thank you for your business",
        prchrAcptcYn: "N"
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

  private static generateSarNo(id: string): number {
    const hex = id.replace(/-/g, "").slice(-8);
    return parseInt(hex, 16);
  }

  private static async resolveBhfId(branchId?: string | null): Promise<string> {
    if (!branchId) return "00";

    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
    });

    if (!branch) return "00";

    const match = branch.name.match(/\b(\d{2})\b/);
    return match ? match[1] : "00";
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
}
