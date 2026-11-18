/**
 * Coupang order sheet (PO) → canonical Order.
 *
 * Coupang lists orders as order sheets, one per shipment box: "shipmentBoxId
 * | number | shipment No. (bundled shipment No.)" and "orderId | number |
 * order No." (https://developers.coupang.com/en/api/shipments/po-list-query-paging-by-day).
 * A split-shipped order is several order sheets with one orderId, so the
 * canonical id is the shipmentBoxId, which the single-PO query reads back
 * (GET .../v5/vendors/{vendorId}/ordersheets/{shipmentBoxId}), and the
 * orderId is the order number.
 *
 * Every field read below is in that page's response table. Nothing is
 * defaulted: a money object carries its own `currencyCode`, and an absent one
 * leaves the canonical field out.
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { Money } from '../../../schema/shared'
import type { Address } from '@opensteward/shared'
import { majorToMinor, toIsoDatetime } from '@opensteward/shared'

// ── Raw shapes (documented fields only) ───────────────────────────────────────

/**
 * "currencyCode | string | Three-letter uppercase string (format follows
 * ISO-4217)", "units | number | 64-bit integer representing the integer part
 * of the monetary value", "nanos | number | 32-bit integer representing the
 * decimal part of the monetary value, in the range of [-999999999, 999999999]".
 */
export interface RawCoupangMoney {
  currencyCode?: string | null
  units?: number | null
  nanos?: number | null
}

export interface RawCoupangOrderItem {
  sequenceNo?: string
  vendorItemPackageId?: number
  vendorItemPackageName?: string
  productId?: number
  vendorItemId?: number | string
  vendorItemName?: string
  shippingCount?: number
  salesPrice?: RawCoupangMoney | null
  orderPrice?: RawCoupangMoney | null
  discountPrice?: RawCoupangMoney | null
  externalVendorSkuCode?: string
  sellerProductId?: number | string
  sellerProductName?: string
  sellerProductItemName?: string
  cancelCount?: number
  holdCountForCancel?: number
  canceled?: boolean
  [key: string]: unknown
}

export interface RawCoupangReceiver {
  name?: string
  safeNumber?: string
  receiverNumber?: string | null
  addr1?: string
  addr2?: string
  postCode?: string
  [key: string]: unknown
}

export interface RawCoupangOrder {
  /** Past Number.MAX_SAFE_INTEGER in the documented example, so the client keeps it as a string then. */
  shipmentBoxId?: number | string
  orderId?: number | string
  orderedAt?: string
  orderer?: { name?: string; email?: string; safeNumber?: string; ordererNumber?: string | null }
  paidAt?: string
  status?: string
  shippingPrice?: RawCoupangMoney | null
  remotePrice?: RawCoupangMoney | null
  receiver?: RawCoupangReceiver
  orderItems?: RawCoupangOrderItem[]
  deliveryCompanyName?: string
  invoiceNumber?: string
  inTrasitDateTime?: string
  deliveredDate?: string
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * A documented money object → canonical Money in minor units. Undefined when
 * the object, its currency or its units are absent: never a default currency
 * and never a zero for an amount Coupang did not send.
 */
export function coupangMoney(raw: RawCoupangMoney | null | undefined): Money | undefined {
  if (!raw || !raw.currencyCode || typeof raw.units !== 'number') return undefined
  const nanos = typeof raw.nanos === 'number' ? raw.nanos : 0
  const amount = majorToMinor(raw.units + nanos / 1_000_000_000, raw.currencyCode)
  if (amount === undefined) return undefined
  return { amount, currency: raw.currencyCode }
}

/** The canonical order id: the order sheet's shipmentBoxId. */
export function orderSheetId(raw: RawCoupangOrder): string {
  if (raw.shipmentBoxId === undefined || raw.shipmentBoxId === null || raw.shipmentBoxId === '') {
    throw new Error('Coupang order sheet has no shipmentBoxId')
  }
  return String(raw.shipmentBoxId)
}

/**
 * Every documented PO status is at or past "Payment completed" (ACCEPT), so
 * a known status is PAID. Anything else is not mapped.
 */
export function mapFinancialStatus(status: string | undefined): OrderFinancialStatus | undefined {
  if (!status) return undefined
  switch (status) {
    case 'ACCEPT':
    case 'INSTRUCT':
    case 'DEPARTURE':
    case 'DELIVERING':
    case 'FINAL_DELIVERY':
    case 'NONE_TRACKING':
      return 'PAID'
    default:
      return 'unknown'
  }
}

/**
 * ACCEPT "Payment completed" and INSTRUCT "Product in preparation" have not
 * shipped; DEPARTURE "Shipment commenced", DELIVERING "In transit" and
 * FINAL_DELIVERY "Delivery completed" have. NONE_TRACKING ("Seller to ship out
 * the product directly ...; tracking not available") says nothing about
 * whether it has shipped yet.
 */
export function mapFulfillmentStatus(
  status: string | undefined,
): OrderFulfillmentStatus | undefined {
  if (!status) return undefined
  switch (status) {
    case 'ACCEPT':
    case 'INSTRUCT':
      return 'UNFULFILLED'
    case 'DEPARTURE':
    case 'DELIVERING':
    case 'FINAL_DELIVERY':
      return 'FULFILLED'
    default:
      return 'unknown'
  }
}

/** A line item's id: the box plus the item's "3-digit sequence number for the order item". */
export function lineItemId(boxId: string, item: RawCoupangOrderItem): string {
  if (!item.sequenceNo)
    throw new Error(`Coupang order sheet ${boxId} has an item with no sequenceNo`)
  return `${boxId}:${item.sequenceNo}`
}

function mapLineItem(boxId: string, item: RawCoupangOrderItem): LineItem {
  const price = coupangMoney(item.salesPrice)
  if (!price) throw new Error(`Coupang order sheet ${boxId} has an item with no salesPrice`)
  if (typeof item.shippingCount !== 'number') {
    throw new Error(`Coupang order sheet ${boxId} has an item with no shippingCount`)
  }
  if (!item.vendorItemName) {
    throw new Error(`Coupang order sheet ${boxId} has an item with no vendorItemName`)
  }
  return {
    id: lineItemId(boxId, item),
    productId: item.sellerProductId != null ? String(item.sellerProductId) : undefined,
    variantId: item.vendorItemId != null ? String(item.vendorItemId) : undefined,
    title: item.vendorItemName,
    quantity: item.shippingCount,
    price,
    totalDiscount: coupangMoney(item.discountPrice),
    sku: item.externalVendorSkuCode || undefined,
    metadata: item as unknown as Record<string, unknown>,
  }
}

function mapReceiver(receiver: RawCoupangReceiver | undefined): Address | undefined {
  if (!receiver) return undefined
  return {
    line1: receiver.addr1,
    line2: receiver.addr2,
    postalCode: receiver.postCode,
  }
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformOrder(raw: RawCoupangOrder): Order {
  const id = orderSheetId(raw)
  const lineItems = (raw.orderItems ?? []).map((item) => mapLineItem(id, item))
  const shipping = coupangMoney(raw.shippingPrice)

  return {
    id,
    orderNumber: raw.orderId != null ? String(raw.orderId) : undefined,
    currency: shipping?.currency,
    totalShipping: shipping,
    financialStatus: mapFinancialStatus(raw.status),
    fulfillmentStatus: mapFulfillmentStatus(raw.status),
    lineItems,
    shippingAddress: mapReceiver(raw.receiver),
    createdAt: toIsoDatetime(raw.orderedAt),
    processedAt: toIsoDatetime(raw.paidAt),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
