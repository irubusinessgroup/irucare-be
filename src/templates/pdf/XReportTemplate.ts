import PDFDocument from "pdfkit";

export interface XReportData {
  company: { name: string; tin: string; mrc: string };
  period: { startedAt: string; endedAt: string };
  singleDate?: boolean;
  generatedAt: string;
  summary: {
    totalSalesAmount: number;
    totalSalesCount: number;
    totalRefundAmount: number;
    totalRefundCount: number;
    totalItemsSold: number;
    totalDiscounts: number;
    openingDeposit: number;
    incompleteCount: number;
    tsSalesCount: number;
    trRefundCount: number;
    csSalesCount: number;
    crRefundCount: number;
    psProformaCount: number;
  };
  byCategory: { categoryName: string; amount: number }[];
  byPaymentMethod: {
    paymentMethod: string;
    salesAmount: number;
    salesTax: number;
    refundAmount: number;
    refundTax: number;
  }[];
}

const BROWN = "#8B5A2B";
const WHITE = "#FFFFFF";
const BLACK = "#000000";
const LIGHT_GRAY = "#F5F5F5";
const LINE_C = "#C8C8C8";

const PW = 595.28;
const PH = 841.89;
const MM = 2.8346;
const HM = 14 * MM;
const VM = 10 * MM;
const HDR_H = 28 * MM;
const FTR_H = 12 * MM;

const TW = PW - 2 * HM;
const COLS = [95, 35, 25, 25].map((w) => (w / 180) * TW);
const ROW_MIN_H = 16;
const CPX = 3.5;
const CPY = 3;
const FONT_SZ = 8;
const TABLE_MAX_Y = PH - VM - FTR_H - 4;

const fmt = (n: number) =>
  new Intl.NumberFormat("en-RW", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n) + " RWF";

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-RW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

type Doc = InstanceType<typeof PDFDocument>;

interface Cell {
  content: string;
  colSpan?: number;
  align?: "left" | "center" | "right";
  bold?: boolean;
  fillColor?: string;
  textColor?: string;
}

function drawPageHeader(doc: Doc, title: string): void {
  doc.rect(HM, VM, PW - 2 * HM, HDR_H).fill(BROWN);
  doc
    .font("Helvetica-Bold")
    .fontSize(18)
    .fillColor(WHITE)
    .text(title, HM, VM + HDR_H / 2 - 9, {
      width: PW - 2 * HM,
      align: "center",
      lineBreak: false,
    });
}

function drawPageFooter(
  doc: Doc,
  companyName: string,
  generatedAt: string,
): void {
  const ftY = PH - VM - FTR_H;
  doc.rect(HM, ftY, PW - 2 * HM, FTR_H).fill(BROWN);
  const year = new Date(generatedAt).getFullYear();
  doc
    .font("Helvetica")
    .fontSize(7.5)
    .fillColor(WHITE)
    .text(
      `© ${year} ${companyName}. All Rights Reserved.`,
      HM,
      ftY + FTR_H / 2 - 3.75,
      { width: PW - 2 * HM, align: "center", lineBreak: false },
    );
}

function calcRowHeight(doc: Doc, cells: Cell[]): number {
  let max = ROW_MIN_H;
  let ci = 0;
  for (const cell of cells) {
    const span = cell.colSpan ?? 1;
    const w = COLS.slice(ci, ci + span).reduce((a, b) => a + b, 0);
    if (cell.content) {
      doc.font(cell.bold ? "Helvetica-Bold" : "Helvetica").fontSize(FONT_SZ);
      const h = doc.heightOfString(cell.content, {
        width: Math.max(1, w - 2 * CPX),
      });
      max = Math.max(max, h + 2 * CPY);
    }
    ci += span;
  }
  return max;
}

