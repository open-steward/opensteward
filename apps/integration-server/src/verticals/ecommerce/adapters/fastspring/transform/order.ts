/**
 * FastSpring Order → canonical Order.
 *
 * Docs:
 *  - https://developer.fastspring.com/reference/retrieve-an-order
 *  - https://developer.fastspring.com/reference/update-order-tags-and-attributes
 *
 * FastSpring is merchant-of-record: it has no fulfillment concept (digital
 * goods / SaaS only), so `fulfillmentStatus` is always left undefined —
 * there is nothing upstream to report. There is also no order-cancel
 * endpoint; a cancelled purchase is represented as a return (see
 * `transform/refund.ts`), never as a state on the order itself, so
 * `cancelledAt` / `cancelReason` are always left undefined too.
 *
 * The only documented creation timestamp on an order is `changed` (the
 * last-modified epoch-ms instant); there is no separate "created" field, so
 * `createdAt` is left undefined rather than reusing `changed` under a name
 * that would misrepresent it.
 */

import { toIsoDatetime, isIso3166Alpha2 } from '@opensteward/shared'
import type { Order, LineItem } from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

/** Guard against an unassigned/garbage country reaching the strict `Iso3166Alpha2` field. */
function normalizeCountry(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const upper = raw.toUpperCase()
  return isIso3166Alpha2(upper) ? upper : undefined
}

export interface RawFastSpringOrderItem {
  product: string
  quantity: number
  display?: string
  sku?: string | null
  /** Always shown in the documented order-item example — required so a missing value fails loudly instead of pricing at 0. */
  subtotal: number
  discount?: number
  isAddon?: boolean
}

export interface RawFastSpringOrderAddress {
  city?: string
  region?: string
  regionDisplay?: string
  postalCode?: string
  country?: string
}

export interface RawFastSpringOrderCustomer {
  first?: string
  last?: string
  email?: string
  phone?: string
}

export interface RawFastSpringOrder {
  order: string
  id?: string
  reference?: string
  completed?: boolean
  changed?: number
  live?: boolean
  /** Always shown in the documented retrieve-an-order example — required so a missing value fails loudly instead of defaulting to a currency the order was never actually in. */
  currency: string
  account?: string
  total?: number
  tax?: number
  subtotal?: number
  discount?: number
  customer?: RawFastSpringOrderCustomer
  address?: RawFastSpringOrderAddress
  items?: RawFastSpringOrderItem[]
  tags?: Record<string, string>
  notes?: string[]
  [key: string]: unknown
}

function mapAddress(raw: RawFastSpringOrderAddress | undefined): Address | undefined {
  if (!raw) return undefined
  const region = raw.regionDisplay ?? raw.region
  const country = normalizeCountry(raw.country)
  if (!raw.city && !region && !raw.postalCode && !country) return undefined
  return { city: raw.city, region, postalCode: raw.postalCode, country }
}

function mapLineItem(raw: RawFastSpringOrderItem, index: number, currency: string): LineItem {
  if (raw.subtotal == null) {
    throw new Error(
      `FastSpring order item for product "${raw.product}" is missing "subtotal" — cannot compute a unit price.`,
    )
  }
  const unitMajor = raw.quantity > 0 ? raw.subtotal / raw.quantity : raw.subtotal
  return {
    id: `${raw.product}:${index}`,
    productId: raw.product,
    title: raw.display ?? raw.product,
    quantity: raw.quantity,
    price: { amount: majorToMinor(unitMajor, currency), currency },
    totalDiscount:
      raw.discount != null ? { amount: majorToMinor(raw.discount, currency), currency } : undefined,
    sku: raw.sku ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformOrder(raw: RawFastSpringOrder): Order {
  if (!raw.currency) {
    throw new Error(`FastSpring order "${raw.order}" is missing "currency" — cannot compute money fields.`)
  }
  const currency = raw.currency
  const address = mapAddress(raw.address)

  return {
    id: raw.order,
    orderNumber: raw.reference,
    name: raw.reference,
    customerId: raw.account,
    email: raw.customer?.email,
    phone: raw.customer?.phone,
    currency,
    subtotalPrice: raw.subtotal != null ? { amount: majorToMinor(raw.subtotal, currency), currency } : undefined,
    totalTax: raw.tax != null ? { amount: majorToMinor(raw.tax, currency), currency } : undefined,
    totalDiscounts:
      raw.discount != null ? { amount: majorToMinor(raw.discount, currency), currency } : undefined,
    totalPrice: raw.total != null ? { amount: majorToMinor(raw.total, currency), currency } : undefined,
    financialStatus: raw.completed === true ? 'PAID' : raw.completed === false ? 'PENDING' : undefined,
    lineItems: (raw.items ?? []).map((item, i) => mapLineItem(item, i, currency)),
    billingAddress: address,
    shippingAddress: address,
    note: raw.notes && raw.notes.length > 0 ? raw.notes.join('\n') : undefined,
    updatedAt: toIsoDatetime(raw.changed),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Canonical Order → FastSpring tags/attributes update body (one entry of
 * `orders[]` for `POST /orders`). This is the ONLY documented order
 * mutation — order creation happens through checkout, not the API, and
 * there is no cancel endpoint (see file header).
 *
 * FastSpring tags are a flat key→value map; canonical `Order.tags` is a
 * flat string array, so a `"key:value"` entry round-trips as a map entry
 * and any other string is stored under a synthetic `tagN` key.
 */
export function untransformOrderTags(order: Partial<Order>): Record<string, unknown> {
  const tags: Record<string, string> = {}
  ;(order.tags ?? []).forEach((t, i) => {
    const idx = t.indexOf(':')
    if (idx > 0) tags[t.slice(0, idx)] = t.slice(idx + 1)
    else tags[`tag${i + 1}`] = t
  })
  return { tags }
}
