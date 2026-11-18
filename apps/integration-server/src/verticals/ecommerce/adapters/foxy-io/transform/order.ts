/**
 * Foxy.io Transaction → canonical Order.
 *
 * In Foxy, what other platforms call "orders" are called "transactions".
 * The transaction object holds totals, customer info, and embeds items,
 * shipments, payments, and applied_taxes via the `zoom` parameter.
 *
 * Financial status is mapped from Foxy's `status` field:
 *   approved → PAID, authorized → AUTHORIZED, declined → VOIDED,
 *   pending → PENDING, rejected → VOIDED
 *
 * Docs: https://api.foxycart.com/rels/transaction
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
} from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawFoxyItem {
  id: number | string
  name: string
  price?: number | string
  quantity?: number
  code?: string | null
  product_id?: number | string | null
  [key: string]: unknown
}

export interface RawFoxyShipment {
  id?: number | string
  address1?: string | null
  address2?: string | null
  city?: string | null
  region?: string | null
  postal_code?: string | null
  country?: string | null
  [key: string]: unknown
}

export interface RawFoxyTransaction {
  id: number | string
  display_id?: number | string | null
  /** Customer ID from the embedded customer object. */
  customer_id?: number | string | null
  customer_email?: string | null
  customer_first_name?: string | null
  customer_last_name?: string | null
  currency_code?: string
  total_item_price?: number | string
  total_tax?: number | string
  total_shipping?: number | string
  total_order?: number | string
  /** Foxy status: approved | authorized | declined | pending | rejected */
  status?: string | null
  transaction_date?: string | null
  date_created?: string | null
  date_modified?: string | null
  _embedded?: {
    'fx:items'?: RawFoxyItem[]
    'fx:shipments'?: RawFoxyShipment[]
    'fx:payments'?: Array<{ id: number | string }>
    [key: string]: unknown
  }
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

function money(v: string | number | null | undefined, currency: string) {
  return { amount: toMinor(v, currency), currency }
}

const STATUS_MAP: Record<string, OrderFinancialStatus> = {
  approved: 'PAID',
  authorized: 'AUTHORIZED',
  declined: 'VOIDED',
  pending: 'PENDING',
  rejected: 'VOIDED',
}

function mapShipmentAddress(s: RawFoxyShipment): Address | undefined {
  const line1 = s.address1 ?? undefined
  const city = s.city ?? undefined
  const country = s.country ?? undefined
  const postalCode = s.postal_code ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return {
    line1,
    line2: s.address2 ?? undefined,
    city,
    region: s.region ?? undefined,
    postalCode,
    country,
  }
}

function mapItem(raw: RawFoxyItem, currency: string): LineItem {
  return {
    id: String(raw.id),
    productId: raw.product_id != null ? String(raw.product_id) : undefined,
    title: raw.name,
    quantity: typeof raw.quantity === 'number' ? raw.quantity : 1,
    price: money(raw.price, currency),
    sku: raw.code ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformOrder(raw: RawFoxyTransaction): Order {
  const currency = raw.currency_code ?? 'USD'
  const shipments: RawFoxyShipment[] = raw._embedded?.['fx:shipments'] ?? []
  const items: RawFoxyItem[] = raw._embedded?.['fx:items'] ?? []
  const payments = raw._embedded?.['fx:payments'] ?? []

  // Use the first shipment's address as shippingAddress.
  const firstShipment = shipments[0]

  return {
    id: String(raw.id),
    orderNumber: raw.display_id != null ? String(raw.display_id) : undefined,
    name: raw.display_id != null ? `#${raw.display_id}` : `#${raw.id}`,
    customerId: raw.customer_id != null ? String(raw.customer_id) : undefined,
    email: raw.customer_email ?? undefined,
    currency,
    subtotalPrice: raw.total_item_price != null ? money(raw.total_item_price, currency) : undefined,
    totalTax: raw.total_tax != null ? money(raw.total_tax, currency) : undefined,
    totalShipping: raw.total_shipping != null ? money(raw.total_shipping, currency) : undefined,
    totalPrice: raw.total_order != null ? money(raw.total_order, currency) : undefined,
    financialStatus: raw.status ? STATUS_MAP[raw.status.toLowerCase()] ?? undefined : undefined,
    lineItems: items.length > 0 ? items.map((item) => mapItem(item, currency)) : undefined,
    shippingAddress: firstShipment ? mapShipmentAddress(firstShipment) : undefined,
    transactionIds: payments.map((p) => String(p.id)),
    processedAt: raw.transaction_date ?? undefined,
    createdAt: raw.date_created ?? undefined,
    updatedAt: raw.date_modified ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