function drawRow(doc: Doc, y: number, rowH: number, cells: Cell[]): void {
  let cx = HM;
  let ci = 0;
  for (const cell of cells) {
    const span = cell.colSpan ?? 1;
    const w = COLS.slice(ci, ci + span).reduce((a, b) => a + b, 0);
    const fill = cell.fillColor ?? WHITE;
    const align = cell.align ?? "left";

    doc.lineWidth(0.2).rect(cx, y, w, rowH).fillAndStroke(fill, LINE_C);

    if (cell.content) {
      const textColor = cell.textColor ?? BLACK;
      doc
        .font(cell.bold ? "Helvetica-Bold" : "Helvetica")
        .fontSize(FONT_SZ)
        .fillColor(textColor)
        .text(cell.content, cx + CPX, y + CPY, {
          width: Math.max(1, w - 2 * CPX),
          align,
          lineBreak: true,
        });
    }
    cx += w;
    ci += span;
  }
}

const simple = (desc: string, val: string): Cell[] => [
  { content: desc },
  { content: val, colSpan: 3, align: "right" },
];

const subHdr = (desc: string): Cell[] => [
  { content: desc, bold: true },
  { content: "Payment", bold: true, align: "center", fillColor: LIGHT_GRAY },
  { content: "Amount(NS)", bold: true, align: "right", fillColor: LIGHT_GRAY },
  { content: "Amount(NR)", bold: true, align: "right", fillColor: LIGHT_GRAY },
];

const subRow = (method: string, ns: number, nr: number): Cell[] => [
  { content: "" },
  { content: method, align: "center" },
  { content: fmt(ns), align: "right" },
  { content: fmt(nr), align: "right" },
];

