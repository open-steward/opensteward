/**
 * Bagy Order → canonical Order.
 *
 * Key Bagy order fields:
 *  - `id`, `number` — order identifiers
 *  - `Customer` — embedded customer object with id/name/email
 *  - `status` — string: "novo", "aprovado", "em_andamento", "enviado", "entregue", "cancelado"
 *  - `payment_method_id` / `payment_method` — payment info
 *  - `value`, `value_1`, `shipping` — totals (major-unit BRL decimals)
 *  - `OrderProduct[]` — line items with product_id, variant_id, quantity, price
 *  - `BillingAddress`, `ShippingAddress` — address objects
 *  - `modified`, `date` — timestamps
 *
 * Bagy does not use Shopify-style `financial_status`/`fulfillment_status`
 * enums. We derive canonical values from the `status` field.
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { majorToMinor, minorToMajor } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw Bagy shapes ──────────────────────────────────────────────────────────

export interface RawBagyAddress {
  address?: string | null
  complement?: string | null
  quarter?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  country?: string | null
  [key: string]: unknown
}

export interface RawBagyOrderProduct {
  id: number | string
  product_id?: number | string | null
  variant_id?: number | string | null
  name?: string | null
  quantity?: number | string
  price?: string | number | null
  original_price?: string | number | null
  sku?: string | null
  reference?: string | null
  [key: string]: unknown
}

export interface RawBagyOrder {
  id: number | string
  number?: number | string | null
  Customer?: {
    id?: number | string
    name?: string | null
    email?: string | null
    phone?: string | null
    cellphone?: string | null
  } | null
  status?: string | null
  payment_method_id?: number | string | null
  payment_method?: string | null
  value?: string | number | null     // grand total
  value_1?: string | number | null   // subtotal (before shipping/discounts)
  shipping?: string | number | null  // shipping cost
  discount?: string | number | null  // discount amount
  taxes?: string | number | null     // tax amount
  note?: string | null
  date?: string | null               // created_at
  modified?: string | null           // updated_at
  OrderProduct?: RawBagyOrderProduct[]
  BillingAddress?: RawBagyAddress | null
  ShippingAddress?: RawBagyAddress | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const CURRENCY = 'BRL'

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function toMoney(v: string | number | null | undefined): { amount: number; currency: string } {
  return { amount: majorToMinor(toNum(v), CURRENCY), currency: CURRENCY }
}

function mapAddress(raw: RawBagyAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.address ?? undefined
  const line2 = raw.complement ?? raw.quarter ?? undefined
  const city = raw.city ?? undefined
  const region = raw.state ?? undefined
  const postalCode = raw.zip ?? undefined
  const country = raw.country ?? 'BR'
  if (!line1 && !city && !postalCode) return undefined
  return { line1, line2, city, region, postalCode, country }
}

/**
 * Map Bagy's `status` string to canonical financial/fulfillment status pair.
 *
 * Bagy order statuses (approximate):
 *  - novo / pendente      → PENDING / UNFULFILLED
 *  - aprovado             → PAID / UNFULFILLED
 *  - em_andamento         → PAID / PARTIAL
 *  - enviado / shipped    → PAID / FULFILLED (in transit)
 *  - entregue / delivered → PAID / FULFILLED
 *  - cancelado            → VOIDED / UNFULFILLED
 */
function mapStatus(status: string | null | undefined): {
  financialStatus: OrderFinancialStatus | undefined
  fulfillmentStatus: OrderFulfillmentStatus | undefined
} {
  if (!status) return { financialStatus: undefined, fulfillmentStatus: undefined }
  const s = status.toLowerCase().replace(/-/g, '_')
  switch (s) {
    case 'novo':
    case 'pendente':
    case 'aguardando_pagamento':
      return { financialStatus: 'PENDING', fulfillmentStatus: 'UNFULFILLED' }
    case 'aprovado':
    case 'pago':
      return { financialStatus: 'PAID', fulfillmentStatus: 'UNFULFILLED' }
    case 'em_andamento':
    case 'em_separacao':
      return { financialStatus: 'PAID', fulfillmentStatus: 'PARTIAL' }
    case 'enviado':
    case 'em_transito':
      return { financialStatus: 'PAID', fulfillmentStatus: 'FULFILLED' }
    case 'entregue':
    case 'concluido':
      return { financialStatus: 'PAID', fulfillmentStatus: 'FULFILLED' }
    case 'cancelado':
    case 'cancelado_pelo_cliente':
      return { financialStatus: 'VOIDED', fulfillmentStatus: 'UNFULFILLED' }
    case 'estornado':
    case 'reembolsado':
      return { financialStatus: 'REFUNDED', fulfillmentStatus: 'RESTOCKED' }
    default:
      return { financialStatus: undefined, fulfillmentStatus: undefined }
  }
}

function mapLineItem(raw: RawBagyOrderProduct): LineItem {
  return {
    id: String(raw.id),
    productId: raw.product_id != null ? String(raw.product_id) : undefined,
    variantId: raw.variant_id != null ? String(raw.variant_id) : undefined,
    title: raw.name ?? '',
    quantity: Number(raw.quantity ?? 1),
    price: toMoney(raw.price),
    sku: raw.reference ?? raw.sku ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// ── Transforms ───────────────────────────────────────────────────────────────

export function transformOrder(raw: RawBagyOrder): Order {
  const { financialStatus, fulfillmentStatus } = mapStatus(raw.status)

  const lineItems = (raw.OrderProduct ?? []).map(mapLineItem)

  return {
    id: String(raw.id),
    orderNumber: raw.number != null ? String(raw.number) : undefined,
    name: raw.number != null ? `#${raw.number}` : undefined,
    customerId: raw.Customer?.id != null ? String(raw.Customer.id) : undefined,
    email: raw.Customer?.email ?? undefined,
    phone: raw.Customer?.cellphone ?? raw.Customer?.phone ?? undefined,
    currency: CURRENCY,
    subtotalPrice: raw.value_1 != null ? toMoney(raw.value_1) : undefined,
    totalTax: raw.taxes != null ? toMoney(raw.taxes) : undefined,
    totalDiscounts: raw.discount != null ? toMoney(raw.discount) : undefined,
    totalShipping: raw.shipping != null ? toMoney(raw.shipping) : undefined,
    totalPrice: raw.value != null ? toMoney(raw.value) : undefined,
    financialStatus,
    fulfillmentStatus,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    billingAddress: mapAddress(raw.BillingAddress),
    shippingAddress: mapAddress(raw.ShippingAddress),
    note: raw.note ?? undefined,
    createdAt: toIsoDatetime(raw.date),
    updatedAt: toIsoDatetime(raw.modified),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Order → Bagy order body (for create/update). */
export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  return {
    note: order.note,
    OrderProduct: order.lineItems?.map((li) => {
      const priceMajor = minorToMajor(li.price?.amount, li.price?.currency ?? CURRENCY)
      return {
        product_id: li.productId,
        variant_id: li.variantId,
        name: li.title,
        quantity: li.quantity,
        price: priceMajor != null ? priceMajor.toFixed(2) : undefined,
        reference: li.sku,
      }
    }),
  }
}
