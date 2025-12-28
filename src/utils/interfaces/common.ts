import type { $Enums, PaymentMethod } from "@prisma/client";
import { TsoaResponse } from "tsoa";
import { DeliveryItemStatus } from "@prisma/client";
import { ClinicRole } from "../roles";

export interface CreateDoctorDto {
  name: string;
  code?: string;
}

export interface UpdateDoctorDto {
  name?: string;
  code?: string;
}

export interface CreateBranchDto {
  name: string;
  location?: string;
}

export interface UpdateBranchDto {
  name?: string;
  location?: string;
}

export interface IResponse<T> {
  statusCode: number;
  message: string;
  error?: unknown;
  data?: T;
}

export interface IPaged<T> {
  data: T;
  totalItems: number;
  currentPage: number;
  itemsPerPage: number;
  statusCode: number;
  message: string;
  error?: unknown;
}

export interface Paged<T> {
  data: T;
  totalItems: number;
  statusCode: number;
  message: string;
  error?: unknown;
}

export type TUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  phoneNumber: string;
  photo?: Express.Multer.File | string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
  userRoles?: IUserRole[];
  clinicUserRoles?: IClinicUserRole[];
  branchId?: string | null;
  company?: {
    id: string;
    userId: string;
    companyId: string;
    branchId?: string | null;
    company: {
      industry?: string | null;
    };
  };
  companyName?: string | null;
};

export interface IClinicUserRole {
  id: string;
  role: ClinicRole;
  userId: string;
}

export interface IUserRole {
  id: string;
  name: RoleType;
  userId: string;
}
export interface IUserResponse {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  userRoles: IUserRole[];
  password: string;
  createdAt: Date;
  phoneNumber: string;
  updatedAt: Date;
  otp: string | null;
  otpExpiresAt: Date | null;
  photo: string;
  companyName?: string | null;
}

export interface UserResponse
  extends Omit<
    IUserResponse,
    | "createdAt"
    | "updatedAt"
    | "userRoles"
    | "password"
    | "phoneNumber"
    | "otp"
    | "otpExpiresAt"
    | "photo"
  > {}

export interface CreateUserDto {
  firstName: string;
  lastName: string;
  email: string;
  role: RoleType;
  phoneNumber: string;
  photo?: Express.Multer.File | string | null;
}

export type RoleType = $Enums.RoleType;

export interface IUser extends Omit<TUser, "id" | "createdAt" | "updatedAt"> {}
export interface ILoginResponse
  extends Omit<TUser, "password" | "createdAt" | "updatedAt" | "userRoles"> {
  token: string;
  userRoles: IUserRole[];
}
export interface ILoginUser extends Pick<IUser, "email" | "password"> {}
export interface ISignUpUser
  extends Pick<
    IUser,
    "email" | "password" | "firstName" | "lastName" | "photo" | "phoneNumber"
  > {
  role: RoleType;
}

export type TErrorResponse = TsoaResponse<
  400 | 401 | 500,
  IResponse<{ message: string }>
>;

export type TService = {
  id: string;
  title: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
};

export interface CreateServiceDto {
  title: string;
  description: string;
}

