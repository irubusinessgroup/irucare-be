// import PDFDocument from "pdfkit";
// import { NDAData } from "./interfaces/common";

// export async function generateNDAPdf(data: NDAData): Promise<Buffer> {
//   return new Promise((resolve, reject) => {
//     try {
//       const doc = new PDFDocument({
//         size: "A4",
//         margins: {
//           top: 50,
//           bottom: 50,
//           left: 50,
//           right: 50,
//         },
//       });

//       const buffers: Buffer[] = [];
//       doc.on("data", buffers.push.bind(buffers));
//       doc.on("end", () => {
//         const pdfData = Buffer.concat(buffers);
//         resolve(pdfData);
//       });
//       doc.on("error", reject);

//       // Header
//       doc
//         .fontSize(24)
//         .font("Helvetica-Bold")
//         .fillColor("#2563eb")
//         .text("NON-DISCLOSURE AGREEMENT (NDA)", { align: "center" })
//         .moveDown(0.5);

//       doc
//         .fontSize(14)
//         .font("Helvetica")
//         .fillColor("#6b7280")
//         .text("IRUCARE TRIAL SOFTWARE", { align: "center" })
//         .moveDown(2);

//       // Agreement details
//       doc
//         .fontSize(10)
//         .fillColor("#374151")
//         .text(`This Agreement is entered into as of ${data.date}`, {
//           align: "left",
//         })
//         .moveDown(1.5);

//       // Parties
//       doc
//         .fontSize(12)
//         .font("Helvetica-Bold")
//         .text("BETWEEN:", { underline: true })
//         .moveDown(0.5);

//       doc
//         .fontSize(10)
//         .font("Helvetica-Bold")
//         .text("IRU Business Group Ltd")
//         .font("Helvetica")
//         .text("Registered Address: Gahanga, Kigali City, Rwanda")
//         .text("Email: info@irubusinessgroup.com")
//         .text("Phone: +250 788 894 032")
//         .text('(hereinafter referred to as the "Disclosing Party")')
//         .moveDown(1);

//       doc.font("Helvetica-Bold").text("AND").moveDown(0.5);

//       doc
//         .text(data.clientName)
//         .font("Helvetica")
//         .text(`Registered Address: ${data.clientAddress}`)
//         .text(`Email: ${data.clientEmail}`)
//         .text(`Phone: ${data.clientPhone}`)
//         .text('(hereinafter referred to as the "Receiving Party")')
//         .moveDown(2);

//       // Sections
//       const sections = [
//         {
//           title: "1. Purpose",
//           content:
//             'The Disclosing Party agrees to provide access to its proprietary software system "Irucare", for testing and evaluation, under the condition that the Receiving Party agrees not to disclose or misuse any confidential information.',
//         },
//         {
//           title: "2. Definition of Confidential Information",
//           content:
//             '"Confidential Information" includes but is not limited to:\n\n• Software structure, functionality, user interface, features\n• Technical documentation and manuals\n• Business processes, strategies, pricing models\n• Client data, test results, and internal communications',
//         },
//         {
//           title: "3. Obligations of the Receiving Party",
//           content:
//             "The Receiving Party agrees:\n\n• Not to disclose, copy, or distribute any Confidential Information to third parties\n• To use the Confidential Information solely for trial purposes\n• To take all reasonable precautions to maintain confidentiality\n• To restrict access only to employees or agents who need it for the trial and are also bound by confidentiality",
//         },
//         {
//           title: "4. Exclusions",
//           content:
//             "Confidential Information does not include information that:\n\n• Is already in the public domain\n• Was legally known by the Receiving Party before disclosure\n• Is lawfully disclosed by a third party without restriction\n• Is independently developed by the Receiving Party without reference to the Confidential Information",
//         },
//         {
//           title: "5. Duration",
//           content:
//             "This Agreement shall remain in effect during the trial period and for two (2) years following the end of the trial, regardless of whether a partnership or subscription follows.",
//         },
//         {
//           title: "6. Return or Destruction of Information",
//           content:
//             "Upon request or trial completion, the Receiving Party agrees to delete or return all materials and data shared as part of this trial.",
//         },
//         {
//           title: "7. No License or Ownership Transfer",
//           content:
//             "This NDA does not grant any license, ownership, or rights to the Receiving Party about the Irucare software.",
//         },
//         {
//           title: "8. Breach and Remedies",
//           content:
//             "Any breach of this Agreement may result in legal consequences, including termination of trial access, financial compensation, and/or injunctive relief.",
//         },
//         {
//           title: "9. Governing Law",
//           content:
//             "This Agreement shall be governed by and construed in accordance with the laws of the Republic of Rwanda.",
//         },
//         {
//           title: "10. Entire Agreement",
//           content:
//             "This document contains the entire agreement between the parties regarding the confidentiality of the trial and supersedes any prior agreements, written or oral.",
//         },
//       ];

