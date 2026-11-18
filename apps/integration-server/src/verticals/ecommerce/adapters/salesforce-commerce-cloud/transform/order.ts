/**
 * Salesforce Commerce Cloud (SCAPI) Order → canonical Order.
 *
 * SCAPI Shopper Orders uses camelCase.  Key fields:
 *   - `orderNo`           → canonical `id` and `orderNumber`
 *   - `status`            → maps to `financialStatus` + `fulfillmentStatus`
 *   - `productItems`      → canonical `lineItems`
 *   - `billingAddress`    → `billingAddress`
 *   - `shipments[].shippingAddress` → `shippingAddress` (first shipment)
 *   - `orderTotal`        → `totalPrice` (major-unit decimal)
 *
 * Reference:
 *   GET  /order/shopper-orders/v1/organizations/{orgId}/orders/{orderNo}
 *   POST /checkout/shopper-orders/v1/organizations/{orgId}/orders
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw SCAPI shapes ──────────────────────────────────────────────────────────

export interface RawScapiOrderAddress {
  address1?: string | null
  address2?: string | null
  city?: string | null
  stateCode?: string | null
  postalCode?: string | null
  countryCode?: string | null
  firstName?: string | null
  lastName?: string | null
  phone?: string | null
}

export interface RawScapiPriceAdjustment {
  couponCode?: string
  promotion?: { promotionId: string }
  price?: number
}

export interface RawScapiTaxItem {
  id: string
  rate?: number
  taxableAmount?: number
  taxAmount?: number
}

export interface RawScapiProductItem {
  itemId: string
  productId?: string | null
  productName?: string
  quantity: number
  price?: number
  basePrice?: number
  priceAfterItemDiscount?: number
  itemText?: string
  sku?: string | null
  tax?: number
  taxRate?: number
  shipmentId?: string
  [key: string]: unknown
}

export interface RawScapiShipment {
  shipmentId?: string
  shippingAddress?: RawScapiOrderAddress | null
  shippingStatus?: string
  trackingNumber?: string | null
  shippingMethod?: { id?: string; name?: string }
}

export interface RawScapiOrder {
  orderNo: string
  customerName?: string | null
  customerInfo?: {
    customerId?: string | null
    email?: string | null
    customerNo?: string | null
  } | null
  currency?: string
  orderTotal?: number | null
  productSubTotal?: number | null
  taxTotal?: number | null
  shippingTotal?: number | null
  orderPriceAdjustmentsTotal?: number | null
  status?: string | null
  confirmationStatus?: string | null
  exportStatus?: string | null
  paymentStatus?: string | null
  shipments?: RawScapiShipment[]
  productItems?: RawScapiProductItem[]
  billingAddress?: RawScapiOrderAddress | null
  couponItems?: Array<{ code?: string }>
  createdAt?: string
  lastModified?: string
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toMinor(v: number | null | undefined, currency: string): number {
  if (v == null) return 0
  return majorToMinor(v, currency)
}

function mapAddress(raw: RawScapiOrderAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.address1 ?? undefined
  const city = raw.city ?? undefined
  const country = raw.countryCode ?? undefined
  const postalCode = raw.postalCode ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return {
    line1,
    line2: raw.address2 ?? undefined,
    city,
    region: raw.stateCode ?? undefined,
    postalCode,
    country,
  }
}

// SCAPI `status` encodes a coarse order state.  Map to the closest canonical
// `financialStatus`.  SCAPI also has `paymentStatus` for more detail.
const PAYMENT_STATUS_MAP: Record<string, OrderFinancialStatus> = {
  not_paid: 'PENDING',
  part_paid: 'PARTIALLY_PAID',
  paid: 'PAID',
}

const ORDER_STATUS_MAP: Record<string, OrderFinancialStatus> = {
  created: 'PENDING',
  new: 'PENDING',
  open: 'AUTHORIZED',
  completed: 'PAID',
  cancelled: 'VOIDED',
  failed: 'VOIDED',
}

const FULFILLMENT_STATUS_MAP: Record<string, OrderFulfillmentStatus> = {
  not_shipped: 'UNFULFILLED',
  part_shipped: 'PARTIAL',
  shipped: 'FULFILLED',
  cancelled: 'RESTOCKED',
}

// Derive fulfillment status from first shipment's `shippingStatus`.
function mapFulfillmentStatus(
  shipments: RawScapiShipment[] | undefined,
): OrderFulfillmentStatus | undefined {
  const first = shipments?.[0]
  if (!first?.shippingStatus) return undefined
  return FULFILLMENT_STATUS_MAP[first.shippingStatus.toLowerCase()] ?? undefined
}

function mapLineItem(raw: RawScapiProductItem, currency: string): LineItem {
  return {
    id: raw.itemId,
    productId: raw.productId ?? undefined,
    title: raw.productName ?? raw.itemText ?? raw.itemId,
    quantity: raw.quantity,
    price: { amount: toMinor(raw.price ?? raw.basePrice, currency), currency },
    sku: raw.sku ?? undefined,
    taxLines:
      raw.taxRate != null
        ? [
            {
              title: 'Tax',
              rate: raw.taxRate,
              amount: { amount: toMinor(raw.tax, currency), currency },
            },
          ]
        : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformOrder(raw: RawScapiOrder): Order {
  const currency = raw.currency ?? 'USD'
  const money = (v: number | null | undefined) =>
    v != null ? { amount: toMinor(v, currency), currency } : undefined

  const shippingAddr = mapAddress(raw.shipments?.[0]?.shippingAddress)

  const financialStatus: OrderFinancialStatus | undefined =
    (raw.paymentStatus ? PAYMENT_STATUS_MAP[raw.paymentStatus.toLowerCase()] : undefined) ??
    (raw.status ? ORDER_STATUS_MAP[raw.status.toLowerCase()] : undefined)

  return {
    id: raw.orderNo,
    orderNumber: raw.orderNo,
    name: raw.orderNo,
    customerId: raw.customerInfo?.customerId ?? undefined,
    email: raw.customerInfo?.email ?? undefined,
    currency,
    subtotalPrice: money(raw.productSubTotal),
    totalTax: money(raw.taxTotal),
    totalDiscounts: money(raw.orderPriceAdjustmentsTotal),
    totalShipping: money(raw.shippingTotal),
    totalPrice: money(raw.orderTotal),
    financialStatus,
    fulfillmentStatus: mapFulfillmentStatus(raw.shipments),
    lineItems: (raw.productItems ?? []).map((li) => mapLineItem(li, currency)),
    billingAddress: mapAddress(raw.billingAddress),
    shippingAddress: shippingAddr,
    fulfillmentIds: raw.shipments
      ?.map((s) => s.shipmentId)
      .filter((id): id is string => Boolean(id)),
    discountCodes: raw.couponItems
      ?.map((c) => c.code)
      .filter((c): c is string => Boolean(c)),
    createdAt: toIsoDatetime(raw.createdAt),
    updatedAt: toIsoDatetime(raw.lastModified),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Order → SCAPI order/basket body for create. */
export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  return {
    currency: order.currency,
    customerInfo: {
      email: order.email,
    },
    productItems: order.lineItems?.map((li) => ({
      productId: li.productId,
      quantity: li.quantity,
      price: li.price?.amount != null ? li.price.amount / 100 : undefined,
    })),
    billingAddress: order.billingAddress
      ? {
          address1: order.billingAddress.line1,
          address2: order.billingAddress.line2,
          city: order.billingAddress.city,
          stateCode: order.billingAddress.region,
          postalCode: order.billingAddress.postalCode,
          countryCode: order.billingAddress.country,
        }
      : undefined,
  }
}
