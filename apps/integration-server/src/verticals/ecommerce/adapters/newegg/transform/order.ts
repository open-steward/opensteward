/**
 * Newegg Order → canonical Order.
 *
 * Newegg's Order Management API returns marketplace orders with item-level
 * detail. Orders are identified by OrderNumber.
 *
 * POST /ordermgmt/order/orderinfo → list (batch query, paginated)
 * GET  /ordermgmt/order/{orderNumber} → get
 *
 * Money amounts are plain numbers with a USD assumption unless specified.
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import { majorToMinor } from '../../../schema/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawNeweggOrderItem {
  SellerPartNumber?: string
  NeweggItemNumber?: string
  Description?: string
  QuantityOrdered?: number
  QuantityShipped?: number
  UnitPrice?: number
  ExtendShippingCharge?: number
  ExtendSalesTax?: number
  ExtendVAT?: number
  ExtendDuty?: number
  Status?: number  // 0 = Unshipped, 1 = PartiallyShipped, 2 = Shipped, 3 = Voided
  StatusDescription?: string
  [key: string]: unknown
}

export interface RawNeweggAddress {
  ContactName?: string
  AddressLine1?: string
  AddressLine2?: string
  City?: string
  State?: string
  ZipCode?: string
  Country?: string
  PhoneNumber?: string
  EmailAddress?: string
}

export interface RawNeweggOrder {
  OrderNumber: string
  InvoiceNumber?: string
  OrderDate?: string
  OrderDateInGMT?: string
  OrderDownloaded?: boolean
  OrderStatus?: number         // 0 = Unshipped, 1 = PartiallyShipped, 2 = Shipped, 3 = Voided
  OrderStatusDescription?: string
  CustomerName?: string
  CustomerPhoneNumber?: string
  CustomerEmailAddress?: string
  ShipToAddress1?: string
  ShipToAddress2?: string
  ShipToCity?: string
  ShipToState?: string
  ShipToZipCode?: string
  ShipToCountry?: string
  ShipToFirstName?: string
  ShipToLastName?: string
  ShipService?: string
  ShipToCompany?: string
  OrderItemAmount?: number
  ShippingAmount?: number
  DiscountAmount?: number
  SalesTax?: number
  OrderTotalAmount?: number
  IsAutoVoid?: boolean
  ItemInfoList?: RawNeweggOrderItem[]
  PackageInfoList?: RawNeweggPackageInfo[]
  [key: string]: unknown
}

export interface RawNeweggPackageInfo {
  PackageType?: string
  ShipCarrier?: string
  ShipService?: string
  TrackingNumber?: string
  ShipDate?: string
  ItemInfoList?: Array<{
    SellerPartNumber?: string
    Quantity?: number
  }>
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toMoney(amount: number | undefined, currency = 'USD'):
  | { amount: number; currency: string }
  | undefined {
  if (amount == null) return undefined
  return { amount: majorToMinor(amount, currency), currency }
}

/**
 * Newegg order status → canonical fulfillment status.
 * Status codes: 0 = Unshipped, 1 = PartiallyShipped, 2 = Shipped, 3 = Voided
 */
export function mapFulfillmentStatus(
  status: number | undefined,
): OrderFulfillmentStatus | undefined {
  if (status == null) return undefined
  switch (status) {
    case 0:
      return 'UNFULFILLED'
    case 1:
      return 'PARTIAL'
    case 2:
      return 'FULFILLED'
    default:
      return undefined
  }
}

/**
 * Newegg order status → canonical financial status.
 * Newegg orders are prepaid — the financial status is inferred from order status.
 */
export function mapFinancialStatus(
  status: number | undefined,
): OrderFinancialStatus | undefined {
  if (status == null) return undefined
  switch (status) {
    case 0:
    case 1:
    case 2:
      return 'PAID'
    case 3:
      return 'VOIDED'
    default:
      return 'PAID'
  }
}

function mapLineItem(raw: RawNeweggOrderItem): LineItem {
  const qty = raw.QuantityOrdered ?? 1
  const unitPrice = raw.UnitPrice ?? 0

  return {
    id: raw.SellerPartNumber ?? raw.NeweggItemNumber ?? '0',
    title: raw.Description ?? raw.SellerPartNumber ?? 'Unknown',
    quantity: qty,
    price: { amount: majorToMinor(unitPrice, 'USD'), currency: 'USD' },
    sku: raw.SellerPartNumber,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

function mapShippingAddress(raw: RawNeweggOrder) {
  if (!raw.ShipToAddress1 && !raw.ShipToCity) return undefined
  return {
    line1: raw.ShipToAddress1,
    line2: raw.ShipToAddress2,
    city: raw.ShipToCity,
    region: raw.ShipToState,
    postalCode: raw.ShipToZipCode,
    country: raw.ShipToCountry,
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformOrder(raw: RawNeweggOrder): Order {
  const lineItems = (raw.ItemInfoList ?? []).map((li) => mapLineItem(li))
  const isVoided = raw.OrderStatus === 3

  return {
    id: raw.OrderNumber,
    orderNumber: raw.InvoiceNumber ?? raw.OrderNumber,
    name: raw.OrderNumber,
    email: raw.CustomerEmailAddress,
    phone: raw.CustomerPhoneNumber,
    currency: 'USD',
    totalPrice: toMoney(raw.OrderTotalAmount),
    subtotalPrice: toMoney(raw.OrderItemAmount),
    totalTax: toMoney(raw.SalesTax),
    totalShipping: toMoney(raw.ShippingAmount),
    totalDiscounts: toMoney(raw.DiscountAmount),
    financialStatus: mapFinancialStatus(raw.OrderStatus),
    fulfillmentStatus: mapFulfillmentStatus(raw.OrderStatus),
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    shippingAddress: mapShippingAddress(raw),
    createdAt: raw.OrderDateInGMT ?? raw.OrderDate,
    updatedAt: raw.OrderDateInGMT ?? raw.OrderDate,
    processedAt: raw.OrderDateInGMT ?? raw.OrderDate,
    cancelledAt: isVoided ? (raw.OrderDateInGMT ?? raw.OrderDate) : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
