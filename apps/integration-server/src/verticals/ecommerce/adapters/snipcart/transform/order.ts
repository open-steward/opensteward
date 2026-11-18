/**
 * Snipcart Order → canonical Order.
 *
 * Snipcart orders use `token` (a GUID) as the primary identifier. Financial
 * status is derived from `paymentMethod` + `status` fields. The order
 * summary includes `subtotal`, `taxesTotal`, `shippingFees`, and `total` as
 * major-unit decimal numbers.
 *
 * Items in a Snipcart order are called `items` (not `line_items`).
 *
 * Docs: https://docs.snipcart.com/v3/api-reference/orders
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw Snipcart shapes ───────────────────────────────────────────────────────

export interface RawSnipcartItemTax {
  taxName?: string
  taxRate?: number
  amount?: number
}

export interface RawSnipcartOrderItem {
  /** Unique per-cart item id. */
  uniqueId?: string
  /** The product `id` defined in the HTML data attributes. */
  id?: string
  name?: string
  price?: number
  quantity?: number
  totalPrice?: number
  sku?: string | null
  url?: string | null
  taxes?: RawSnipcartItemTax[]
  customFields?: Array<{ name?: string; value?: string }>
  [key: string]: unknown
}

export interface RawSnipcartAddress {
  fullName?: string | null
  name?: string | null
  firstName?: string | null
  address1?: string | null
  address2?: string | null
  city?: string | null
  country?: string | null
  province?: string | null
  postalCode?: string | null
  phone?: string | null
}

export interface RawSnipcartOrderDiscount {
  code?: string
}

export interface RawSnipcartOrderRefund {
  id?: string
}

export interface RawSnipcartOrder {
  /** Primary identifier — a GUID. */
  token: string
  invoiceNumber?: string | null
  status?: string | null
  paymentMethod?: string | null
  email?: string | null
  currency?: string | null
  subtotal?: number | null
  taxesTotal?: number | null
  shippingFees?: number | null
  total?: number | null
  discountInducedTaxesVariation?: number | null
  customerId?: string | null
  items?: RawSnipcartOrderItem[]
  billingAddress?: RawSnipcartAddress | null
  shippingAddress?: RawSnipcartAddress | null
  discounts?: RawSnipcartOrderDiscount[]
  refunds?: RawSnipcartOrderRefund[]
  notes?: string | null
  creationDate?: string | null
  modificationDate?: string | null
  completionDate?: string | null
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toMoney(
  v: number | null | undefined,
  currency: string,
): { amount: number; currency: string } | undefined {
  if (v == null) return undefined
  return { amount: majorToMinor(v, currency), currency }
}

function mapAddress(raw: RawSnipcartAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.address1 ?? undefined
  const city = raw.city ?? undefined
  const country = raw.country ?? undefined
  const postalCode = raw.postalCode ?? undefined
  if (!line1 && !city && !country && !postalCode) return undefined
  return {
    line1,
    line2: raw.address2 ?? undefined,
    city,
    region: raw.province ?? undefined,
    postalCode,
    country,
  }
}

/**
 * Snipcart `status` indicates fulfillment state. Map to canonical
 * fulfillment status (financial status is always "paid" for completed orders).
 *
 * Status values: InProgress, Processed, Disputed, Shipped, Delivered, Pending,
 * Cancelled
 */
const FIN_STATUS_MAP: Record<string, OrderFinancialStatus> = {
  InProgress: 'PENDING',
  Pending: 'PENDING',
  Processed: 'PAID',
  Disputed: 'PARTIALLY_REFUNDED',
  Shipped: 'PAID',
  Delivered: 'PAID',
  Cancelled: 'VOIDED',
}

const FUL_STATUS_MAP: Record<string, OrderFulfillmentStatus> = {
  InProgress: 'UNFULFILLED',
  Pending: 'UNFULFILLED',
  Processed: 'UNFULFILLED',
  Shipped: 'FULFILLED',
  Delivered: 'FULFILLED',
  Cancelled: 'RESTOCKED',
  Disputed: 'PARTIAL',
}

function mapLineItem(raw: RawSnipcartOrderItem, currency: string): LineItem {
  const price = raw.price != null ? majorToMinor(raw.price, currency) : 0
  const taxLines = raw.taxes
    ?.filter((t) => t.amount != null)
    .map((t) => ({
      title: t.taxName ?? 'Tax',
      rate: t.taxRate ?? 0,
      amount: { amount: majorToMinor(t.amount!, currency), currency },
    }))
  return {
    id: raw.uniqueId ?? raw.id ?? '',
    productId: raw.id ?? undefined,
    variantId: undefined,
    title: raw.name ?? '',
    quantity: raw.quantity ?? 1,
    price: { amount: price, currency },
    totalDiscount: undefined,
    taxLines: taxLines && taxLines.length > 0 ? taxLines : undefined,
    sku: raw.sku ?? undefined,
    fulfillableQuantity: undefined,
    fulfillmentStatus: undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformOrder(raw: RawSnipcartOrder): Order {
  const currency = (raw.currency ?? 'USD').toUpperCase()
  const status = raw.status ?? undefined

  return {
    id: raw.token,
    orderNumber: raw.invoiceNumber ?? undefined,
    name: raw.invoiceNumber ?? undefined,
    customerId: raw.customerId ?? undefined,
    email: raw.email ?? undefined,
    phone: undefined,
    currency,
    subtotalPrice: toMoney(raw.subtotal, currency),
    totalTax: toMoney(raw.taxesTotal, currency),
    totalDiscounts: undefined,
    totalShipping: toMoney(raw.shippingFees, currency),
    totalPrice: toMoney(raw.total, currency),
    financialStatus: status ? (FIN_STATUS_MAP[status] ?? undefined) : undefined,
    fulfillmentStatus: status ? (FUL_STATUS_MAP[status] ?? undefined) : undefined,
    lineItems: (raw.items ?? []).map((li) => mapLineItem(li, currency)),
    billingAddress: mapAddress(raw.billingAddress),
    shippingAddress: mapAddress(raw.shippingAddress),
    fulfillmentIds: undefined,
    refundIds: raw.refunds?.map((r) => r.id).filter((id): id is string => !!id),
    transactionIds: undefined,
    discountCodes: raw.discounts?.map((d) => d.code).filter((c): c is string => !!c),
    tags: undefined,
    note: raw.notes ?? undefined,
    createdAt: raw.creationDate ?? undefined,
    updatedAt: raw.modificationDate ?? undefined,
    processedAt: raw.completionDate ?? undefined,
    cancelledAt: undefined,
    cancelReason: undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Order → Snipcart order body (for update). */
export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  return {
    email: order.email,
    notes: order.note,
    status: order.fulfillmentStatus === 'FULFILLED' ? 'Shipped' : undefined,
  }
}
