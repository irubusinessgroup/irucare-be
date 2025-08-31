export interface IOrderProcessing {
  id: string;
  purchaseOrderId: string;
  purchaseOrderItemId: string;
  companyFromId: string;
  companyToId: string;
  quantityIssued?: number;
  batchNo?: string;
  expiryDate?: Date;
  unitPrice?: number;
  totalPrice?: number;
  status: "PENDING" | "SENT" | "RECEIVED" | "REJECTED";
  createdAt: Date;
  updatedAt: Date;

  // NEW: Role-based fields from backend
  userRole?: "SUPPLIER" | "BUYER";
  canPerformActions?: boolean;

  // Relations
  purchaseOrderItem?: {
    id: string;
    quantity: number;
    packSize?: number;
    item?: {
      id: string;
      itemCodeSku: string;
      itemFullName: string;
    };
    purchaseOrder?: {
      id: string;
      poNumber: string;
    };
  };
  companyFrom?: {
    id: string;
    name: string;
    email: string;
  };
  companyTo?: {
    id: string;
    name: string;
    email: string;
  };
  purchaseOrder?: {
    id: string;
    poNumber: string;
  };
}
