/**
 * Rakuten RMS order → canonical Order.
 *
 * Rakuten order statuses (orderProgress):
 *   100 = Order Received (pending)
 *   200 = Verified / Payment Confirmed
 *   300 = Packing / Processing
 *   400 = Shipped
 *   500 = Cancelled
 *   600 = Returned
 *   700 = Pending / Suspended
 *
 * Orders on Rakuten Ichiba are always in JPY.
 *
 * Key fields:
 *   - `orderNumber`         — Rakuten order identifier (primary key)
 *   - `orderProgress`       — integer status code
 *   - `totalPrice`          — order total in JPY
 *   - `packageList`         — array of shipment packages, each containing items
 *   - `ordererInfo`         — buyer information
 *   - `settlement`          — payment info
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { DEFAULT_CURRENCY } from '../constants'

// ── Raw shapes ────────────────────────────────────────────────────────────────

export interface RakutenOrderItem {
  /** Seller's item management number */
  itemDetailId?: number
  itemName?: string
  itemId?: string
  manageNumber?: string
  units?: number
  price?: number
  pointAmount?: number
  couponAllotmentPrice?: number
  inventoryType?: number
  [key: string]: unknown
}

export interface RakutenOrderPackage {
  packageId?: number
  shippingPrice?: number
  deliveryService?: string
  shipInquiryNo?: string
  noshi?: string
  detailList?: RakutenOrderItem[]
  [key: string]: unknown
}

export interface RakutenOrdererInfo {
  ordererName?: string
  ordererNameKana?: string
  ordererZipCode?: string
  ordererPrefecture?: string
  ordererAddress?: string
  ordererAddressB?: string
  ordererPhoneNumber1?: string
  ordererMailAddress?: string
  [key: string]: unknown
}

export interface RakutenDeliveryInfo {
  deliveryName?: string
  deliveryNameKana?: string
  deliveryZipCode?: string
  deliveryPrefecture?: string
  deliveryAddress?: string
  deliveryAddressB?: string
  deliveryPhoneNumber1?: string
  [key: string]: unknown
}

export interface RakutenSettlementInfo {
  settlementMethod?: string
  cardPayType?: number
  [key: string]: unknown
}

export interface RakutenOrder {
  /** Rakuten order number (primary key) */
  orderNumber: string
  /** Status code — see module header for values */
  orderProgress?: number
  totalPrice?: number
  postagePrice?: number
  giftWrapPrice?: number
  couponAllotmentPrice?: number
  pointAmount?: number
  taxRate?: number
  ordererInfo?: RakutenOrdererInfo
  deliveryInfo?: RakutenDeliveryInfo
  settlementInfo?: RakutenSettlementInfo
  packageList?: RakutenOrderPackage[]
  orderDatetime?: string
  lastupdateDatetime?: string
  cancelDatetime?: string
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Map Rakuten orderProgress to canonical financial status.
 */
export function mapFinancialStatus(progress: number | undefined): OrderFinancialStatus | undefined {
  if (progress === undefined || progress === null) return undefined
  if (progress === 100) return 'PENDING'
  if (progress >= 200 && progress < 500) return 'PAID'
  if (progress === 500 || progress === 600) return 'REFUNDED'
  if (progress === 700) return 'PENDING'
  return undefined
}

/**
 * Map Rakuten orderProgress to canonical fulfillment status.
 */
export function mapFulfillmentStatus(
  progress: number | undefined,
): OrderFulfillmentStatus | undefined {
  if (progress === undefined || progress === null) return undefined
  if (progress <= 200) return 'UNFULFILLED'
  if (progress === 300) return 'PARTIAL'
  if (progress >= 400 && progress < 500) return 'FULFILLED'
  if (progress === 500) return 'RESTOCKED'
  if (progress === 600) return 'RESTOCKED'
  return 'UNFULFILLED'
}

function mapAddress(
  info: RakutenOrdererInfo | RakutenDeliveryInfo | undefined,
): Address | undefined {
  if (!info) return undefined
  const raw = info as Record<string, unknown>
  const line1 = (raw['ordererAddress'] ?? raw['deliveryAddress']) as string | undefined
  const line2 = (raw['ordererAddressB'] ?? raw['deliveryAddressB']) as string | undefined
  const postalCode = (raw['ordererZipCode'] ?? raw['deliveryZipCode']) as string | undefined
  const region = (raw['ordererPrefecture'] ?? raw['deliveryPrefecture']) as string | undefined
  if (!line1 && !postalCode && !region) return undefined
  return {
    line1,
    line2,
    postalCode,
    region,
    country: 'JP',
  }
}

function mapLineItems(packages: RakutenOrderPackage[], currency: string): LineItem[] {
  const items: LineItem[] = []
  for (const pkg of packages) {
    for (const detail of pkg.detailList ?? []) {
      items.push({
        id: detail.itemDetailId != null ? String(detail.itemDetailId) : String(detail.itemId ?? ''),
        productId: detail.itemId ?? undefined,
        title: detail.itemName ?? 'Unknown item',
        quantity: detail.units ?? 1,
        price: { amount: detail.price ?? 0, currency },
        sku: detail.manageNumber,
        metadata: detail as unknown as Record<string, unknown>,
      })
    }
  }
  return items
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformOrder(raw: RakutenOrder): Order {
  const currency = DEFAULT_CURRENCY
  const lineItems = mapLineItems(raw.packageList ?? [], currency)

  const isCancelled = raw.orderProgress === 500 || raw.orderProgress === 600
  const shippingAddress = mapAddress(raw.deliveryInfo)
  const billingAddress = mapAddress(raw.ordererInfo)

  return {
    id: raw.orderNumber,
    orderNumber: raw.orderNumber,
    name: raw.orderNumber,
    email: raw.ordererInfo?.ordererMailAddress,
    phone: raw.ordererInfo?.ordererPhoneNumber1,
    currency,
    totalPrice:
      raw.totalPrice != null ? { amount: raw.totalPrice, currency } : undefined,
    totalShipping:
      raw.postagePrice != null ? { amount: raw.postagePrice, currency } : undefined,
    financialStatus: mapFinancialStatus(raw.orderProgress),
    fulfillmentStatus: mapFulfillmentStatus(raw.orderProgress),
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    billingAddress,
    shippingAddress,
    createdAt: raw.orderDatetime ?? undefined,
    updatedAt: raw.lastupdateDatetime ?? undefined,
    cancelledAt: isCancelled ? (raw.cancelDatetime ?? raw.lastupdateDatetime) : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
