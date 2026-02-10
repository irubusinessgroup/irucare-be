export const getReceiptMessages = (company: any) => {
  // Build header lines for topMsg
  const headerLines: string[] = [];
  
  // Company name
  if (company.name) {
    headerLines.push(company.name);
  }
  
  // Address (formatted from sector, district, province)
  const addressParts = [company.sector, company.district, company.province || "Kigali City"]
    .filter(Boolean);
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
    topMsg: headerLines.join('\n'),
    btmMsg: company.btmMsg || "THANK YOU\nCOME BACK AGAIN",
    adrs: addressParts.join(", ") || ""
  };
};

export const generateQrCodeData = (sell: any) => {
  if (!sell.ebmSynced || !sell.vsdcRcptPbctDate || !sell.sdcId || !sell.rcptNo || !sell.intrlData || !sell.rcptSign) {
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

