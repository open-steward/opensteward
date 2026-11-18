/**
 * WooCommerce Order → canonical Order.
 *
 * WooCommerce has a single `status` field covering both financial and
 * fulfillment state. We split it into the canonical pair per the plan:
 *
 *   pending    → {PENDING,  UNFULFILLED}
 *   processing → {PAID,     UNFULFILLED}
 *   on-hold    → {PENDING,  UNFULFILLED}
 *   completed  → {PAID,     FULFILLED}
 *   cancelled  → {VOIDED,   UNFULFILLED}
 *   refunded   → {REFUNDED, UNFULFILLED}
 *   failed     → {VOIDED,   UNFULFILLED}
 *
 * Line items live under `line_items`, addresses under `billing` /
 * `shipping`, and money fields are string-encoded (e.g. "19.99"). The
 * order currency is carried on the top-level `currency` field.
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import { toIsoDatetime } from '@opensteward/shared'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw WC shapes ───────────────────────────────────────────────────────────

export interface RawWooCommerceOrderAddress {
  first_name?: string | null
  last_name?: string | null
  company?: string | null
  address_1?: string | null
  address_2?: string | null
  city?: string | null
  state?: string | null
  postcode?: string | null
  country?: string | null
  email?: string | null
  phone?: string | null
}

export interface RawWooCommerceTaxLine {
  id?: number | string
  rate_id?: number | string
  rate_code?: string
  label?: string
  compound?: boolean
  tax_total?: string | number
  shipping_tax_total?: string | number
  rate_percent?: number
}

export interface RawWooCommerceLineItem {
  id: number | string
  name: string
  product_id?: number | string
  variation_id?: number | string | 0
  quantity: number
  tax_class?: string
  subtotal?: string | number
  subtotal_tax?: string | number
  total?: string | number
  total_tax?: string | number
  sku?: string | null
  price?: number
  taxes?: Array<{ id: number | string; total: string; subtotal: string }>
  meta_data?: Array<{ key: string; value: unknown }>
}

export interface RawWooCommerceCouponLine {
  id?: number | string
  code: string
}

export interface RawWooCommerceOrder {
  id: number | string
  parent_id?: number | string
  number?: string
  order_key?: string
  status?: string
  currency?: string
  customer_id?: number | string
  customer_note?: string | null
  billing?: RawWooCommerceOrderAddress | null
  shipping?: RawWooCommerceOrderAddress | null
  payment_method?: string
  payment_method_title?: string
  total?: string | number
  subtotal?: string | number
  total_tax?: string | number
  discount_total?: string | number
  shipping_total?: string | number
  shipping_tax?: string | number
  cart_tax?: string | number
  line_items?: RawWooCommerceLineItem[]
  tax_lines?: RawWooCommerceTaxLine[]
  shipping_lines?: Array<{ method_title?: string; total?: string }>
  fee_lines?: unknown[]
  coupon_lines?: RawWooCommerceCouponLine[]
  refunds?: Array<{ id: number | string; reason?: string; total: string }>
  date_created?: string
  date_created_gmt?: string
  date_modified?: string
  date_modified_gmt?: string
  date_paid?: string | null
  date_paid_gmt?: string | null
  date_completed?: string | null
  date_completed_gmt?: string | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toNum(v: string | number | null | undefined): number {
  if (v == null || v === '') return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function mapAddress(raw: RawWooCommerceOrderAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.address_1 ?? undefined
  const line2 = raw.address_2 ?? undefined
  const city = raw.city ?? undefined
  const region = raw.state ?? undefined
  const postalCode = raw.postcode ?? undefined
  const country = raw.country ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

/**
 * WC single `status` → canonical financial+fulfillment pair. See the
 * table in the file header comment for the rationale.
 */
function mapStatuses(status: string | undefined): {
  financialStatus?: OrderFinancialStatus
  fulfillmentStatus?: OrderFulfillmentStatus
} {
  if (!status) return {}
  switch (status) {
    case 'pending':
      return { financialStatus: 'PENDING', fulfillmentStatus: 'UNFULFILLED' }
    case 'processing':
      return { financialStatus: 'PAID', fulfillmentStatus: 'UNFULFILLED' }
    case 'on-hold':
      return { financialStatus: 'PENDING', fulfillmentStatus: 'UNFULFILLED' }
    case 'completed':
      return { financialStatus: 'PAID', fulfillmentStatus: 'FULFILLED' }
    case 'cancelled':
      return { financialStatus: 'VOIDED', fulfillmentStatus: 'UNFULFILLED' }
    case 'refunded':
      return { financialStatus: 'REFUNDED', fulfillmentStatus: 'UNFULFILLED' }
    case 'failed':
      return { financialStatus: 'VOIDED', fulfillmentStatus: 'UNFULFILLED' }
    default:
      return {}
  }
}

