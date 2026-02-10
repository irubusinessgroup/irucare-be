export interface EbmItemPayload {
  tin: string;
  bhfId: string;
  itemCd: string;
  itemClsCd: string;
  itemTyCd: string;
  itemNm: string;
  orgnNatCd: string;
  pkgUnitCd: string;
  qtyUnitCd: string;
  taxTyCd: string;
  dftPrc: number;
  isrcAplcbYn: string;
  useYn: string;
  regrNm: string;
  regrId: string;
  modrNm: string;
  modrId: string;
}

export interface EbmStockPayload {
  tin: string;
  bhfId: string;
  sarNo: number;
  orgSarNo: number;
  regTyCd: string;
  custTin: string | null;
  custNm: string | null;
  custBhfId: string | null;
  sarTyCd: string;
  ocrnDt: string;
  totItemCnt: number;
  totTaxblAmt: number;
  totTaxAmt: number;
  totAmt: number;
  remark: string | null;
  regrId: string;
  regrNm: string;
  modrId: string;
  modrNm: string;
  itemList: EbmStockItem[];
}

export interface EbmStockItem {
  itemSeq: number;
  itemCd: string;
  itemClsCd: string;
  itemNm: string;
  bcd: string | null;
  pkgUnitCd: string;
  pkg: number;
  qtyUnitCd: string;
  qty: number;
  itemExprDt: string | null;
  prc: number;
  splyAmt: number;
  totDcAmt: number;
  taxblAmt: number;
  taxTyCd: string;
  taxAmt: number;
  totAmt: number;
}

export interface EbmPurchasePayload {
  tin: string;
  bhfId: string;
  invcNo: number;
  orgInvcNo: number;
  spplrTin: string | null;
  spplrBhfId: string | null;
  spplrNm: string | null;
  spplrInvcNo: string | null;
  regTyCd: string;
  pchsTyCd: string;
  rcptTyCd: string;
  pmtTyCd: string;
  pchsSttsCd: string;
  cfmDt: string;
  pchsDt: string;
  wrhsDt: string;
  cnclReqDt: string;
  cnclDt: string;
  rfdDt: string;
  totItemCnt: number;
  taxblAmtA: number;
  taxblAmtB: number;
  taxblAmtC: number;
  taxblAmtD: number;
  taxRtA: number;
  taxRtB: number;
  taxRtC: number;
  taxRtD: number;
  taxAmtA: number;
  taxAmtB: number;
  taxAmtC: number;
  taxAmtD: number;
  totTaxblAmt: number;
  totTaxAmt: number;
  totAmt: number;
  remark: string | null;
  regrId: string;
  regrNm: string;
  modrId: string;
  modrNm: string;
  itemList: EbmPurchaseItem[];
}

export interface EbmPurchaseItem {
  itemSeq: number;
  itemCd: string;
  itemClsCd: string;
  itemNm: string;
  bcd: string | null;
  spplrItemClsCd: string | null;
  spplrItemCd: string | null;
  spplrItemNm: string | null;
  pkgUnitCd: string;
  pkg: number;
  qtyUnitCd: string;
  qty: number;
  prc: number;
  splyAmt: number;
  dcRt: number;
  dcAmt: number;
  taxblAmt: number;
  taxTyCd: string;
  taxAmt: number;
  totAmt: number;
  itemExprDt: string | null;
}

export interface EbmSalesPayload {
  tin: string;
  bhfId: string;
  invcNo: number;
  orgInvcNo: number;
  custTin: string | null;
  prcOrdCd: string | null;
  custNm: string | null;
  salesTyCd: string;
  rcptTyCd: string;
  pmtTyCd: string;
  salesSttsCd: string;
  cfmDt: string;
  salesDt: string;
  stockRlsDt: string;
  cnclReqDt: string | null;
  cnclDt: string | null;
  rfdDt: string | null;
  rfdRsnCd: string | null;
  totItemCnt: number;
  taxblAmtA: number;
  taxblAmtB: number;
  taxblAmtC: number;
  taxblAmtD: number;
  taxRtA: number;
  taxRtB: number;
  taxRtC: number;
  taxRtD: number;
  taxAmtA: number;
  taxAmtB: number;
  taxAmtC: number;
  taxAmtD: number;
  totTaxblAmt: number;
  totTaxAmt: number;
  totAmt: number;
  prchrAcptcYn: string;
  remark: string | null;
  regrId: string;
  regrNm: string;
  modrId: string;
  modrNm: string;
  receipt: EbmReceiptData;
  itemList: EbmSalesItem[];
}

export interface EbmSalesItem {
  itemSeq: number;
  itemCd: string;
  itemClsCd: string;
  itemNm: string;
  bcd: string | null;
  pkgUnitCd: string;
  pkg: number;
  qtyUnitCd: string;
  qty: number;
  prc: number;
  splyAmt: number;
  dcRt: number;
  dcAmt: number;
  isrccCd: string | null;
  isrccNm: string | null;
  isrcRt: number | null;
  isrcAmt: number | null;
  taxTyCd: string;
  taxblAmt: number;
  taxAmt: number;
  totAmt: number;
}

export interface EbmReceiptData {
  custTin: string | null;
  custMblNo: string | null;
  rptNo: number;
  trdeNm: string;
  adrs: string;
  topMsg: string;
  btmMsg: string;
  prchrAcptcYn: string;
}

export interface EbmInitPayload {
  tin: string;
  bhfId: string;
  dvcSrlNo: string;
}

export interface EbmResponse {
  resultCd: string;
  resultMsg: string;
  resultDt: string;
  data: any;
}

// EBM Notices interfaces
export interface EbmNotice {
  noticeNo: number;
  title: string;
  cont: string;
  dtlUrl: string;
  regrNm: string;
  regDt: string;
}

export interface EbmNoticesResponse extends EbmResponse {
  data: {
    noticeList: EbmNotice[];
  } | null;
}

// EBM Customer interfaces
export interface EbmCustomerPayload {
  tin: string;
  bhfId: string;
  custNo: string;
  custTin: string | null;
  custNm: string;
  adrs: string | null;
  telNo: string | null;
  email: string | null;
  faxNo: string | null;
  useYn: string;
  remark: string | null;
  regrNm: string;
  regrId: string;
  modrNm: string;
  modrId: string;
}

// EBM User/Staff interfaces
export interface EbmUserPayload {
  tin: string;
  bhfId: string;
  userId: string;
  userNm: string;
  pwd: string;
  adrs: string | null;
  cntc: string | null;
  authCd: string | null;
  remark: string | null;
  useYn: string;
  regrNm: string;
  regrId: string;
  modrNm: string;
  modrId: string;
}

// EBM Insurance interfaces
export interface EbmInsurancePayload {
  tin: string;
  bhfId: string;
  isrccCd: string;
  isrccNm: string;
  isrcRt: number;
  useYn: string;
  regrNm: string;
  regrId: string;
  modrNm: string;
  modrId: string;
}