export type TTestimony = {
  id: string;
  userId: string | null;
  agentReviewId: string | null;
  reviewsId: string | null;
  name: string;
  message: string;
  rating?: number | null;
  photo?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export interface CreateTestimonyDto {
  userId?: string | null;
  agentReviewId?: string | null;
  reviewsId?: string | null;
  name: string;
  message: string;
  rating?: number | null;
  photo?: Express.Multer.File | string | null;
}

export interface ReplyToContactDto {
  message: string;
  adminName?: string | null;
}

export interface TContact {
  id: string;
  name: string;
  email: string;
  company?: string | null;
  message: string;
  status: "PENDING" | "RESOLVED";
  conversationId?: string | null;
  createdAt: Date;
  updatedAt: Date;
  replies?: TContactReply[] | null;
}

export interface TContactReply {
  id: string;
  contactId: string;
  message: string;
  adminName?: string | null;
  createdAt: Date;
  updatedAt: Date;
  contact?: TContact | null;
}

export interface CreateContactDto {
  name: string;
  email: string;
  company?: string | null;
  message: string;
}

export interface TNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
  isRead: boolean;
  actionUrl?: string | null;
  createdAt: Date;
  updatedAt: Date;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface IResponse<T> {
  statusCode: number;
  message: string;
  data?: T;
}

export type TFaq = {
  id: string;
  question: string;
  solution: string;
  createdAt: Date;
  updatedAt: Date;
};

export interface CreateFaqDto {
  question: string;
  solution: string;
}

export type TBlog = {
  id: string;
  title: string;
  thumbnail: Express.Multer.File | string;
  teaser: string;
  description: string;
  category: string;
  likes: number;
  views: number;
  featured: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export interface CreateBlogDto {
  title: string;
  thumbnail: Express.Multer.File | string;
  teaser: string;
  description: string;
  category: string;
  likes?: number;
  views?: number;
  featured: boolean;
}

export type TLikes = {
  id: string;
  createdAt: Date;
  updatedAt: Date;
};

export type TAds = {
  id: string;
  title: string;
  thumbnail: Express.Multer.File | string;
  location: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
};

export interface CreateAdsDto {
  title: string;
  thumbnail: Express.Multer.File | string;
  location: string;
  description: string;
}

export type TAgent = {
  id: string;
  experience: string;
  description: string;
  speciality: string[];
  whatsapp: string;
  joined: string;
  languages: string;
  about: string;
  createdAt: Date;
  updatedAt: Date;
};

export interface CreateAgentDto {
  experience: string;
  description: string;
  speciality: string[];
  whatsapp: string;
  joined: string;
  languages: string;
  about: string;
  email: string;
  phoneNumber: string;
  firstName: string;
  lastName: string;
  photo?: Express.Multer.File | string;
}

export type TProduct = {
  id: string;
  name: string;
  isFeatured?: boolean;
  description: string;
  teaser: string;
  model?: string | null;
  warranty?: string | null;
  featuresOne?: string | null;
  featuresTwo?: string | null;
  featuresThree?: string | null;
  featuresFour?: string | null;
  featuresFive?: string | null;
  featuresFix?: string | null;
  featuresSeven?: string | null;
  featuresEight?: string | null;
  featuresNine?: string | null;
  featuresTen?: string | null;
  price: number;
  discountPercentage?: number | null;
  category: string;
  brand?: string | null;
  stockQuantity: number;
  isActive: boolean;
  thumbnail: string;
  galleryImages?: (Express.Multer.File | string)[];
  rating?: number | null;
  createdAt: Date;
  updatedAt: Date;
  reviews?: TReviews;
  orderItems?: TOrderItem[];
};

export type ProductCategory = $Enums.ProductCategory;
export type PaymentStatus = $Enums.PaymentStatus;
export type DeliveryStatus = $Enums.DeliveryStatus;
export type OrderStatus = $Enums.OrderStatus;

export type TOrder = {
  id: string;
  orderNumber: string;
  deliveryFee?: number | null;
  status: string;
  totalAmount: number;
  subTotal: number;
  createdAt: Date;
  updatedAt: Date;
};

export type TOrderItem = {
  id: string;
  orderId: string;
  productId: string;
  quantity: number;
  discount?: number | null;
  unitPrice: number;
  order?: TOrder;
  product?: TProduct;
};

export type TPayment = {
  id: string;
  subscriptionId: string;
  kind: string;
  amount: number;
  method: string;
  status: string;
  paidAt?: Date | null;
  accountNumber: string;
  accountProvider?: string | null;
  refId?: string | null;
  createdAt: Date;
  updatedAt: Date;
  subscription?: TSubscription;
};

export interface CreatePaymentDto {
  subscriptionId: string;
  amount: number;
  method: PaymentMethod;
  accountNumber: string;
}

export interface withdrawalPaymentDto {
  amount: number;
  accountNumber: string;
}

export interface UpdatePaymentDto {
  subscriptionId: string;
  amount: number;
  method: PaymentMethod;
  paidAt?: Date;
  accountNumber: string;
  accountProvider?: string;
  refId?: string;
}

export type TDelivery = {
  id: string;
  orderId: string;
  address: string;
  city: string;
  province: string;
  country: string;
  postalCode: string;
  customerFirstName: string;
  customerLastName: string;
  customerEmail: string;
  customerPhone: string;
  customerNote?: string | null;
  deliveryStatus: string;
  estimatedDate?: Date | null;
  deliveredAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export interface CreateProductDto {
  name: string;
  isFeatured?: boolean;
  teaser: string;
  model?: string;
  warranty?: string;
  featuresOne?: string;
  featuresTwo?: string;
  featuresThree?: string;
  featuresFour?: string;
  featuresFive?: string;
  featuresFix?: string;
  featuresSeven?: string;
  featuresEight?: string;
  featuresNine?: string;
  featuresTen?: string;
  description: string;
  price: number;
  discountPercentage?: number;
  category: string;
  brand?: string;
  stockQuantity: number;
  isActive?: boolean;
  thumbnail: string;
  galleryImages?: string[];
}

export interface CreateOrderDto {
  discount?: number;
  deliveryFee?: number;
  orderItems: {
    productId: string;
    quantity: number;
  }[];
}

export interface CreateOrderItemDto {
  orderId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  discount: number;
}

export type TReviews = {
  id: string;
  productId: string;
  count: number;
  rating: number;
  createdAt: Date;
  updatedAt: Date;
};

export interface CreateReviewsDto {
  count: number;
  rating: number;
}

export type TCompany = {
  id: string;
  name: string;
  address: string;
  phoneNumber: string;
  email: string;
  TIN: string;
  type: string;
  occupation?: string;
  industry?: string;
  website?: string;
  registrationDate?: string;
  certificate: string;
  logo: string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
};

export interface CreateCompanyDto {
  company: {
    name: string;
    country: string;
    province: string;
    district: string;
    sector: string;
    email: string;
    phoneNumber: string;
    TIN?: string;
    industry: string;
    website?: string;
    certificate: Express.Multer.File | string;
    logo?: Express.Multer.File | string;
    type: string;
  };
  contactPerson: {
    firstName: string;
    lastName: string;
    email: string;
    phoneNumber?: string;
    title?: string;
    role: RoleType;
    idNumber?: string;
    idAttachment?: Express.Multer.File | string;
  };
}

export interface CreateStandardCompanyStaffDto {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string;
  title?: string;
  role: RoleType;
  idNumber?: string;
  idAttachment?: Express.Multer.File | string;
  branchId?: string;
}

export interface CreateClinicCompanyStaffDto {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string;
  title?: string;
  role: ClinicRole;
  idNumber?: string;
  idAttachment?: Express.Multer.File | string;
  branchId?: string;
}

export type CreateCompanyStaffUnionDto =
  | CreateStandardCompanyStaffDto
  | CreateClinicCompanyStaffDto;

// CompanyTools DTOs
export interface CreateCompanyToolsDto {
  markupPrice?: number;
  taxRate?: number;
  companySignature?: string;
  companyStamp?: string;
  businessTin?: string;
  ebmDeviceSerialNumber?: string;
  taxReportingFrequency?: string;
  bankAccounts?: Array<{ bankName?: string; accountNumber?: string }>;
}

export interface UpdateCompanyToolsDto extends Partial<CreateCompanyToolsDto> {}

// CompanyTools response types
export interface BankAccountDto {
  bankName?: string;
  accountNumber?: string;
}

export interface CompanyToolsResponseDto {
  id: string;
  companyId: string;
  markupPrice?: number | null;
  companySignature?: string | null;
  companyStamp?: string | null;
  bankAccounts?: BankAccountDto[] | null;
  createdAt: Date;
  updatedAt: Date;
  company?: {
    name: string;
    logo?: string | null;
    website?: string | null;
  } | null;
}

export interface CreatePatientDto {
  name: string;
  identificationType: string;
  phone: string;
  gender: string;
  birthDate: string;
  NID: string;
  motherName?: string;
  fatherName?: string;
  email?: string;
  nextOfKinName?: string;
  nextOfKinPhone?: string;
  nextOfKinRelation?: string;
  address: {
    country: string;
    province?: string;
    district?: string;
    sector?: string;
    cell?: string;
    village?: string;
    street?: string;
    city?: string;
  }[];
}

export interface UpdatePatientDto extends Partial<CreatePatientDto> {}

export interface CreateInsuranceCardDto {
  patientId?: string;
  clientId?: string;
  percentage?: number;
  insuranceId: string;
  affiliationNumber: string;
  policeNumber?: string;
  relationship: string;
  affiliateName: string;
  birthDate: Date | string; // Accept string for easier parsing from JSON
  gender?: string;
  phone?: string;
  workDepartment?: string;
  workplace?: string;
}

export interface UpdateInsuranceCardDto
  extends Partial<CreateInsuranceCardDto> {}

export interface CreateSupplierDto {
  full_names: string;
  phone_number: string;
  location: string;
}

export interface UpdateSupplierDto extends Partial<CreateSupplierDto> {}

export interface CreateInsuranceDto {
  name: string;
  tin?: string;
  phone?: string;
  description?: string;
  address?: string;
}

export interface UpdateInsuranceDto extends Partial<CreateInsuranceDto> {}

export interface CreateItemDto {
  itemFullName: string;
  categoryId: string;
  description?: string;
  productCode?: string;
  minLevel: number;
  maxLevel: number;
  // Tax fields (optional from clients; coerced server-side)
  isTaxable?: boolean | string;
  taxCode?: "A" | "B";
  taxRate?: number;
  insurancePrice?: number;
}

export interface UpdateItemDto {
  itemFullName?: string;
  categoryId: string;
  description?: string;
  productCode?: string;
  minLevel: number;
  maxLevel: number;
  // Tax fields (optional from clients; coerced server-side)
  isTaxable?: boolean | string;
  taxCode?: "A" | "B";
  taxRate?: number;
  insurancePrice?: number;
}

export interface CreateStockDto {
  itemId?: string;
  purchaseOrderItemId: string;
  purchaseOrderId: string;
  invoiceNo?: string;
  supplierId?: string;
  // Accept both Date and string so controllers can receive flexible date inputs (ISO string, empty string, etc.)
  dateReceived: Date | string;
  quantityReceived: number;
  expiryDate?: Date | string | null;
  unitCost: number;
  packSize?: number;
  uom?: string;
  tempReq?: string;
  currency?: string;
  condition?: string;
  // warehouseId may be omitted or null when not assigned; empty string will be normalized to null by services
  warehouseId?: string | null;
  specialHandlingNotes?: string;
  remarksNotes?: string;
}

export interface CreateManualStockReceiptDto {
  manualPoNumber: string;
  itemId: string;
  supplierId: string;
  warehouseId: string;
  dateReceived: Date | string;
  quantityReceived: number;
  unitCost: number;
  currency?: string;
  uom?: string;
  tempReq?: string;
  condition?: string;
  packSize?: number;
  expiryDate?: Date | string | null;
  invoiceNo?: string;
  specialHandlingNotes?: string;
  remarksNotes?: string;
}

export interface UpdateStockDto {
  itemId?: string;
  purchaseOrderItemId: string;
  invoiceNo?: string;
  supplierId?: string;
  dateReceived?: Date | string;
  quantityReceived?: number;
  expiryDate?: Date | string | null;
  unitCost?: number;
  totalCost?: number;
  packSize?: number;
  uom?: string;
  tempReq?: string;
  currency?: string;
  condition?: string;
  warehouseId?: string;
  specialHandlingNotes?: string;
  remarksNotes?: string;
}

export interface CreateStockReceiptFromPODto {
  purchaseOrderItemId: string;
  quantityReceived: number;
  unitCost?: number;
  expiryDate?: Date;
  invoiceNo?: string;
  warehouseId: string;
  condition?: string;
  tempReq?: string;
  uom?: string;
  currency?: string;
  packSize?: number;
}

export interface BulkCreateStockReceiptsDto {
  poNumber: string;
  receipts: CreateStockReceiptFromPODto[];
}

export interface CreateSupplierRequest {
  supplierName: string;
  contactPerson: string;
  phoneNumber: string;
  email: string;
  address?: string;
  TIN?: string; // Optional: Tax Identification Number
  supplierCompanyId?: string; // NEW: Link to actual supplier company
}

export interface UpdateSupplierRequest {
  supplierName?: string;
  contactPerson?: string;
  phoneNumber?: string;
  email?: string;
  address?: string;
  TIN?: string; // Optional: Tax Identification Number
  supplierCompanyId?: string; // NEW: Link to actual supplier company
}

export interface SupplierResponse {
  id: string;
  supplierName: string;
  contactPerson: string;
  phoneNumber: string;
  email: string;
  address?: string | null;
  TIN?: string | null; // Optional: Tax Identification Number
  supplierCompanyId?: string | null; // NEW
  supplierCompany?: {
    // NEW
    id: string;
    name: string;
    email: string;
  } | null;
  createdAt: Date;
}

export interface CategoryResponse {
  id: string;
  categoryName: string;
  description?: string | null;
}

export interface WarehouseResponse {
  id: string;
  warehousename: string;
  description?: string | null;
}

export interface CreateWarehouseRequest {
  warehousename: string;
  description?: string | null;
}

export interface UpdateWarehouseRequest {
  warehousename: string;
  description?: string | null;
}

export interface CreateCategoryRequest {
  categoryName: string;
  description?: string | null;
}

export interface UpdateCategoryRequest {
  categoryName: string;
  description?: string | null;
}

export interface PurchaseOrderItemDto {
  itemId: string;
  quantity: number;
  packSize?: number | null;
}

export interface CreatePurchaseOrderDto {
  poNumber?: string;
  items: PurchaseOrderItemDto[];
  supplierId: string;
  notes?: string;
  expectedDeliveryDate: Date;
}

export interface UpdatePurchaseOrderDto {
  poNumber?: string;
  items?: PurchaseOrderItemDto[];
  supplierId?: string;
  notes?: string;
  expectedDeliveryDate?: Date;
}

// Client order DTOs (used when creating orders for individual clients)
export interface CreateClientOrderDto {
  items: PurchaseOrderItemDto[];
  clientId: string; // user id of the client
  companyId?: string | null; // optional buyer company id (empty if client not part of company)
  clientAddress?: string | null;
  notes?: string;
  expectedDeliveryDate: Date | string;
}

export interface UpdateClientOrderDto {
  poNumber?: string;
  items?: PurchaseOrderItemDto[];
  clientId?: string;
  companyId?: string | null;
  clientAddress?: string | null;
  notes?: string;
  expectedDeliveryDate?: Date | string;
}

export interface CreateProcessingEntryDto {
  subtotal?: number;
  vatRate?: number;
  vat?: number;
  grandTotal?: number;
  purchaseOrderId: string;
  items: ItemsDto[];
}

export interface ItemsDto {
  purchaseOrderItemId: string;
  batchNo?: string;
  expiryDate?: Date;
  unitPrice?: number;
  quantityIssued?: number;
  totalPrice?: number;
}
export interface UpdateProcessingStatusDto {
  status: "PENDING" | "SENT" | "RECEIVED" | "REJECTED";
}

export interface ApproveItemDto {
  itemId: string;
  action: "APPROVED" | "REJECTED";
}

export interface ApproveItemsDto {
  items: ApproveItemDto[];
}

export interface DeleteProcessingEntryDto {
  id: string;
}

export interface UpdateProcessingEntryDto {
  batchNo?: string;
  expiryDate?: Date;
  unitPrice?: number;
  quantityIssued?: number;
}

export interface CreateClientDto {
  name: string;
  email?: string;
  phone: string;
  address?: string;
  tin?: string;
}

export interface UpdateClientDto {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  tin?: string;
}

export interface CreateSellDto {
  clientId?: string; // Made optional to support pharmacy companies using patientId
  items: {
    itemId: string;
    quantity: number;
    sellPrice: number;
  }[];
  notes?: string;
  // optional (PHARMACY insurance context)
  patientId?: string;
  insuranceCardId?: string;
  insurancePercentage?: number;
  subtotal?: number;
  insuranceCoveredAmount?: number;
  patientPayableAmount?: number;
  // Legacy fields for backward compatibility
  itemId?: string;
  quantity?: number;
  sellPrice?: number;

  // New fields
  clientType?: "PRIVATE" | "INSUREE";
  paymentMode?: "CREDIT" | "HALF_PAID" | "FULL_PAID";
  paymentMethod?: PaymentMethod;
  doctorId?: string;
  hospital?: string;
}

export interface UpdateSellDto {
  clientId?: string;
  items?: {
    itemId: string;
    quantity: number;
    sellPrice: number;
  }[];
  notes?: string;
  totalAmount?: number;
  // optional (PHARMACY insurance context)
  patientId?: string;
  insuranceCardId?: string;
  insurancePercentage?: number;
  subtotal?: number;
  insuranceCoveredAmount?: number;
  patientPayableAmount?: number;
  // Legacy fields for backward compatibility
  itemId?: string;
  quantity?: number;
  sellPrice?: number;

  // New fields
  clientType?: "PRIVATE" | "INSUREE";
  paymentMode?: "CREDIT" | "HALF_PAID" | "FULL_PAID";
  paymentMethod?: PaymentMethod;
  doctorId?: string;
  hospital?: string;
}

export interface CreateApprovalDto {
  stockReceiptId: string;
  approvalStatus: "APPROVED" | "DISAPPROVED" | "PENDING";
  expectedSellPrice?: number;
  comments?: string;
}

export interface UpdateApprovalDto {
  approvalStatus?: "APPROVED" | "DISAPPROVED" | "PENDING";
  comments?: string;
  expectedSellPrice?: number;
}

export interface UpdateProfileDto {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  photo?: Express.Multer.File | string | null;
}

export interface DirectStockAdditionRequest {
  itemId: string;
  supplierId?: string;
  dateReceived: Date | string;
  expiryDate?: Date | string | null;
  quantityReceived: number;
  unitCost: number;
  packSize?: number;
  uom: string;
  tempReq: string;
  currency: string;
  condition: string;
  warehouseId: string;
  reason: string;
  specialHandlingNotes?: string;
  remarksNotes?: string;
}

export interface CreateDeliveryDto {
  purchaseOrderId?: string;
  plannedDeliveryDate: string;
  deliveryAddress?: string;
  contactPerson?: string;
  contactPhone?: string;
  contactEmail?: string;
  deliveryNotes?: string;
  specialInstructions?: string;
  deliveryCharges?: number;
  items?: CreateDeliveryItemDto[];

  buyerCompanyId?: string; // Required when no PO
  deliveryType?: "PURCHASE_ORDER" | "DIRECT_STOCK";
}

export interface CreateDeliveryItemDto {
  purchaseOrderItemId?: string;
  itemId?: string;
  quantityToDeliver: number;
  actualBatchNo?: string;
  actualExpiryDate?: Date;
  actualUnitPrice?: number;
}

export interface UpdateDeliveryDto {
  plannedDeliveryDate?: Date;
  deliveryAddress?: string;
  contactPerson?: string;
  contactPhone?: string;
  contactEmail?: string;
  deliveryNotes?: string;
  specialInstructions?: string;
  deliveryCharges?: number;
  items?: UpdateDeliveryItemDto[];
}

export interface UpdateDeliveryItemDto {
  purchaseOrderItemId: string;
  quantityToDeliver?: number;
  quantityDelivered?: number;
  quantityDamaged?: number;
  quantityRejected?: number;
  actualBatchNo?: string;
  actualExpiryDate?: Date;
  actualUnitPrice?: number;
  itemStatus?: DeliveryItemStatus;
  notes?: string;
}

export interface UpdateDeliveryStatusDto {
  status: DeliveryStatus;
  dispatchDate?: Date;
  actualDeliveryDate?: Date;
  courierService?: string;
  trackingNumber?: string;
  vehicleDetails?: string;
  driverName?: string;
  driverPhone?: string;
  currentLocation?: string;
  statusNote?: string;
}

export interface DeliveryTrackingDto {
  location?: string;
  description: string;
}

export interface CancelDeliveryDto {
  reason: string;
}

export interface ConfirmDeliveryDto {
  items: ConfirmDeliveryItemDto[];
  actualDeliveryDate?: Date;
  receiverName?: string;
  receiverSignature?: string;
  notes?: string;
}

export interface ConfirmDeliveryItemDto {
  purchaseOrderItemId: string;
  quantityReceived: number;
  quantityDamaged?: number;
  quantityRejected?: number;
  damageNotes?: string;
  rejectionReason?: string;
}

// Plan model (matches prisma schema)
export type TPlan = {
  id: string;
  name: string; // plan display name
  description?: string | null;
  price: number;
  setupFee?: number | null;
  additionalUser?: number | null;
  additionalLocation?: number | null;
  features?: string[];
  period?: string | null;
  userRange?: string | null;
  locationRange?: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export interface CreatePlanDto {
  id?: string;
  name: string;
  description?: string;
  price: number;
  setupFee?: number;
  additionalUser?: number;
  additionalLocation?: number;
  features?: Array<string | Record<string, unknown>>;
  period?: string;
  userRange?: string;
  locationRange?: string;
  isActive?: boolean;
}

export interface UpdatePlanDto extends Partial<CreatePlanDto> {}

// Subscription model (matches prisma schema)
export type TSubscription = {
  id: string;
  companyId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  companyName?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  paymentMethod: string;
  paymentPhone?: string | null;
  billingAddress?: string | null;
  cardNumber?: string | null;
  expiryDate?: string | null;
  cvv?: string | null;
  nameOnCard?: string | null;
  selectedPlan: string;
  planId: string;
  planPrice: number;
  setupFee?: number | null;
  totalDueToday: number;
  billingCycle: string;
  periodLabel: string;
  isActive: boolean;
  startDate?: Date | null;
  endDate?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  // Relations (optional in DTOs)
  company?: { id: string; name: string } | null;
  plan?: TPlan | null;
};

export interface CreateSubscriptionDto {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  companyName?: string;
  address?: string;
  city?: string;
  country?: string;
  paymentMethod: string;
  paymentPhone?: string;
  billingAddress?: string;
  cardNumber?: string;
  expiryDate?: string;
  cvv?: string;
  nameOnCard?: string;
  selectedPlan: string;
  planId: string;
  planPrice: number;
  setupFee?: number;
  totalDueToday: number;
  billingCycle: string;
  periodLabel: string;
}

export interface UpdateSubscriptionDto extends Partial<CreateSubscriptionDto> {
  isActive?: boolean;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
}

export interface CreateTrialApplicationDto {
  organizationName: string;
  organizationType: string;
  countryCity: string;
  businessRegNumber?: string;
  website?: string;

  contactFirstName: string;
  contactLastName: string;
  contactPosition: string;
  contactPhone: string;
  contactEmail: string;
  contactWhatsApp?: string;

  modules: string[];

  approximateUsers: number;
  preferredLanguage: string;
  hasStableInternet: boolean;
  devices: string[];

  preferredStartDate?: Date;
  trialDuration: number;

  feedbackAgreed: boolean;
  dataUsageAgreed: boolean;
  ndaAgreed?: boolean;
  trialUnderstanding?: boolean;
  authorizedRepresentative?: string;
  signature?: string;
  signatureDate?: Date | string;
}

export interface UpdateTrialApplicationDto {
  status?:
    | "PENDING"
    | "UNDER_REVIEW"
    | "APPROVED"
    | "REJECTED"
    | "ACTIVE"
    | "EXPIRED"
    | "CONVERTED";
  rejectionReason?: string;
  trialAccountId?: string;
}

// Direct Invoice Interfaces
export interface CreateDirectInvoiceDto {
  clientId: string;
  items: CreateDirectInvoiceItemDto[];
  dueDate: Date;
  notes?: string;
}

export interface CreateDirectInvoiceItemDto {
  itemId: string;
  quantity: number;
  unitPrice: number;
}

export interface UpdateDirectInvoiceDto {
  clientId?: string;
  items?: CreateDirectInvoiceItemDto[];
  dueDate?: Date;
  notes?: string;
  status?: "DRAFT" | "SENT" | "PAID" | "OVERDUE" | "CANCELLED";
}

export interface DirectInvoiceResponse {
  id: string;
  invoiceNumber: string;
  clientId: string;
  companyId: string;
  subtotal: number;
  grandTotal: number;
  isTaxable?: boolean;
  taxRate?: number | null;
  taxAmount?: number | null;
  currency: string;
  invoiceDate: Date;
  dueDate: Date;
  status: "DRAFT" | "SENT" | "PAID" | "OVERDUE" | "CANCELLED";
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
  client: {
    id: string;
    name: string;
    email: string | null;
    phone: string;
    address: string | null;
  };
  items: DirectInvoiceItemResponse[];
}

export interface DirectInvoiceItemResponse {
  id: string;
  invoiceId: string;
  itemId: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  item: {
    id: string;
    itemCodeSku: string;
    itemFullName: string;
    description?: string | null;
  };
}

export interface DirectInvoiceFilters {
  page?: number;
  limit?: number;
  searchq?: string;
  status?: string;
  clientId?: string;
  companyId: string;
  branchId?: string | null;
}

export interface SubmitFeedbackDto {
  feedbackMonth: number;
  rating: number; // 1-5
  comments: string;
  improvements?: string;
  wouldRecommend: boolean;
}

export interface CreateDemoRequestDto {
  companyName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  interestedModules: string[];
  preferredDate?: Date;
  preferredTime?: "Morning" | "Afternoon" | "Evening";
  timezone?: string;
  additionalNotes?: string;
}

export interface ScheduleDemoDto {
  scheduledDate: Date;
  meetingLink: string;
  assignedTo: string;
}

export interface NDAData {
  clientName: string;
  clientAddress: string;
  clientEmail: string;
  clientPhone: string;
  contactPerson: string;
  date: string;
}

export interface ImportItemRow {
  itemFullName: string;
  categoryName: string;
  productCode?: string;
  description?: string;
  minLevel: number;
  maxLevel: number;
  // Single tax column from import/template: "A" (0.0) or "B" (18.0)
  taxCode?: "A" | "B" | string;
  insurancePrice?: number;
}

export interface ValidationError {
  row: number;
  field: string;
  message: string;
}

export interface CreateAppointmentDto {
  patientId: string;
  providerId: string;
  appointmentType: string;
  scheduledDate: string;
  duration: number;
  reason: string;
  notes?: string;
  room?: string;
  isWalkIn?: boolean;
}

export interface UpdateAppointmentDto {
  appointmentType?: string;
  scheduledDate?: string;
  duration?: number;
  reason?: string;
  notes?: string;
  room?: string;
  status?: string;
}

export interface AppointmentFilters {
  page?: number;
  limit?: number;
  searchq?: string;
  patientId?: string;
  providerId?: string;
  appointmentType?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  isWalkIn?: boolean;
  queueStatus?: string;
}

export interface CalendarView {
  date: string;
  appointments: Array<{
    id: string;
    time: string;
    duration: number;
    patient: { id: string; name: string; patientNO: string };
    provider: { id: string; name: string };
    status: string;
    room?: string;
  }>;
}

// Clinic Billing
export interface BillingServiceLineInput {
  code: string;
  description: string;
  quantity: number;
  unitPrice: number;
  itemId?: string; // Link to Items table for clinical supplies
}

export interface CreateClinicBillingDto {
  patientId: string;
  encounterId?: string;
  billingType?: string;
  services: BillingServiceLineInput[];
  taxAmount?: number;
  discountAmount?: number;
  currency?: string;
  dueDate?: string;
  notes?: string;
}

export interface UpdateClinicBillingDto {
  services?: BillingServiceLineInput[];
  taxAmount?: number;
  discountAmount?: number;
  currency?: string;
  dueDate?: string;
  notes?: string;
  status?: "DRAFT" | "SENT" | "PAID" | "CANCELLED";
}

export interface CreateProviderDto {
  name: string;
  email: string;
  specialty?: string;
  licenseNumber?: string;
}

export interface UpdateProviderDto {
  name?: string;
  email?: string;
  specialty?: string;
  licenseNumber?: string;
}

export type EncounterStatus =
  | "SCHEDULED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED"
  | "NO_SHOW";
export type VisitType =
  | "OUTPATIENT"
  | "INPATIENT"
  | "EMERGENCY"
  | "FOLLOW_UP"
  | "WELLNESS_CHECK";

export interface CreateEncounterDto {
  patientId: string;
  providerId: string;
  appointmentId?: string;
  visitType?: VisitType;
  scheduledTime?: string;
}

export interface UpdateEncounterDto {
  providerId?: string;
  visitType?: VisitType;
  scheduledTime?: string;
  status?: EncounterStatus;
}

export interface EncounterFilters {
  patientId?: string;
  providerId?: string;
  appointmentId?: string;
  status?: EncounterStatus | EncounterStatus[];
  visitType?: VisitType;
  startDate?: string;
  endDate?: string;
}

export type TriageLevel = "ROUTINE" | "URGENT" | "EMERGENCY" | "CRITICAL";

export interface CreateTriageDto {
  encounterId: string;
  triageLevel: TriageLevel;
  chiefComplaint: string;
  triageNotes?: string;
  // Vitals
  temperature?: number;
  bloodPressureSystolic?: number;
  bloodPressureDiastolic?: number;
  heartRate?: number;
  respiratoryRate?: number;
  oxygenSaturation?: number;
  weight?: number;
  height?: number;
  painScore?: number;
  allergies?: string;
  currentMedications?: string;
}

export interface UpdateTriageDto {
  triageLevel?: TriageLevel;
  chiefComplaint?: string;
  triageNotes?: string;
  temperature?: number;
  bloodPressureSystolic?: number;
  bloodPressureDiastolic?: number;
  heartRate?: number;
  respiratoryRate?: number;
  oxygenSaturation?: number;
  weight?: number;
  height?: number;
  painScore?: number;
  allergies?: string;
  currentMedications?: string;
}

export type DiagnosisType =
  | "PRIMARY"
  | "SECONDARY"
  | "DIFFERENTIAL"
  | "RULED_OUT";

export interface CreateConsultationDto {
  encounterId: string;
  chiefComplaint: string;
  historyOfPresentingIllness?: string;
  pastMedicalHistory?: string;
  familyHistory?: string;
  socialHistory?: string;
  reviewOfSystems?: Record<string, unknown>;
  physicalExamination?: string;
  generalAppearance?: string;
  systemicExamination?: Record<string, unknown>;
  clinicalImpression?: string;
  differentialDiagnosis?: string;
  treatmentPlan?: string;
  followUpInstructions?: string;
  diagnoses?: Array<{
    icdCode: string;
    icdVersion?: string;
    diagnosisName: string;
    diagnosisType?: DiagnosisType;
    notes?: string;
  }>;
}

export interface UpdateConsultationDto {
  chiefComplaint?: string;
  historyOfPresentingIllness?: string;
  pastMedicalHistory?: string;
  familyHistory?: string;
  socialHistory?: string;
  reviewOfSystems?: Record<string, unknown>;
  physicalExamination?: string;
  generalAppearance?: string;
  systemicExamination?: Record<string, unknown>;
  clinicalImpression?: string;
  differentialDiagnosis?: string;
  treatmentPlan?: string;
  followUpInstructions?: string;
}

export interface AddDiagnosisDto {
  icdCode: string;
  icdVersion?: string;
  diagnosisName: string;
  diagnosisType?: DiagnosisType;
  notes?: string;
  onsetDate?: string;
}

export type OrderStatus1 =
  | "PENDING"
  | "SCHEDULED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED"
  | "REJECTED";

export interface CreateLabOrderDto {
  encounterId: string;
  patientId: string;
  providerId: string;
  testId: string;
  priority?: string;
  clinicalNotes?: string;
  specialInstructions?: string;
  scheduledDate?: string;
}

export interface UpdateLabOrderDto {
  status?: OrderStatus1;
  priority?: string;
  clinicalNotes?: string;
  specialInstructions?: string;
  scheduledDate?: string;
  sampleCollectedAt?: string;
}

export interface LabOrderFilters {
  patientId?: string;
  providerId?: string;
  encounterId?: string;
  status?: OrderStatus1;
  testCategory?: string;
  startDate?: string;
  endDate?: string;
}

export interface CreateLabResultDto {
  labOrderId: string;
  testParameter: string;
  result: string;
  unit?: string;
  referenceRange?: string;
  isAbnormal?: boolean;
  abnormalFlag?: string;
  notes?: string;
}

export interface UpdateLabResultDto {
  result?: string;
  unit?: string;
  referenceRange?: string;
  isAbnormal?: boolean;
  abnormalFlag?: string;
  notes?: string;
}

export interface BulkCreateResultsDto {
  labOrderId: string;
  results: Array<{
    testParameter: string;
    result: string;
    unit?: string;
    referenceRange?: string;
    isAbnormal?: boolean;
    abnormalFlag?: string;
  }>;
  notes?: string;
}

export type LabTestType = "SINGLE" | "PANEL" | "PROFILE";

export interface CreateLabTestDto {
  testCode: string;
  testName: string;
  testType?: LabTestType;
  category: string;
  description?: string;
  sampleType: string;
  sampleVolume?: string;
  turnaroundTime?: number;
  price?: number;
  panelTests?: string[];
  referenceRanges?: Record<string, unknown>;
  requiresApproval?: boolean;
}

export interface UpdateLabTestDto {
  testCode?: string;
  testName?: string;
  testType?: LabTestType;
  category?: string;
  description?: string;
  sampleType?: string;
  sampleVolume?: string;
  turnaroundTime?: number;
  price?: number;
  panelTests?: string[];
  referenceRanges?: Record<string, unknown>;
  requiresApproval?: boolean;
  isActive?: boolean;
}
export interface LabTestFilters {
  category?: string;
  testType?: LabTestType;
  isActive?: boolean;
  search?: string;
}

export type NoteType =
  | "PROGRESS"
  | "DISCHARGE_SUMMARY"
  | "REFERRAL_LETTER"
  | "CONSULTATION"
  | "PROCEDURE_NOTE"
  | "OTHER";

export interface CreateClinicalNoteDto {
  encounterId: string;
  noteType: NoteType;
  title: string;
  content: string;
  // For discharge summaries
  admissionDate?: string;
  dischargeDate?: string;
  dischargeDiagnosis?: string;
  dischargeInstructions?: string;
  // For referrals
  referralTo?: string;
  referralReason?: string;
  referralUrgency?: string;
  // Attachments
  attachments?: Array<{ fileName: string; fileUrl: string; fileType: string }>;
}

export interface UpdateClinicalNoteDto {
  title?: string;
  content?: string;
  admissionDate?: string;
  dischargeDate?: string;
  dischargeDiagnosis?: string;
  dischargeInstructions?: string;
  referralTo?: string;
  referralReason?: string;
  referralUrgency?: string;
  attachments?: Array<{ fileName: string; fileUrl: string; fileType: string }>;
}

export interface ClinicalNoteFilters {
  patientId?: string;
  encounterId?: string;
  noteType?: NoteType;
  startDate?: string;
  endDate?: string;
}

export type CareProgramType =
  | "MATERNAL_HEALTH"
  | "CHILD_HEALTH"
  | "ANTENATAL_CARE"
  | "POSTNATAL_CARE"
  | "CHRONIC_DISEASE"
  | "DIABETES_MANAGEMENT"
  | "HYPERTENSION_MANAGEMENT"
  | "OTHER";

export interface CreateCareProgramDto {
  programName: string;
  programType: CareProgramType;
  description?: string;
  eligibilityCriteria?: Record<string, unknown>;
  protocolSteps?: Record<string, unknown>;
}

export interface UpdateCareProgramDto {
  programName?: string;
  programType?: CareProgramType;
  description?: string;
  eligibilityCriteria?: Record<string, unknown>;
  protocolSteps?: Record<string, unknown>;
  isActive?: boolean;
}

export interface EnrollPatientDto {
  programId: string;
  patientId: string;
  enrollmentDate?: string;
  expectedEndDate?: string;
  notes?: string;
}

export interface UpdateEnrollmentDto {
  expectedEndDate?: string;
  currentStage?: string;
  notes?: string;
  status?: string;
  discontinuationReason?: string;
}

export interface RecordVisitDto {
  enrollmentId: string;
  encounterId?: string;
  visitDate: string;
  visitType: string;
  observations?: Record<string, unknown>;
  measurements?: Record<string, unknown>;
  assessments?: Record<string, unknown>;
  interventions?: Record<string, unknown>;
  nextVisitDate?: string;
  notes?: string;
}

export type PrescriptionStatus =
  | "DRAFT"
  | "ACTIVE"
  | "DISPENSED"
  | "COMPLETED"
  | "CANCELLED"
  | "ON_HOLD";

export interface CreatePrescriptionDto {
  encounterId?: string;
  patientId: string;
  providerId: string;
  medicationName: string;
  itemId?: string;
  dosage: string;
  frequency: string;
  route: string;
  duration?: string;
  quantity: number;
  unit: string;
  instructions?: string;
  indicationForUse?: string;
  startDate?: string;
  endDate?: string;
  refillsAllowed?: number;
}

export interface UpdatePrescriptionDto {
  medicationName?: string;
  dosage?: string;
  frequency?: string;
  route?: string;
  duration?: string;
  quantity?: number;
  unit?: string;
  instructions?: string;
  indicationForUse?: string;
  startDate?: string;
  endDate?: string;
  refillsAllowed?: number;
  status?: PrescriptionStatus;
}

export interface DispensePrescriptionDto {
  quantityDispensed: number;
  warehouseId?: string;
  batchNumber?: string;
  expiryDate?: string;
  pharmacyNotes?: string;
}

export interface PrescriptionFilters {
  patientId?: string;
  providerId?: string;
  encounterId?: string;
  status?: PrescriptionStatus;
  startDate?: string;
  endDate?: string;
}

export interface BillingServiceLineInput {
  code: string;
  description: string;
  quantity: number;
  unitPrice: number;
  itemId?: string; // Link to Items table for clinical supplies
}

export interface CreateClinicBillingDto {
  patientId: string;
  encounterId?: string;
  billingType?: string;
  services: BillingServiceLineInput[];
  taxAmount?: number;
  discountAmount?: number;
  currency?: string;
  dueDate?: string;
  notes?: string;
}

export interface UpdateClinicBillingDto {
  services?: BillingServiceLineInput[];
  taxAmount?: number;
  discountAmount?: number;
  currency?: string;
  dueDate?: string;
  notes?: string;
  status?: "DRAFT" | "SENT" | "PAID" | "CANCELLED";
}

// Enums
export enum DispenseStatus {
  PENDING = "PENDING",
  DISPENSED = "DISPENSED",
  PARTIAL = "PARTIAL",
  CANCELLED = "CANCELLED",
}

export type AdjustmentType = $Enums.AdjustmentType;

export enum ReturnReason {
  EXPIRED = "EXPIRED",
  DAMAGED = "DAMAGED",
  WRONG_ITEM = "WRONG_ITEM",
  PATIENT_REFUSAL = "PATIENT_REFUSAL",
  OTHER = "OTHER",
}

// Request Interfaces
export interface CreateDispenseRequest {
  prescriptionId?: string;
  patientId: string;
  itemId: string;
  quantity: number;
  unit: string;
  batchNumber?: string;
  expiryDate?: Date;
  notes?: string;
}

export interface UpdateDispenseRequest {
  quantity?: number;
  batchNumber?: string;
  expiryDate?: Date;
  status?: DispenseStatus;
  dispensedAt?: Date;
  notes?: string;
}

export interface CreateOTCSaleRequest {
  patientId?: string;
  itemId: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  notes?: string;
}

export interface CreateReturnRequest {
  dispenseId?: string;
  prescriptionId?: string;
  itemId: string;
  quantity: number;
  unit: string;
  returnReason: ReturnReason;
  reasonNotes?: string;
}

export interface CreateAdjustmentRequest {
  itemId: string;
  adjustmentType: AdjustmentType;
  quantity: number;
  unit: string;
  reason: string;
}

export interface CheckDrugInteractionsRequest {
  medications: string[]; // Array of medication IDs or names
}

// Response Interfaces
export interface DispenseResponse {
  id: string;
  prescriptionId?: string | null;
  patientId: string;
  companyId: string;
  itemId: string;
  quantity: number;
  unit: string;
  batchNumber?: string | null;
  expiryDate?: Date | null;
  status: DispenseStatus;
  dispensedBy: string;
  dispensedAt?: Date | null;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OTCSaleResponse {
  id: string;
  patientId: string | null;
  companyId: string;
  itemId: string;
  quantity: number | any;
  unit: string;
  unitPrice: number | any;
  totalAmount: number | any;
  soldBy: string;
  soldAt: Date;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReturnResponse {
  id: string;
  dispenseId?: string | null;
  prescriptionId?: string | null;
  companyId: string;
  itemId: string;
  quantity: number | any;
  unit: string;
  returnReason: ReturnReason;
  reasonNotes?: string | null;
  returnedBy: string;
  returnedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdjustmentResponse {
  id: string;
  companyId: string;
  itemId: string;
  adjustmentType: AdjustmentType;
  quantity: number;
  unit: string;
  reason: string;
  adjustedBy: string;
  adjustedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface MedicationHistoryResponse {
  dispenses: DispenseResponse[];
  otcSales: OTCSaleResponse[];
}

export interface DrugInteractionResponse {
  hasInteractions: boolean;
  interactions: Array<{
    medication1: string;
    medication2: string;
    severity: string;
    description: string;
  }>;
}

export interface AllergyAlertResponse {
  hasAllergy: boolean;
  allergies: Array<{
    allergen: string;
    severity: string;
    reaction?: string;
  }>;
}