export function renderXReport(
  data: XReportData,
  title: string,
): Promise<{ buffer: Buffer; filename: string }> {
  const {
    company,
    period,
    singleDate,
    generatedAt,
    summary,
    byCategory,
    byPaymentMethod,
  } = data;

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margin: 0,
        autoFirstPage: false,
      });
      const buffers: Buffer[] = [];
      doc.on("data", (chunk) => buffers.push(chunk));
      doc.on("end", () => {
        const buffer = Buffer.concat(buffers);
        const prefix = title.toLowerCase().replace(/\s+/g, "_");
        const filename = `${prefix}_${fmtDate(period.startedAt)}_${new Date(
          period.endedAt,
        )
          .toTimeString()
          .slice(0, 5)
          .replace(":", "-")}.pdf`;
        resolve({ buffer, filename });
      });
      doc.on("error", reject);

      doc.addPage();
      drawPageHeader(doc, title);

      let iy = VM + HDR_H + 10;
      const LH = 13;
      const dateLabel = singleDate
        ? fmtDate(period.startedAt)
        : `${fmtDate(period.startedAt)} - ${fmtDate(period.endedAt)}`;
      const infoLines: [string, string][] = [
        ["Trade Name:", company.name],
        ["TIN:", company.tin],
        ["MRC:", company.mrc || "-"],
        ["Date:", dateLabel],
      ];
      for (const [label, value] of infoLines) {
        doc.font("Helvetica-Bold").fontSize(9);
        const lw = doc.widthOfString(label);
        doc.fillColor(BLACK).text(label, HM, iy, { lineBreak: false });
        doc
          .font("Helvetica")
          .fontSize(9)
          .fillColor(BLACK)
          .text(` ${value}`, HM + lw, iy, { lineBreak: false });
        iy += LH;
      }

      const sectionY = iy + 4;
      doc
        .font("Helvetica-Bold")
        .fontSize(11)
        .fillColor(BROWN)
        .text("All Transactions", HM, sectionY, {
          width: PW - 2 * HM,
          align: "center",
          lineBreak: false,
        });

      let cy = sectionY + 20;

      const allRows: Cell[][] = [];

      allRows.push([
        {
          content: "Description",
          bold: true,
          fillColor: BROWN,
          textColor: WHITE,
          align: "left",
        },
        {
          content: "Amount (RWF)",
          colSpan: 3,
          bold: true,
          fillColor: BROWN,
          textColor: WHITE,
          align: "center",
        },
      ]);

      allRows.push(
        simple("Total Sales Amount (NS)", fmt(summary.totalSalesAmount)),
      );

      if (byCategory.length === 0) {
        allRows.push(
          simple(
            "Total Sales Amount by Main Groups",
            fmt(summary.totalSalesAmount),
          ),
        );
      } else if (byCategory.length === 1) {
        allRows.push(
          simple(
            "Total Sales Amount by Main Groups",
            fmt(byCategory[0].amount),
          ),
        );
      } else {
        allRows.push([
          { content: "Total Sales Amount by Main Groups", bold: true },
          {
            content: "Category",
            bold: true,
            align: "center",
            fillColor: LIGHT_GRAY,
          },
          {
            content: "Amount",
            colSpan: 2,
            bold: true,
            align: "right",
            fillColor: LIGHT_GRAY,
          },
        ]);
        for (const cat of byCategory) {
          allRows.push([
            { content: "" },
            { content: cat.categoryName, align: "center" },
            { content: fmt(cat.amount), colSpan: 2, align: "right" },
          ]);
        }
      }

      allRows.push(
        simple(
          "Number of Sales Receipts (NS)",
          String(summary.totalSalesCount),
        ),
      );
      allRows.push(
        simple("Total Refund Amount (NR)", fmt(summary.totalRefundAmount)),
      );
      allRows.push(
        simple(
          "Number of Refund Receipts (NR)",
          String(summary.totalRefundCount),
        ),
      );

      if (byPaymentMethod.length === 0) {
        allRows.push(simple("Taxable Amounts", "—"));
      } else {
        allRows.push(subHdr("Taxable Amounts"));
        for (const pm of byPaymentMethod) {
          allRows.push(
            subRow(pm.paymentMethod, pm.salesAmount, pm.refundAmount),
          );
        }
      }

      allRows.push(simple("Opening deposit", fmt(summary.openingDeposit)));
      allRows.push(
        simple("Number of items sold", String(summary.totalItemsSold)),
      );

      if (byPaymentMethod.length === 0) {
        allRows.push(simple("Tax Amounts", "—"));
      } else {
        allRows.push(subHdr("Tax Amounts"));
        for (const pm of byPaymentMethod) {
          allRows.push(subRow(pm.paymentMethod, pm.salesTax, pm.refundTax));
        }
      }

      allRows.push(
        simple(
          "Number of Receipt Copies (CS/CR)",
          `CS : ${summary.csSalesCount} | CR : ${summary.crRefundCount}`,
        ),
      );
      allRows.push(
        simple(
          "Number of Receipts in Training Mode (TS/TR)",
          `TS : ${summary.tsSalesCount} | TR : ${summary.trRefundCount}`,
        ),
      );
      allRows.push(
        simple(
          "Number of Advance Receipts in Proforma Mode (PS)",
          String(summary.psProformaCount),
        ),
      );

      const bigLabel =
        "Total Sales divided according to means of payment for sales (NS) and refund (NR) receipts";
      if (byPaymentMethod.length === 0) {
        allRows.push(simple(bigLabel, "—"));
      } else {
        allRows.push(subHdr(bigLabel));
        for (const pm of byPaymentMethod) {
          allRows.push(
            subRow(pm.paymentMethod, pm.salesAmount, pm.refundAmount),
          );
        }
      }

      allRows.push(simple("All discounts", fmt(summary.totalDiscounts)));
      allRows.push(
        simple("Number of incomplete sales", String(summary.incompleteCount)),
      );
      allRows.push(
        simple(
          "Other registrations that have reduced the day sales and their amount",
          "None",
        ),
      );

      for (const row of allRows) {
        const rh = calcRowHeight(doc, row);
        if (cy + rh > TABLE_MAX_Y) {
          drawPageFooter(doc, company.name, generatedAt);
          doc.addPage();
          drawPageHeader(doc, title);
          cy = VM + HDR_H + 10;
        }
        drawRow(doc, cy, rh, row);
        cy += rh;
      }

      const genY = cy + 8;
      if (genY < TABLE_MAX_Y) {
        doc
          .font("Helvetica")
          .fontSize(7.5)
          .fillColor(BLACK)
          .text(`Generated on: ${fmtDateTime(generatedAt)}`, HM, genY, {
            width: PW - 2 * HM,
            align: "center",
          });
      }

      drawPageFooter(doc, company.name, generatedAt);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
