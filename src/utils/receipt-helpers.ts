export const getReceiptMessages = (company: any) => {
  return {
    topMsg: "Welcome to our shop",
    btmMsg: "THANK YOU\nCOME BACK AGAIN\nYOUR BEST STORE IN TOWN",
    adrs: company
      ? `${company.sector || ""}, ${company.district || ""}, ${company.province || "Kigali City"}`
          .replace(/^, /, "")
          .replace(/, ,/g, ",")
      : "",
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

