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

/**
 * Generates mock SDC (Sales Device Code) data for demo receipts
 * Used when EBM service is bypassed/frozen
 */
export const generateMockSDCData = (sellId: string, companyTIN?: string) => {
  const timestamp = Date.now();
  const randomNum = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, "0");

  // Generate SDC ID (format: SDC-YYYYMMDD-HHMMSS-RANDOM)
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const mins = String(now.getMinutes()).padStart(2, "0");
  const secs = String(now.getSeconds()).padStart(2, "0");

  return {
    // Receipt number (8-10 digits based on timestamp)
    rcptNo: parseInt(`${year}${month}${day}`.substring(0, 8) + randomNum),

    // Internal data tracking
    intrlData: `INT-${sellId.substring(0, 8)}-${randomNum}-${timestamp % 10000}`,

    // Receipt signature
    rcptSign: `SIG-${sellId.substring(0, 6).toUpperCase()}-${randomNum}-${Math.random().toString(36).substring(2, 11).toUpperCase()}`,

    // Total receipt number
    totRcptNo: parseInt(`${month}${day}${hours}${mins}${secs}${randomNum}`),

    // VSDC receipt publish date (format: YYYYMMDDHHmmss - 14 digits)
    vsdcRcptPbctDate: `${year}${month}${day}${hours}${mins}${secs}`,

    // Sales Device Code (SDC ID) - unique identifier for the device
    sdcId: `SDC-${year}${month}${day}-${hours}${mins}${secs}-${randomNum}`,
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