//       sections.forEach((section, index) => {
//         // Check if we need a new page
//         if (doc.y > 650) {
//           doc.addPage();
//         }

//         doc
//           .fontSize(11)
//           .font("Helvetica-Bold")
//           .fillColor("#1f2937")
//           .text(section.title, { continued: false })
//           .moveDown(0.3);

//         doc
//           .fontSize(10)
//           .font("Helvetica")
//           .fillColor("#374151")
//           .text(section.content, { align: "justify" })
//           .moveDown(1);
//       });

//       // New page for signatures
//       doc.addPage();

//       doc
//         .fontSize(14)
//         .font("Helvetica-Bold")
//         .fillColor("#2563eb")
//         .text("SIGNATURES", { align: "center" })
//         .moveDown(2);

//       // IRU Business Group signature block
//       doc
//         .fontSize(11)
//         .font("Helvetica-Bold")
//         .fillColor("#1f2937")
//         .text("IRU BUSINESS GROUP Ltd")
//         .moveDown(0.5);

//       doc
//         .fontSize(10)
//         .font("Helvetica")
//         .fillColor("#374151")
//         .text("Signature: _________________________________")
//         .moveDown(0.3)
//         .text("Name: _________________________________")
//         .moveDown(0.3)
//         .text("Position: _________________________________")
//         .moveDown(0.3)
//         .text("Date: _________________________________")
//         .moveDown(3);

//       // Client signature block
//       doc
//         .fontSize(11)
//         .font("Helvetica-Bold")
//         .fillColor("#1f2937")
//         .text(`Receiving Party (${data.clientName})`)
//         .moveDown(0.5);

//       doc
//         .fontSize(10)
//         .font("Helvetica")
//         .fillColor("#374151")
//         .text(`Company Name: ${data.clientName}`)
//         .moveDown(0.3)
//         .text(`Authorized Representative: ${data.contactPerson}`)
//         .moveDown(0.3)
//         .text("Signature: _________________________________")
//         .moveDown(0.3)
//         .text("Position: _________________________________")
//         .moveDown(0.3)
//         .text("Date: _________________________________");

//       // Footer
//       doc
//         .moveDown(3)
//         .fontSize(8)
//         .fillColor("#9ca3af")
//         .text(
//           "This document was generated electronically by IRUCARE Trial System",
//           { align: "center" },
//         )
//         .text(data.date, { align: "center" });

//       doc.end();
//     } catch (error) {
//       reject(error);
//     }
//   });
// }

import PDFDocument from "pdfkit";
import { NDAData } from "./interfaces/common";

