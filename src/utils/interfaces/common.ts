import type { $Enums, PaymentMethod } from "@prisma/client";
import { TsoaResponse } from "tsoa";
import { DeliveryItemStatus } from "@prisma/client";

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
  company?: { id: string; userId: string; companyId: string };
};

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

export interface CreateCompanyStaffDto {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string;
  title?: string;
  role: RoleType;
  idNumber?: string;
  idAttachment?: Express.Multer.File | string;
}

// CompanyTools DTOs
export interface CreateCompanyToolsDto {
  sellingPercentage?: number;
  companySignature?: string;
  companyStamp?: string;
  bankName?: string;
  accountNumber?: string;
  accountHolderName?: string;
}

export interface UpdateCompanyToolsDto extends Partial<CreateCompanyToolsDto> {}

export interface CreatePatientDto {
  name: string;
  identificationType: string;
  phone: string;
  gender: string;
  birthDate: Date;
  NID: string;
  address: {
    city: string;
    street: string;
    country: string;
  }[];
}

export interface UpdatePatientDto extends Partial<CreatePatientDto> {}

export interface CreateInsuranceCardDto {
  patientId: string;
  insuranceId: string;
  cardNumber: string;
  expireDate: Date;
  beneficiary: string;
  isOwner: boolean;
  details: { key: string; value: string }[];
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
  percentage: number;
}

export interface UpdateInsuranceDto extends Partial<CreateInsuranceDto> {}

export interface CreateItemDto {
  itemFullName: string;
  categoryId: string;
  description?: string;
  productCode?: string;
  minLevel: number;
  maxLevel: number;
}

export interface UpdateItemDto {
  itemFullName?: string;
  categoryId: string;
  description?: string;
  productCode?: string;
  minLevel: number;
  maxLevel: number;
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
  uom: string;
  tempReq: string;
  currency: string;
  condition: string;
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
  currency: string;
  uom: string;
  tempReq: string;
  condition: string;
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
  condition: string;
  tempReq: string;
  uom: string;
  currency: string;
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
  email: string;
  phone: string;
  address: string;
}

export interface UpdateClientDto {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
}

export interface CreateSellDto {
  clientId: string;
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
  dateReceived: Date;
  expiryDate?: Date;
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
}

export interface ValidationError {
  row: number;
  field: string;
  message: string;
}