function mapLineItem(raw: RawWooCommerceLineItem, currency: string): LineItem {
  // WC returns per-line totals (not per-unit). The canonical `price`
  // field is the unit price, so divide total by quantity where needed.
  const total = toNum(raw.total)
  const qty = raw.quantity > 0 ? raw.quantity : 1
  const unitPriceMajor =
    raw.price != null
      ? Number(raw.price)
      : qty > 0
        ? total / qty
        : total
  const unitPrice = majorToMinor(unitPriceMajor, currency)
  return {
    id: String(raw.id),
    productId: raw.product_id != null ? String(raw.product_id) : undefined,
    variantId:
      raw.variation_id && raw.variation_id !== 0
        ? String(raw.variation_id)
        : undefined,
    title: raw.name,
    quantity: raw.quantity,
    price: { amount: unitPrice, currency },
    totalDiscount:
      raw.subtotal != null && raw.total != null
        ? {
            amount: majorToMinor(
              Math.max(0, toNum(raw.subtotal) - toNum(raw.total)),
              currency,
            ),
            currency,
          }
        : undefined,
    sku: raw.sku ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformOrder(raw: RawWooCommerceOrder): Order {
  const currency = raw.currency ?? 'USD'
  const money = (v: string | number | null | undefined) => ({
    amount: majorToMinor(toNum(v), currency),
    currency,
  })
  const { financialStatus, fulfillmentStatus } = mapStatuses(raw.status)

  return {
    id: String(raw.id),
    orderNumber: raw.number,
    name: raw.number != null ? `#${raw.number}` : undefined,
    customerId:
      raw.customer_id != null && raw.customer_id !== 0
        ? String(raw.customer_id)
        : undefined,
    email: raw.billing?.email ?? undefined,
    phone: raw.billing?.phone ?? undefined,
    currency,
    subtotalPrice: raw.subtotal != null ? money(raw.subtotal) : undefined,
    totalTax: raw.total_tax != null ? money(raw.total_tax) : undefined,
    totalDiscounts: raw.discount_total != null ? money(raw.discount_total) : undefined,
    totalShipping: raw.shipping_total != null ? money(raw.shipping_total) : undefined,
    totalPrice: raw.total != null ? money(raw.total) : undefined,
    financialStatus,
    fulfillmentStatus,
    lineItems: (raw.line_items ?? []).map((li) => mapLineItem(li, currency)),
    billingAddress: mapAddress(raw.billing),
    shippingAddress: mapAddress(raw.shipping),
    refundIds: raw.refunds?.map((r) => String(r.id)),
    discountCodes: raw.coupon_lines?.map((c) => c.code),
    note: raw.customer_note ?? undefined,
    createdAt: raw.date_created_gmt ?? raw.date_created,
    updatedAt: raw.date_modified_gmt ?? raw.date_modified,
    processedAt: toIsoDatetime(raw.date_paid_gmt ?? raw.date_paid),
    cancelledAt:
      raw.status === 'cancelled' ? raw.date_modified_gmt ?? raw.date_modified : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Order → WooCommerce order body (for create/update). */
export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  const billing: Record<string, unknown> | undefined = order.billingAddress
    ? {
        first_name: undefined,
        last_name: undefined,
        address_1: order.billingAddress.line1,
        address_2: order.billingAddress.line2,
        city: order.billingAddress.city,
        state: order.billingAddress.region,
        postcode: order.billingAddress.postalCode,
        country: order.billingAddress.country,
        email: order.email,
        phone: order.phone,
      }
    : undefined

  const shipping: Record<string, unknown> | undefined = order.shippingAddress
    ? {
        address_1: order.shippingAddress.line1,
        address_2: order.shippingAddress.line2,
        city: order.shippingAddress.city,
        state: order.shippingAddress.region,
        postcode: order.shippingAddress.postalCode,
        country: order.shippingAddress.country,
      }
    : undefined

  return {
    currency: order.currency,
    customer_note: order.note,
    customer_id: order.customerId,
    billing,
    shipping,
    line_items: order.lineItems?.map((li) => ({
      product_id: li.productId,
      variation_id: li.variantId,
      quantity: li.quantity,
      name: li.title,
      sku: li.sku,
      total: li.price?.amount != null ? (li.price.amount * li.quantity).toString() : undefined,
    })),
  }
}
