export const getReceiptMessages = (company: any) => {
  // Build header lines for topMsg
  const headerLines: string[] = [];

  // Company name
  if (company.name) {
    headerLines.push(company.name);
  }

  // Address (formatted from sector, district, province)
  const addressParts = [
    company.sector,
    company.district,
    company.province || "Kigali City",
  ].filter(Boolean);
  if (addressParts.length > 0) {
    headerLines.push(addressParts.join(", "));
  }

  // Phone
  if (company.phoneNumber) {
    headerLines.push(`TEL: ${company.phoneNumber}`);
  }

  // Email
  if (company.email) {
    headerLines.push(`EMAIL: ${company.email}`);
  }

  // TIN
  if (company.TIN) {
    headerLines.push(`TIN: ${company.TIN}`);
  }

  // Add custom top message if exists, otherwise use default
  if (company.topMsg) {
    headerLines.push(company.topMsg);
  } else {
    headerLines.push("Welcome to our shop");
  }

  return {
    topMsg: headerLines.join("\n"),
    btmMsg: company.btmMsg || "THANK YOU\nCOME BACK AGAIN",
    adrs: addressParts.join(", ") || "",
  };
};

// Global counter for sequential receipt numbering
let receiptCounter = 1;

/**
 * Generates mock SDC (Sales Device Code) data for demo receipts
 * Used when EBM service is bypassed/frozen
 * Receipt numbers increment sequentially: 01, 02, 03, etc.
 */
export const generateMockSDCData = (sellId: string, companyTIN?: string) => {
  const timestamp = Date.now();
  
  // Increment counter and format as 8-digit number (01 to 99999999)
  const formattedCounter = String(receiptCounter++).padStart(8, "0");
  
  // Reset counter if it exceeds 8 digits (99999999)
  if (receiptCounter > 99999999) {
    receiptCounter = 1;
  }

  // Generate SDC ID (format: SDC-YYYYMMDD-HHMMSS-COUNTER)
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const mins = String(now.getMinutes()).padStart(2, "0");
  const secs = String(now.getSeconds()).padStart(2, "0");

  return {
    // Receipt number - sequential counter starting from 01
    // Fits within INT4 (max 2,147,483,647)
    rcptNo: parseInt(formattedCounter),

    // Internal data tracking
    intrlData: `INT-${sellId.substring(0, 8)}-${formattedCounter}-${timestamp % 10000}`,

    // Receipt signature
    rcptSign: `SIG-${sellId.substring(0, 6).toUpperCase()}-${formattedCounter}-${Math.random().toString(36).substring(2, 11).toUpperCase()}`,

    // Total receipt number - also uses counter for consistency
    totRcptNo: parseInt(formattedCounter),

    // VSDC receipt publish date (format: YYYYMMDDHHmmss - 14 digits, kept as string)
    vsdcRcptPbctDate: `${year}${month}${day}${hours}${mins}${secs}`,

    // Sales Device Code (SDC ID) - unique identifier for the device
    sdcId: `SDC-${year}${month}${day}-${hours}${mins}${secs}-${formattedCounter}`,
  };
};

export const generateQrCodeData = (sell: any) => {
  if (
    !sell.ebmSynced ||
    !sell.vsdcRcptPbctDate ||
    !sell.sdcId ||
    !sell.rcptNo ||
    !sell.intrlData ||
    !sell.rcptSign
  ) {
    return null;
  }

  const rawDate = sell.vsdcRcptPbctDate;
  if (rawDate.length !== 14) return null;

  const yyyy = rawDate.substring(0, 4);
  const mm = rawDate.substring(4, 6);
  const dd = rawDate.substring(6, 8);
  const time = rawDate.substring(8, 14);

  const invoiceDate = `${dd}${mm}${yyyy}`;

  return `${invoiceDate}#${time}#${sell.sdcId}#${sell.rcptNo}#${sell.intrlData}#${sell.rcptSign}`;
};
