/**
 * Skio Order → canonical Order.
 *
 * Skio orders are Shopify orders surfaced via Skio's subscription engine.
 * The REST endpoint returns orders under the `data` array. Each order carries:
 *  - `platformId` — Shopify GID (e.g. `gid://shopify/Order/12345`)
 *  - `platformNumber` — Shopify order number
 *  - `storefrontUserId` / `StorefrontUser` — customer reference
 *  - `OrderLineItems` — nested line items with product/variant platform IDs
 *  - `ShippingLines` — nested shipping line entries
 * Amounts are decimal major-unit strings (Shopify convention); we convert to
 * integer minor units with `majorToMinor`.
 *
 * Docs: https://code.skio.com/rest-api/
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

// ── Raw Skio shapes ──────────────────────────────────────────────────────────

export interface RawSkioOrderAddress {
  address1?: string | null
  address2?: string | null
  city?: string | null
  province?: string | null
  provinceCode?: string | null
  zip?: string | null
  country?: string | null
  countryCode?: string | null
}

export interface RawSkioOrderLineItem {
  id: string
  productPlatformId?: string | null
  productVariantPlatformId?: string | null
  title?: string | null
  quantity?: number | null
  price?: string | number | null
  sku?: string | null
  [key: string]: unknown
}

export interface RawSkioShippingLine {
  id?: string
  price?: string | number | null
  title?: string | null
}

export interface RawSkioOrder {
  id: string
  platformId?: string | null
  platformNumber?: string | number | null
  storefrontUserId?: string | null
  StorefrontUser?: { id?: string; email?: string | null } | null
  currency?: string | null
  totalPrice?: string | number | null
  subtotalPrice?: string | number | null
  totalTax?: string | number | null
  totalDiscounts?: string | number | null
  financialStatus?: string | null
  fulfillmentStatus?: string | null
  OrderLineItems?: RawSkioOrderLineItem[]
  ShippingLines?: RawSkioShippingLine[]
  shippingAddress?: RawSkioOrderAddress | null
  billingAddress?: RawSkioOrderAddress | null
  note?: string | null
  discountCodes?: Array<{ code?: string }>
  createdAt?: string | null
  updatedAt?: string | null
  processedAt?: string | null
  cancelledAt?: string | null
  cancelReason?: string | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function toMinor(v: string | number | null | undefined, currency: string): number {
  return majorToMinor(toNum(v), currency)
}

function mapAddress(raw: RawSkioOrderAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.address1 ?? undefined
  const city = raw.city ?? undefined
  const country = raw.countryCode ?? raw.country ?? undefined
  const postalCode = raw.zip ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return {
    line1,
    line2: raw.address2 ?? undefined,
    city,
    region: raw.province ?? raw.provinceCode ?? undefined,
    postalCode,
    country,
  }
}

const FIN_STATUS_MAP: Record<string, OrderFinancialStatus> = {
  pending: 'PENDING',
  authorized: 'AUTHORIZED',
  partially_paid: 'PARTIALLY_PAID',
  paid: 'PAID',
  partially_refunded: 'PARTIALLY_REFUNDED',
  refunded: 'REFUNDED',
  voided: 'VOIDED',
}

const FUL_STATUS_MAP: Record<string, OrderFulfillmentStatus> = {
  unfulfilled: 'UNFULFILLED',
  partial: 'PARTIAL',
  fulfilled: 'FULFILLED',
  restocked: 'RESTOCKED',
}

function mapLineItem(raw: RawSkioOrderLineItem, currency: string): LineItem {
  return {
    id: String(raw.id),
    productId: raw.productPlatformId ?? undefined,
    variantId: raw.productVariantPlatformId ?? undefined,
    title: raw.title ?? '',
    quantity: raw.quantity ?? 0,
    price: { amount: toMinor(raw.price, currency), currency },
    sku: raw.sku ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformOrder(raw: RawSkioOrder): Order {
  const currency = raw.currency ?? 'USD'
  const money = (v: string | number | null | undefined) => ({
    amount: toMinor(v, currency),
    currency,
  })

  // Sum shipping line prices to derive totalShipping.
  const shippingTotal = (raw.ShippingLines ?? []).reduce(
    (acc, sl) => acc + toNum(sl.price),
    0,
  )

  return {
    id: String(raw.id),
    orderNumber: raw.platformNumber != null ? String(raw.platformNumber) : undefined,
    name: raw.platformNumber != null ? `#${raw.platformNumber}` : undefined,
    customerId: raw.StorefrontUser?.id ?? raw.storefrontUserId ?? undefined,
    email: raw.StorefrontUser?.email ?? undefined,
    currency,
    subtotalPrice: raw.subtotalPrice != null ? money(raw.subtotalPrice) : undefined,
    totalTax: raw.totalTax != null ? money(raw.totalTax) : undefined,
    totalDiscounts: raw.totalDiscounts != null ? money(raw.totalDiscounts) : undefined,
    totalShipping:
      shippingTotal > 0 ? { amount: toMinor(shippingTotal, currency), currency } : undefined,
    totalPrice: raw.totalPrice != null ? money(raw.totalPrice) : undefined,
    financialStatus: raw.financialStatus
      ? FIN_STATUS_MAP[raw.financialStatus.toLowerCase()] ?? undefined
      : undefined,
    fulfillmentStatus: raw.fulfillmentStatus
      ? FUL_STATUS_MAP[raw.fulfillmentStatus.toLowerCase()] ?? undefined
      : undefined,
    lineItems: (raw.OrderLineItems ?? []).map((li) => mapLineItem(li, currency)),
    billingAddress: mapAddress(raw.billingAddress),
    shippingAddress: mapAddress(raw.shippingAddress),
    discountCodes: raw.discountCodes?.map((d) => d.code).filter((c): c is string => !!c),
    note: raw.note ?? undefined,
    createdAt: toIsoDatetime(raw.createdAt),
    updatedAt: toIsoDatetime(raw.updatedAt),
    processedAt: toIsoDatetime(raw.processedAt),
    cancelledAt: toIsoDatetime(raw.cancelledAt),
    cancelReason: raw.cancelReason ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
