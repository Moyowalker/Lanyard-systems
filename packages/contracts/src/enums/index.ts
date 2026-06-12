// Shared enums — the vocabulary of the platform. Backend schemas, services, guards and
// every frontend import these. Keep values stable: they are persisted in MongoDB.

/* ───────────────────────── Money & identity ───────────────────────── */

export enum Currency {
  NGN = 'NGN',
}

export enum PrincipalType {
  CUSTOMER = 'customer',
  STAFF = 'staff',
}

export enum ActorType {
  CUSTOMER = 'customer',
  STAFF = 'staff',
  SYSTEM = 'system',
}

export enum AccountStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
}

/* ───────────────────────── AuthN / OTP ───────────────────────── */

export enum OtpChannel {
  SMS = 'sms',
  EMAIL = 'email',
}

export enum OtpPurpose {
  LOGIN = 'login',
  VERIFY = 'verify',
  RESET = 'reset',
}

/* ───────────────────────── AuthZ / RBAC ───────────────────────── */

export enum RoleKey {
  SUPPORT = 'SUPPORT',
  PHARMACIST = 'PHARMACIST',
  BRANCH_MANAGER = 'BRANCH_MANAGER',
  ADMIN = 'ADMIN',
  SUPER_ADMIN = 'SUPER_ADMIN',
}

/** Branch scope sentinel for staff who may act across all branches. */
export const ALL_BRANCHES = 'ALL' as const;

/* ───────────────────────── Branch ───────────────────────── */

export enum BranchStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

/* ───────────────────────── Catalog ───────────────────────── */

export enum ProductForm {
  TABLET = 'tablet',
  CAPSULE = 'capsule',
  SYRUP = 'syrup',
  SUSPENSION = 'suspension',
  INJECTION = 'injection',
  CREAM = 'cream',
  OINTMENT = 'ointment',
  DROPS = 'drops',
  INHALER = 'inhaler',
  SUPPOSITORY = 'suppository',
  DEVICE = 'device',
  OTHER = 'other',
}

/** Regulatory classification — drives whether a prescription is required. */
export enum RegulatoryClass {
  OTC = 'OTC', // over the counter
  POM = 'POM', // prescription-only medicine
  CONTROLLED = 'CONTROLLED', // controlled substance (restricted)
}

export enum ProductStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
}

/* ───────────────────────── Prescriptions (PHI) ───────────────────────── */

export enum RxStatus {
  PENDING = 'pending',
  UNDER_REVIEW = 'under_review',
  NEEDS_INFO = 'needs_info',
  VERIFIED = 'verified',
  REJECTED = 'rejected',
  EXPIRED = 'expired',
}

export enum AvScanStatus {
  PENDING = 'pending',
  CLEAN = 'clean',
  INFECTED = 'infected',
}

export enum VerificationDecision {
  VERIFIED = 'verified',
  REJECTED = 'rejected',
}

/* ───────────────────────── Orders ───────────────────────── */

/** Order lifecycle — see the state machine in docs/architecture/03. */
export enum OrderStatus {
  CREATED = 'CREATED',
  AWAITING_RX_VERIFICATION = 'AWAITING_RX_VERIFICATION',
  RX_VERIFIED = 'RX_VERIFIED',
  RX_REJECTED = 'RX_REJECTED',
  AWAITING_PAYMENT = 'AWAITING_PAYMENT',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  PAID = 'PAID',
  STOCK_HOLD = 'STOCK_HOLD', // paid but insufficient stock — staff exception
  FULFILLING = 'FULFILLING',
  READY_FOR_PICKUP = 'READY_FOR_PICKUP',
  OUT_FOR_DELIVERY = 'OUT_FOR_DELIVERY',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
}

export enum FulfillmentType {
  PICKUP = 'pickup',
  DELIVERY = 'delivery',
}

/* ───────────────────────── Payments (Paystack at MVP) ───────────────────────── */

export enum PaymentProvider {
  PAYSTACK = 'paystack',
  FLUTTERWAVE = 'flutterwave', // adapter exists; not enabled at MVP launch
}

/** Status of a single payment attempt/intent with a provider. */
export enum PaymentIntentStatus {
  CREATED = 'created',
  PENDING = 'pending',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
  ABANDONED = 'abandoned',
}

/** Roll-up payment status stored on the order. */
export enum OrderPaymentStatus {
  UNPAID = 'unpaid',
  PENDING = 'pending',
  PAID = 'paid',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

export enum PaymentChannel {
  CARD = 'card',
  BANK_TRANSFER = 'bank_transfer',
  USSD = 'ussd',
}

export enum PaymentTxnType {
  CHARGE = 'charge',
  REFUND = 'refund',
}

export enum RefundStatus {
  REQUESTED = 'requested',
  PROCESSING = 'processing',
  DONE = 'done',
  FAILED = 'failed',
}

/* ───────────────────────── Inventory ───────────────────────── */

export enum StockMovementType {
  RECEIVE = 'receive',
  RESERVE = 'reserve',
  RELEASE = 'release',
  DISPENSE = 'dispense',
  ADJUST = 'adjust',
}

/* ───────────────────────── Fulfillment / delivery ───────────────────────── */

export enum DeliveryStatus {
  QUEUED = 'queued',
  DISPATCHED = 'dispatched',
  OUT_FOR_DELIVERY = 'out_for_delivery',
  DELIVERED = 'delivered',
  FAILED = 'failed',
}

/* ───────────────────────── Notifications ───────────────────────── */

export enum NotificationChannel {
  SMS = 'sms',
  EMAIL = 'email',
  WHATSAPP = 'whatsapp', // post-MVP
  PUSH = 'push', // post-MVP (mobile)
}

export enum NotificationStatus {
  QUEUED = 'queued',
  SENT = 'sent',
  FAILED = 'failed',
}

/* ───────────────────────── Platform ───────────────────────── */

export enum OutboxStatus {
  PENDING = 'pending',
  PUBLISHED = 'published',
  FAILED = 'failed',
}

/* ───────────────────────── Content / marketing ───────────────────────── */

export enum ContentStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
}

export enum PromotionType {
  PERCENT = 'percent',
  FIXED = 'fixed',
}

export enum PromotionScope {
  GLOBAL = 'global',
  BRANCH = 'branch',
}

export enum LeadStatus {
  NEW = 'new',
  CONTACTED = 'contacted',
  CLOSED = 'closed',
}
