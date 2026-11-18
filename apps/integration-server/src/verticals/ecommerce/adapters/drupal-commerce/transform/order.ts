/**
 * Drupal Commerce Order → canonical Order.
 *
 * `commerce_order--default` JSON:API attributes:
 *   - `order_number`              — human-readable order number
 *   - `state`                     — draft | fulfillment | completed | canceled
 *   - `total_price.number`        — string decimal total
 *   - `total_price.currency_code` — ISO 4217 currency
 *   - `total_paid.number`         — amount paid
 *   - `billing_profile`           — relationship to commerce_profile
 *   - `order_items`               — relationship to commerce_order_item
 *   - `placed`                    — Unix timestamp when placed
 *   - `completed`                 — Unix timestamp when completed
 *   - `changed`                   — Unix timestamp of last change
 *
 * `commerce_order_item--default` attributes:
 *   - `title`                     — line item display title
 *   - `quantity`                  — decimal string
 *   - `unit_price.number`         — unit price string
 *   - `unit_price.currency_code`
 *   - `total_price.number`
 *   - `purchased_entity`          — relationship to variation
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'
import type { JsonApiResource } from '../client'

// ── Raw Drupal shapes ─────────────────────────────────────────────────────────

export interface DrupalPrice {
  number?: string
  currency_code?: string
}

export interface DrupalOrderAttributes {
  order_number?: string | number
  state?: string
  total_price?: DrupalPrice | null
  total_paid?: DrupalPrice | null
  mail?: string | null
  placed?: number | string | null
  completed?: number | string | null
  changed?: number | string | null
  ip_address?: string | null
  [key: string]: unknown
}

export interface DrupalOrderItemAttributes {
  title?: string
  quantity?: string | number
  unit_price?: DrupalPrice | null
  total_price?: DrupalPrice | null
  overridden_unit_price?: boolean
  uses_legacy_adjustments?: boolean
  [key: string]: unknown
}

export type DrupalOrder = JsonApiResource & {
  attributes: DrupalOrderAttributes
}

export type DrupalOrderItem = JsonApiResource & {
  attributes: DrupalOrderItemAttributes
}

export interface DrupalProfileAddress {
  address_line1?: string
  address_line2?: string
  locality?: string
  administrative_area?: string
  postal_code?: string
  country_code?: string
  given_name?: string
  family_name?: string
  organization?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function unixToIso(ts: number | string | null | undefined): string | undefined {
  if (ts == null) return undefined
  const n = typeof ts === 'string' ? parseInt(ts, 10) : ts
  if (!Number.isFinite(n) || n <= 0) return undefined
  return new Date(n * 1000).toISOString()
}

function parsePrice(
  priceField: DrupalPrice | null | undefined,
): { amount: number; currency: string } | undefined {
  if (!priceField) return undefined
  const major = parseFloat(priceField.number ?? '0') || 0
  const currency = priceField.currency_code ?? 'USD'
  return { amount: majorToMinor(major, currency), currency }
}

function mapFinancialStatus(state: string | undefined): OrderFinancialStatus | undefined {
  if (!state) return undefined
  switch (state) {
    case 'draft':
      return 'PENDING'
    case 'fulfillment':
      return 'PAID'
    case 'completed':
      return 'PAID'
    case 'canceled':
      return 'VOIDED'
    default:
      return 'PENDING'
  }
}

function mapFulfillmentStatus(state: string | undefined): OrderFulfillmentStatus | undefined {
  if (!state) return undefined
  switch (state) {
    case 'draft':
      return 'UNFULFILLED'
    case 'fulfillment':
      return 'PARTIAL'
    case 'completed':
      return 'FULFILLED'
    case 'canceled':
      return 'UNFULFILLED'
    default:
      return 'UNFULFILLED'
  }
}

function mapAddress(addr: DrupalProfileAddress | null | undefined): Address | undefined {
  if (!addr) return undefined
  const line1 = addr.address_line1
  const line2 = addr.address_line2
  const city = addr.locality
  const region = addr.administrative_area
  const postalCode = addr.postal_code
  const country = addr.country_code
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

function relationshipIds(resource: JsonApiResource, field: string): string[] {
  const rel = resource.relationships?.[field]
  if (!rel) return []
  if (Array.isArray(rel.data)) return rel.data.map((d) => d.id)
  if (rel.data && !Array.isArray(rel.data)) return [rel.data.id]
  return []
}

function relationshipId(resource: JsonApiResource, field: string): string | undefined {
  const rel = resource.relationships?.[field]
  if (!rel || !rel.data || Array.isArray(rel.data)) return undefined
  return rel.data.id
}

function mapLineItem(raw: DrupalOrderItem, fallbackCurrency: string): LineItem {
  const attrs = raw.attributes
  const unitPrice = parsePrice(attrs.unit_price) ?? { amount: 0, currency: fallbackCurrency }
  const qty = typeof attrs.quantity === 'string' ? parseFloat(attrs.quantity) : (attrs.quantity ?? 1)
  return {
    id: raw.id,
    variantId: relationshipId(raw, 'purchased_entity'),
    title: attrs.title ?? '',
    quantity: Math.round(qty),
    price: unitPrice,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformOrder(
  raw: DrupalOrder,
  includedItems?: DrupalOrderItem[],
  billingAddress?: DrupalProfileAddress | null,
): Order {
  const attrs = raw.attributes
  const currency = attrs.total_price?.currency_code ?? 'USD'
  const totalPrice = parsePrice(attrs.total_price)
  const orderNumber = attrs.order_number != null ? String(attrs.order_number) : undefined

  const lineItems = includedItems?.map((item) => mapLineItem(item, currency))
  const orderItemIds = relationshipIds(raw, 'order_items')

  return {
    id: raw.id,
    orderNumber,
    name: orderNumber ? `#${orderNumber}` : undefined,
    customerId: relationshipId(raw, 'uid'),
    email: attrs.mail ?? undefined,
    currency,
    totalPrice,
    financialStatus: mapFinancialStatus(attrs.state),
    fulfillmentStatus: mapFulfillmentStatus(attrs.state),
    lineItems: lineItems && lineItems.length > 0 ? lineItems : undefined,
    fulfillmentIds: orderItemIds.length > 0 ? undefined : undefined,
    billingAddress: billingAddress ? mapAddress(billingAddress) : undefined,
    createdAt: undefined,
    updatedAt: unixToIso(attrs.changed),
    processedAt: unixToIso(attrs.placed),
    cancelledAt: attrs.state === 'canceled' ? unixToIso(attrs.changed) : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  return {
    data: {
      type: 'commerce_order--default',
      attributes: {
        ...(order.email != null ? { mail: order.email } : {}),
      },
    },
  }
}