export async function generateNDAPdf(data: NDAData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margins: {
          top: 50,
          bottom: 50,
          left: 50,
          right: 50,
        },
      });

      const buffers: Buffer[] = [];
      doc.on("data", buffers.push.bind(buffers));
      doc.on("end", () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });
      doc.on("error", reject);

      // Header
      doc
        .fontSize(24)
        .font("Helvetica-Bold")
        .fillColor("#2563eb")
        .text("NON-DISCLOSURE AGREEMENT (NDA)", { align: "center" })
        .moveDown(0.5);

      doc
        .fontSize(14)
        .font("Helvetica")
        .fillColor("#6b7280")
        .text("IRUCARE TRIAL SOFTWARE", { align: "center" })
        .moveDown(2);

      // Agreement details
      doc
        .fontSize(10)
        .fillColor("#374151")
        .text(`This Agreement is entered into as of ${data.date}`, {
          align: "left",
        })
        .moveDown(1.5);

      // Parties
      doc
        .fontSize(12)
        .font("Helvetica-Bold")
        .text("BETWEEN:", { underline: true })
        .moveDown(0.5);

      doc
        .fontSize(10)
        .font("Helvetica-Bold")
        .text("IRU Business Group Ltd")
        .font("Helvetica")
        .text("Registered Address: Gahanga, Kigali City, Rwanda")
        .text("Email: info@irubusinessgroup.com")
        .text("Phone: +250 788 894 032")
        .text('(hereinafter referred to as the "Disclosing Party")')
        .moveDown(1);

      doc.font("Helvetica-Bold").text("AND").moveDown(0.5);

      doc
        .text(data.clientName)
        .font("Helvetica")
        .text(`Registered Address: ${data.clientAddress}`)
        .text(`Email: ${data.clientEmail}`)
        .text(`Phone: ${data.clientPhone}`)
        .text('(hereinafter referred to as the "Receiving Party")')
        .moveDown(2);

      // Sections - FIXED BULLET POINTS
      const sections = [
        {
          title: "1. Purpose",
          content:
            'The Disclosing Party agrees to provide access to its proprietary software system "Irucare", for testing and evaluation, under the condition that the Receiving Party agrees not to disclose or misuse any confidential information.',
        },
        {
          title: "2. Definition of Confidential Information",
          content:
            '"Confidential Information" includes but is not limited to:\n\n• Software structure, functionality, user interface, features\n• Technical documentation and manuals\n• Business processes, strategies, pricing models\n• Client data, test results, and internal communications',
        },
        {
          title: "3. Obligations of the Receiving Party",
          content:
            "The Receiving Party agrees:\n\n• Not to disclose, copy, or distribute any Confidential Information to third parties\n• To use the Confidential Information solely for trial purposes\n• To take all reasonable precautions to maintain confidentiality\n• To restrict access only to employees or agents who need it for the trial and are also bound by confidentiality",
        },
        {
          title: "4. Exclusions",
          content:
            "Confidential Information does not include information that:\n\n• Is already in the public domain\n• Was legally known by the Receiving Party before disclosure\n• Is lawfully disclosed by a third party without restriction\n• Is independently developed by the Receiving Party without reference to the Confidential Information",
        },
        {
          title: "5. Duration",
          content:
            "This Agreement shall remain in effect during the trial period and for two (2) years following the end of the trial, regardless of whether a partnership or subscription follows.",
        },
        {
          title: "6. Return or Destruction of Information",
          content:
            "Upon request or trial completion, the Receiving Party agrees to delete or return all materials and data shared as part of this trial.",
        },
        {
          title: "7. No License or Ownership Transfer",
          content:
            "This NDA does not grant any license, ownership, or rights to the Receiving Party about the Irucare software.",
        },
        {
          title: "8. Breach and Remedies",
          content:
            "Any breach of this Agreement may result in legal consequences, including termination of trial access, financial compensation, and/or injunctive relief.",
        },
        {
          title: "9. Governing Law",
          content:
            "This Agreement shall be governed by and construed in accordance with the laws of the Republic of Rwanda.",
        },
        {
          title: "10. Entire Agreement",
          content:
            "This document contains the entire agreement between the parties regarding the confidentiality of the trial and supersedes any prior agreements, written or oral.",
        },
      ];

      sections.forEach((section) => {
        // Check if we need a new page
        if (doc.y > 650) {
          doc.addPage();
        }

        doc
          .fontSize(11)
          .font("Helvetica-Bold")
          .fillColor("#1f2937")
          .text(section.title, { continued: false })
          .moveDown(0.3);

        doc
          .fontSize(10)
          .font("Helvetica")
          .fillColor("#374151")
          .text(section.content, { align: "justify" })
          .moveDown(1);
      });

      // New page for signatures
      doc.addPage();

      doc
        .fontSize(14)
        .font("Helvetica-Bold")
        .fillColor("#2563eb")
        .text("SIGNATURES", { align: "center" })
        .moveDown(2);

      // IRU Business Group signature block
      doc
        .fontSize(11)
        .font("Helvetica-Bold")
        .fillColor("#1f2937")
        .text("IRU BUSINESS GROUP Ltd")
        .moveDown(0.5);

      doc
        .fontSize(10)
        .font("Helvetica")
        .fillColor("#374151")
        .text("Signature: _________________________________")
        .moveDown(0.3)
        .text("Name: _________________________________")
        .moveDown(0.3)
        .text("Position: _________________________________")
        .moveDown(0.3)
        .text("Date: _________________________________")
        .moveDown(3);

      // Client signature block
      doc
        .fontSize(11)
        .font("Helvetica-Bold")
        .fillColor("#1f2937")
        .text(`Receiving Party (${data.clientName})`)
        .moveDown(0.5);

      doc
        .fontSize(10)
        .font("Helvetica")
        .fillColor("#374151")
        .text(`Company Name: ${data.clientName}`)
        .moveDown(0.3)
        .text(`Authorized Representative: ${data.contactPerson}`)
        .moveDown(0.3)
        .text("Signature: _________________________________")
        .moveDown(0.3)
        .text("Position: _________________________________")
        .moveDown(0.3)
        .text("Date: _________________________________");

      // Footer
      doc
        .moveDown(3)
        .fontSize(8)
        .fillColor("#9ca3af")
        .text(
          "This document was generated electronically by IRUCARE Trial System",
          { align: "center" },
        )
        .text(data.date, { align: "center" });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
