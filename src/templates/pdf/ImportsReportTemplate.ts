import PDFDocument from "pdfkit";

const MM = 2.83465;
const BROWN = "#8B5A49";
const WHITE = "#FFFFFF";
const BLACK = "#000000";

export interface ImportReportRow {
  requestDate: string;
  dclNo: string;
  itemNm: string;
  qty: string;
  qtyUnitCd: string;
  spplrNm: string;
  agntNm: string;
  invoiceAmount: string;
  currency: string;
}

export interface ImportsReportData {
  company: { name: string; tin: string };
  items: ImportReportRow[];
  dateRange?: { from: string; to: string };
}

interface ColDef {
  header: string;
  width: number;
  align: "left" | "center" | "right";
}

function drawEbmTable(
  doc: any,
  cols: ColDef[],
  rows: string[][],
  x0: number,
  startY: number,
  pageH: number,
): number {
  const cellPadH = 2 * MM;
  const cellPadV = 2.5 * MM;
  const headerPadV = 3.5 * MM;
  const marginBottom = 15 * MM;
  const tableW = cols.reduce((s, c) => s + c.width, 0);

  function drawRowBorders(atY: number, rowH: number) {
    doc.rect(x0, atY, tableW, rowH).strokeColor(BLACK).lineWidth(0.2).stroke();
    let x = x0;
    for (let i = 0; i < cols.length - 1; i++) {
      x += cols[i].width;
      doc
        .moveTo(x, atY)
        .lineTo(x, atY + rowH)
        .strokeColor(BLACK)
        .lineWidth(0.2)
        .stroke();
    }
  }

  doc.font("Helvetica-Bold").fontSize(8);
  let headerH = 0;
  cols.forEach((col) => {
    const innerW = Math.max(col.width - 2 * cellPadH, 1);
    const h = doc.heightOfString(col.header, { width: innerW });
    if (h > headerH) headerH = h;
  });
  headerH += 2 * headerPadV;

  let y = startY;

  doc.rect(x0, y, tableW, headerH).fill(BROWN);
  doc.font("Helvetica-Bold").fontSize(8).fillColor(WHITE);
  let hx = x0;
  cols.forEach((col) => {
    const innerW = Math.max(col.width - 2 * cellPadH, 1);
    doc.text(col.header, hx + cellPadH, y + headerPadV, {
      width: innerW,
      align: "center",
      lineBreak: true,
    });
    hx += col.width;
  });
  drawRowBorders(y, headerH);
  y += headerH;

  rows.forEach((row) => {
    doc.font("Helvetica").fontSize(8);
    let rowH = 0;
    cols.forEach((col, i) => {
      const cellText = String(row[i] ?? "");
      const innerW = Math.max(col.width - 2 * cellPadH, 1);
      const h = doc.heightOfString(cellText, { width: innerW });
      if (h > rowH) rowH = h;
    });
    rowH += 2 * cellPadV;

    if (y + rowH > pageH - marginBottom) {
      doc.addPage();
      y = 20 * MM;
    }

    doc.rect(x0, y, tableW, rowH).fill(WHITE);
    doc.font("Helvetica").fontSize(8).fillColor(BLACK);
    let x = x0;
    cols.forEach((col, i) => {
      const cellText = String(row[i] ?? "");
      const innerW = Math.max(col.width - 2 * cellPadH, 1);
      doc.text(cellText, x + cellPadH, y + cellPadV, {
        width: innerW,
        align: col.align,
        lineBreak: true,
      });
      x += col.width;
    });

    drawRowBorders(y, rowH);
    y += rowH;
  });

  return y;
}

export function renderImportsReport(data: ImportsReportData): Promise<Buffer> {
  const { company, items } = data;

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        layout: "landscape",
        margin: 0,
        autoFirstPage: true,
      });

      const buffers: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => buffers.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(buffers)));
      doc.on("error", reject);

      const pageW = doc.page.width;
      const pageH = doc.page.height;
      const marginX = 8 * MM;
      const tableW = pageW - 2 * marginX;

      doc
        .font("Helvetica-Bold")
        .fontSize(18)
        .fillColor(BLACK)
        .text("Imports REPORT", marginX, 20 * MM, {
          align: "center",
          width: tableW,
        });

      doc
        .font("Helvetica-Bold")
        .fontSize(11)
        .fillColor(BLACK)
        .text(company.name, marginX, 32 * MM);
      doc
        .font("Helvetica-Bold")
        .fontSize(10)
        .fillColor(BLACK)
        .text(`TIN: ${company.tin}`, marginX, 40 * MM);

      if (data.dateRange) {
        doc
          .font("Helvetica-Bold")
          .fontSize(9)
          .fillColor(BLACK)
          .text(
            `Date: ${data.dateRange.from} - ${data.dateRange.to}`,
            marginX,
            48 * MM,
          );
      }

      const fixedPt = (8 + 22 + 28 + 16 + 14 + 22 + 16) * MM;
      const autoW = (tableW - fixedPt) / 3;

      const cols: ColDef[] = [
        { header: "#", width: 8 * MM, align: "center" },
        { header: "Request Date", width: 22 * MM, align: "center" },
        { header: "Declaration Number", width: 28 * MM, align: "center" },
        { header: "Item Name", width: autoW, align: "left" },
        { header: "Quantity", width: 16 * MM, align: "center" },
        { header: "Quantity Unit Code ", width: 14 * MM, align: "center" },
        { header: "Supplier Name", width: autoW, align: "left" },
        { header: "Agent Name", width: autoW, align: "left" },
        {
          header: "Invoice Foreign Currency Amount",
          width: 22 * MM,
          align: "right",
        },
        { header: "Invoice Foreign Currency", width: 16 * MM, align: "center" },
      ];

      const tableRows = items.map((item, idx) => [
        String(idx + 1),
        item.requestDate,
        item.dclNo,
        item.itemNm,
        item.qty,
        item.qtyUnitCd,
        item.spplrNm,
        item.agntNm,
        item.invoiceAmount,
        item.currency,
      ]);

      const startY = 55 * MM;
      const finalY = drawEbmTable(doc, cols, tableRows, marginX, startY, pageH);

      const genTime = new Date().toLocaleString("en-RW", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor(BLACK)
        .text(`Generated on: ${genTime}`, marginX, finalY + 12 * MM, {
          align: "center",
          width: tableW,
        });

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}
