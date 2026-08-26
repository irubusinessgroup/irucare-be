import PDFDocument from "pdfkit";

export interface SalesReportRow {
  no: number;
  buyerTin: string;
  buyerName: string;
  receiptNumber: string;
  invoiceDate: string;
  totalAmount: number;
  items: string;
  vat: number;
  receiptType: string;
  paymentMethod: string;
}

export interface SalesReportData {
  rows: SalesReportRow[];
  company: { name: string; tin: string };
  startDate: string;
  endDate: string;
  generatedAt: string;
}

export function renderSalesReport(data: SalesReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const { rows, company, startDate, endDate, generatedAt } = data;

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
    const tableL = 23;
    const tableW = W - tableL * 2;
    const textL = 40;
    const BROWN = "#8B5A49";

    const noW = 25;
    const tinW = 70;
    const receiptNoW = 60;
    const invDateW = 70;
    const totalAmtW = 75;
    const vatW = 60;
    const rcptTypeW = 50;
    const payMethodW = 75;
    const fixedW =
      noW +
      tinW +
      receiptNoW +
      invDateW +
      totalAmtW +
      vatW +
      rcptTypeW +
      payMethodW;
    const autoW = Math.floor((tableW - fixedW) / 2);

    const cols = [
      { header: "#", width: noW, align: "center" as const },
      { header: "Buyer TIN", width: tinW, align: "center" as const },
      { header: "Buyer Name", width: autoW, align: "left" as const },
      { header: "Receipt No", width: receiptNoW, align: "center" as const },
      { header: "Invoice Date", width: invDateW, align: "center" as const },
      { header: "Total Amount", width: totalAmtW, align: "right" as const },
      { header: "Items", width: autoW, align: "left" as const },
      { header: "VAT", width: vatW, align: "right" as const },
      { header: "Receipt Type", width: rcptTypeW, align: "center" as const },
      { header: "Payment Method", width: payMethodW, align: "center" as const },
    ];

    const headerH = 20;
    const baseRowH = 16;
    const lineH = 9;
    const padX = 3;
    const padY = 5;

    const truncate = (text: string, maxPt: number): string => {
      if (!text) return "";
      doc.fontSize(7).font("Helvetica");
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
          .fontSize(7)
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
      .fontSize(18)
      .font("Helvetica-Bold")
      .fillColor("#000000")
      .text("SALES REPORT", 0, 30, { align: "center", width: W });
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
      y += 40;
    }

    rows.forEach((row) => {
      const itemTextH = doc
        .fontSize(7)
        .font("Helvetica")
        .heightOfString(row.items, {
          width: autoW - 2 * padX,
          lineBreak: true,
        });
      const dynRowH = Math.max(baseRowH, Math.ceil(itemTextH) + 2 * padY);

      if (y + dynRowH > H - 40) {
        doc.addPage({ size: "A4", layout: "landscape", margin: 0 });
        y = drawHeader(30);
      }
      const singleY = y + (dynRowH - lineH) / 2;

      const cellVals = [
        String(row.no),
        row.buyerTin,
        truncate(row.buyerName, autoW - 2 * padX),
        row.receiptNumber,
        row.invoiceDate,
        fmt2d(row.totalAmount),
        row.items,
        fmt2d(row.vat),
        row.receiptType,
        row.paymentMethod,
      ];

      let x = tableL;
      cols.forEach((col, ci) => {
        const isItems = ci === 6;
        doc.rect(x, y, col.width, dynRowH).fillAndStroke("#FFFFFF", "#000000");
        doc
          .fontSize(7)
          .font("Helvetica")
          .fillColor("#000000")
          .text(cellVals[ci], x + padX, isItems ? y + padY : singleY, {
            width: col.width - 2 * padX,
            align: col.align,
            lineBreak: isItems,
          });
        x += col.width;
      });
      y += dynRowH;
    });

    if (rows.length > 0) {
      if (y + baseRowH > H - 40) {
        doc.addPage({ size: "A4", layout: "landscape", margin: 0 });
        y = 30;
      }
      const totalAmount = rows.reduce((s, r) => s + r.totalAmount, 0);
      const totalVat = rows.reduce((s, r) => s + r.vat, 0);

      const labelW = noW + tinW + autoW + receiptNoW + invDateW;
      let tx = tableL;
      cols.forEach((col) => {
        doc
          .rect(tx, y, col.width, baseRowH)
          .fillAndStroke("#FFFFFF", "#000000");
        tx += col.width;
      });
      doc
        .fontSize(7)
        .font("Helvetica-Bold")
        .fillColor("#000000")
        .text("Total Sales", tableL + padX, y + padY, {
          width: labelW - 2 * padX,
          align: "right",
          lineBreak: false,
        });
      let vx = tableL + labelW;
      doc.text(fmt2d(totalAmount), vx + padX, y + padY, {
        width: totalAmtW - 2 * padX,
        align: "right",
        lineBreak: false,
      });
      vx += totalAmtW + autoW;
      doc.text(fmt2d(totalVat), vx + padX, y + padY, {
        width: vatW - 2 * padX,
        align: "right",
        lineBreak: false,
      });
      y += baseRowH;
    }

    const footerY = Math.max(y + 12, H - 28);
    const _d = new Date(generatedAt);
    const pad2 = (n: number) => String(n).padStart(2, "0");
    const genTime = `${_d.getFullYear()}-${pad2(_d.getMonth() + 1)}-${pad2(_d.getDate())} ${pad2(_d.getHours())}:${pad2(_d.getMinutes())}:${pad2(_d.getSeconds())}`;
    doc
      .fontSize(9)
      .font("Helvetica")
      .fillColor("#000000")
      .text(`Generated on: ${genTime}`, 0, footerY, {
        align: "center",
        width: W,
      });

    doc.end();
  });
}
