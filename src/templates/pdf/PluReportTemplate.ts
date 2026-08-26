import PDFDocument from "pdfkit";

export interface PluReportRow {
  no: number;
  itemName: string;
  itemCode: string;
  unitPrice: number;
  taxRate: number;
  soldQty: number;
  remainQty: number;
}

export interface PluReportData {
  rows: PluReportRow[];
  company: { name: string; tin: string };
  startDate: string;
  endDate: string;
}

export function renderPluReport(data: PluReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const { rows, company, startDate, endDate } = data;

    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margin: 0,
      autoFirstPage: true,
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const W = 841.89;
    const H = 595.28;
    const tableL = 28;
    const tableW = W - tableL * 2;
    const textL = 40;
    const BROWN = "#8B5A49";

    const noW = 36;
    const itemCodeW = 130;
    const unitPriceW = 95;
    const taxRateW = 65;
    const soldQtyW = 95;
    const remainQtyW = 95;
    const itemNameW =
      tableW - noW - itemCodeW - unitPriceW - taxRateW - soldQtyW - remainQtyW;

    const cols = [
      { header: "No", width: noW, align: "center" as const },
      { header: "Item Name", width: itemNameW, align: "left" as const },
      { header: "Item Code", width: itemCodeW, align: "center" as const },
      { header: "Unit Price", width: unitPriceW, align: "right" as const },
      { header: "Tax Rate", width: taxRateW, align: "center" as const },
      { header: "Sold Quantity", width: soldQtyW, align: "center" as const },
      {
        header: "Remain Quantity",
        width: remainQtyW,
        align: "center" as const,
      },
    ];

    const headerH = 20;
    const rowH = 18;
    const padX = 4;
    const padY = 5;

    const truncate = (text: string, maxPt: number): string => {
      if (!text) return "";
      doc.fontSize(9).font("Helvetica");
      if (doc.widthOfString(text) <= maxPt) return text;
      let t = text;
      while (t.length > 0 && doc.widthOfString(t + "…") > maxPt)
        t = t.slice(0, -1);
      return t.length > 0 ? t + "…" : "";
    };

    const drawHeader = (y: number): number => {
      let x = tableL;
      cols.forEach((col) => {
        doc.rect(x, y, col.width, headerH).fillAndStroke(BROWN, "#000000");
        doc
          .fontSize(9)
          .font("Helvetica-Bold")
          .fillColor("#FFFFFF")
          .text(col.header, x + padX, y + padY, {
            width: col.width - 2 * padX,
            align: col.align,
            lineBreak: false,
          });
        x += col.width;
      });
      return y + headerH;
    };

    const fmt2d = (n: number) =>
      new Intl.NumberFormat("en-RW", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(n);

    doc
      .fontSize(20)
      .font("Helvetica-Bold")
      .fillColor("#000000")
      .text("PLU REPORT", 0, 30, { align: "center", width: W });
    doc
      .fontSize(12)
      .font("Helvetica-Bold")
      .fillColor("#000000")
      .text(company.name, textL, 60);
    doc
      .fontSize(11)
      .font("Helvetica-Bold")
      .text(`TIN: ${company.tin}`, textL, 76);
    doc
      .fontSize(11)
      .font("Helvetica-Bold")
      .text(`Date: ${startDate} - ${endDate}`, textL, 91);

    let y = drawHeader(110);

    if (rows.length === 0) {
      doc
        .fontSize(10)
        .font("Helvetica")
        .fillColor("#555555")
        .text("No data available for the selected period.", tableL, y + 20, {
          width: tableW,
          align: "center",
        });
    }

    rows.forEach((row) => {
      if (y + rowH > H - 40) {
        doc.addPage({ size: "A4", layout: "landscape", margin: 0 });
        y = drawHeader(30);
      }
      const vals = [
        String(row.no),
        truncate(row.itemName, itemNameW - 2 * padX),
        truncate(row.itemCode, itemCodeW - 2 * padX),
        fmt2d(row.unitPrice),
        `${row.taxRate}%`,
        String(row.soldQty),
        String(row.remainQty),
      ];

      let x = tableL;
      cols.forEach((col, ci) => {
        doc.rect(x, y, col.width, rowH).fillAndStroke("#FFFFFF", "#000000");
        doc
          .fontSize(9)
          .font("Helvetica")
          .fillColor("#000000")
          .text(vals[ci], x + padX, y + padY, {
            width: col.width - 2 * padX,
            align: col.align,
            lineBreak: false,
          });
        x += col.width;
      });
      y += rowH;
    });

    const footerY = Math.max(y + 15, H - 28);
    const _now = new Date();
    const _p = (n: number) => String(n).padStart(2, "0");
    const genTime = `${_now.getFullYear()}-${_p(_now.getMonth() + 1)}-${_p(_now.getDate())} ${_p(_now.getHours())}:${_p(_now.getMinutes())}:${_p(_now.getSeconds())}`;
    doc
      .fontSize(9)
      .font("Helvetica")
      .fillColor("#000000")
      .text(`Generated on: ${genTime}`, 0, footerY, {
        align: "center",
        width: W,
      });
    doc.text(company.name || "HealthLinker System", 0, footerY + 13, {
      align: "center",
      width: W,
    });

    doc.end();
  });
}
