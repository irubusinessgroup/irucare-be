import * as xlsx from 'xlsx';
import path from 'path';

export interface ExcelItem {
  PRODUCT_CODE: string;
  Description: string;
  Category: string;
  'Min Level': number;
  'Max Level': number;
  Tax: number | string;
}

export const readItemsFromExcel = (): ExcelItem[] => {
  try {
    const filePath = path.join(process.cwd(), 'src', 'resources', 'initial items.xlsx');
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    
    // Read data as JSON, starting from the second row (index 1) as header
    const rawData = xlsx.utils.sheet_to_json<any>(sheet, { range: 1 });
    
    // Normalize keys (trim spaces)
    const data: ExcelItem[] = rawData.map(row => {
      const newRow: any = {};
      Object.keys(row).forEach(key => {
        newRow[key.trim()] = row[key];
      });
      return newRow as ExcelItem;
    });

    return data;
  } catch (error) {
    console.error('Error reading Excel file:', error);
    return [];
  }
};
