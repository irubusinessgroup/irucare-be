import type { $Enums, PaymentMethod } from "@prisma/client";
import { TsoaResponse } from "tsoa";

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

export interface TConversation {
  id: string;
  email: string;
  customerName: string;
  company?: string | null;
  status: "PENDING" | "RESOLVED";
  lastMessageAt: Date;
  totalMessages: number;
  totalReplies: number;
  contacts: TContact[];
  replies: TContactReply[];
  createdAt: Date;
  updatedAt: Date;
}

export interface TConversationMessage {
  id: string;
  message: string;
  senderType: "customer" | "admin";
  senderName: string;
  senderEmail?: string | null;
  adminName?: string | null;
  createdAt: Date;
  contactId?: string | null;
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

export interface UpdateConversationStatusDto {
  status: "PENDING" | "RESOLVED";
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
  metadata?: any;
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
  orderId: string;
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
  order?: TOrder;
};

export interface CreatePaymentDto {
  orderId: string;
  amount: number;
  method: PaymentMethod;
  accountNumber: string;
}

export interface withdrawalPaymentDto {
  amount: number;
  accountNumber: string;
}

export interface UpdatePaymentDto {
  orderId: string;
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

export interface CreateDeliveryDto {
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
  customerNote?: string;
  estimatedDate?: Date;
  deliveredAt?: Date;
}

export interface UpdateDeliveryDto {
  address: string;
  city: string;
  province: string;
  country: string;
  postalCode: string;
  customerFirstName: string;
  customerLastName: string;
  customerEmail: string;
  customerPhone: string;
  customerNote?: string;
  estimatedDate?: Date;
  deliveredAt?: Date;
  deliveryStatus: DeliveryStatus;
}

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

export interface CreateDrugsCategoryDto {
  name: string;
}

export interface UpdateDrugsCategoryDto {
  name: string;
}

export interface CreateDrugDto {
  drugCategoryId: string;
  drugCode: string;
  description: string;
  designation: string;
  instruction: string;
}

export interface UpdateDrugDto {
  drugCategoryId?: string;
  drugCode?: string;
  description?: string;
  designation?: string;
  instruction?: string;
}

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

export interface CreateItemRequest {
  item_full_name: string;
  category_id: string;
  description?: string;
  brand_manufacturer?: string;
  barcode_qr_code: string;
  pack_size?: number;
  uom_id: string;
  temp_req_id: string;
}

export interface UpdateItemRequest {
  item_full_name?: string;
  category_id?: string;
  description?: string;
  brand_manufacturer?: string;
  barcode_qr_code?: string;
  pack_size?: number;
  uom_id?: string;
  temp_req_id?: string;
  is_active?: boolean;
}

export interface ItemResponse {
  id: string;
  item_code_sku: string;
  item_full_name: string;
  category: {
    id: string;
    category_name: string;
    description?: string;
  };
  description?: string;
  brand_manufacturer?: string;
  barcode_qr_code: string;
  pack_size?: number;
  uom: {
    id: string;
    uom_name: string;
    abbreviation?: string;
  };
  temp: {
    id: string;
    temp_req_name: string;
    min_temp_celsius?: number;
    max_temp_celsius?: number;
  };
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  current_stock?: number;
}

export interface CreateStockEntryRequest {
  item_id: string;
  supplier_id: string;
  po_id?: string;
  invoice_id?: string;
  quantity_received: number;
  unit_cost: number;
  currency_id: string;
  condition_id: string;
  storage_location_id: string;
  batch_lot_number?: string;
  expiry_date?: Date;
  serial_numbers?: string[];
  special_handling_notes?: string;
  remarks_notes?: string;
}

export interface StockEntryResponse {
  id: string;
  form_code?: string;
  item: ItemResponse;
  supplier: SupplierResponse;
  date_received: Date;
  quantity_received: number;
  unit_cost: number;
  total_cost: number;
  currency: CurrencyResponse;
  condition: ConditionResponse;
  storage_location: StorageLocationResponse;
  batch_info?: BatchInfo[];
  serial_numbers?: string[];
  special_handling_notes?: string;
  remarks_notes?: string;
  registered_by_user: UserResponse;
  received_by_user: UserResponse;
  created_at: Date;
  updatedAt: Date;
}

export interface BatchInfo {
  id: string;
  batch_lot_number: string;
  expiry_date?: Date | null;
  quantity_in_batch: number;
  current_stock_quantity: number;
}

export interface InventoryItem {
  id: string;
  item_code_sku: string;
  item_full_name: string;
  category_name: string;
  current_stock: number;
  uom_abbreviation: string;
  total_value: number;
  currency_code: string;
  batches: BatchInfo[];
  last_received: Date;
  expiry_alert: boolean;
}

export interface ExpiringItem {
  id: string;
  item_code_sku: string;
  item_full_name: string;
  batch_lot_number: string;
  expiry_date: Date;
  current_stock_quantity: number;
  days_to_expiry: number;
  alert_level: "critical" | "warning" | "info";
}

export interface CreateSupplierRequest {
  supplier_name: string;
  contact_person: string;
  phone_number: string;
  email: string;
  address?: string;
}

export interface UpdateSupplierRequest {
  supplier_name?: string;
  contact_person?: string;
  phone_number?: string;
  email?: string;
  address?: string;
  is_active?: boolean;
}

export interface SupplierResponse {
  id: string;
  supplier_name: string;
  contact_person: string;
  phone_number: string;
  email: string;
  address?: string;
  is_active: boolean;
  created_at: Date;
}

export interface CategoryResponse {
  id: string;
  category_name: string;
  description?: string | null;
}

export interface UomResponse {
  id: string;
  uom_name: string;
  abbreviation?: string | null;
}

export interface CurrencyResponse {
  id: string;
  currency_code: string;
}

export interface ConditionResponse {
  id: string;
  condition_name: string;
  description?: string | null;
}

export interface TemperatureRequirementResponse {
  id: string;
  temp_req_name: string;
  min_temp_celsius?: number;
  max_temp_celsius?: number;
}

export interface StorageLocationResponse {
  id: string;
  location_name: string;
  location_type?: string | null;
  description?: string | null;
}

export interface ItemFilters {
  category_id?: string;
  is_active?: boolean;
  search?: string;
  barcode?: string;
}

export interface StockEntryFilters {
  item_id?: string;
  supplier_id?: string;
  date_from?: Date;
  date_to?: Date;
  condition_id?: string;
}
