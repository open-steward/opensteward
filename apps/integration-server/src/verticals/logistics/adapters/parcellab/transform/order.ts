import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'
import { toISODate, parseDecimal } from '../../shared/transform'

// ── Raw parcelLab order types ────────────────────────────────────────────────

export interface ParcellabLineItem {
  line_item_id?: string | null
  product_id?: string | null
  sku?: string | null
  article_name?: string | null
  quantity?: number | null
  unit_price?: number | null
  amount_invoiced?: number | null
  weight?: number | null
  weight_unit?: string | null
  status?: string | null
  [key: string]: unknown
}

export interface ParcellabOrder {
  /** parcelLab internal UUID for the order */
  external_id?: string | null
  /** Merchant's own order reference */
  order_number?: string | null
  /** Recipient email */
  recipient_email?: string | null
  /** Recipient name */
  recipient_name?: string | null
  /** ISO 3166-1 alpha-3 destination country */
  destination_country_iso3?: string | null
  /** Recipient postal code */
  recipient_postal_code?: string | null
  /** High-level order lifecycle status */
  order_status?: string | null
  /** 3-letter ISO 4217 currency */
  order_currency?: string | null
  /** Total order amount */
  order_total_amount?: number | null
  /** Tax amount */
  order_tax_amount?: number | null
  /** Discount amount */
  order_discount_amount?: number | null
  /** Date the order was placed */
  order_date?: string | null
  /** Shipping address */
  shipping_address?: Record<string, unknown> | null
  /** Line items */
  articles_order?: ParcellabLineItem[]
  /** Tags */
  tags?: string[]
  /** Tracking references (tracking_number + courier pairs) */
  trackings?: Array<{ tracking_number?: string; courier?: string; [key: string]: unknown }>
  /** ISO-8601 creation timestamp */
  created_at?: string | null
  /** ISO-8601 last-modified timestamp */
  updated_at?: string | null
  [key: string]: unknown
}

// ── Status mapping ────────────────────────────────────────────────────────────

function mapOrderStatus(raw: string | null | undefined): OrderStatus {
  if (!raw) return 'UNKNOWN'
  const s = raw.toLowerCase()
  if (s === 'pending') return 'PENDING'
  if (s === 'processing') return 'PROCESSING'
  if (s === 'on_hold' || s === 'on hold') return 'ON_HOLD'
  if (s === 'awaiting_shipment' || s === 'awaiting shipment') return 'AWAITING_SHIPMENT'
  if (s === 'shipped' || s === 'transit') return 'SHIPPED'
  if (s === 'delivered') return 'DELIVERED'
  if (s === 'cancelled' || s === 'canceled') return 'CANCELLED'
  if (s === 'returned' || s === 'sentback') return 'RETURNED'
  return 'UNKNOWN'
}

// ── Line item transform ───────────────────────────────────────────────────────

function transformLineItem(raw: ParcellabLineItem): Lineitem {
  return {
    id: raw.line_item_id ?? raw.product_id ?? undefined,
    sku: raw.sku ?? undefined,
    name: raw.article_name ?? undefined,
    quantity: raw.quantity ?? undefined,
    unitAmount: parseDecimal(raw.unit_price),
    totalAmount: parseDecimal(raw.amount_invoiced),
  }
}

// ── Order transform ───────────────────────────────────────────────────────────

export function transformOrder(raw: ParcellabOrder): Order {
  const shipmentIds = (raw.trackings ?? [])
    .map((t) => t.tracking_number)
    .filter((t): t is string => Boolean(t))

  const destinationAddress =
    raw.shipping_address
      ? {
          name: raw.recipient_name ?? undefined,
          postalCode: raw.recipient_postal_code ?? undefined,
          country: raw.destination_country_iso3 ?? undefined,
          email: raw.recipient_email ?? undefined,
        }
      : raw.recipient_name || raw.recipient_postal_code || raw.destination_country_iso3
      ? {
          name: raw.recipient_name ?? undefined,
          postalCode: raw.recipient_postal_code ?? undefined,
          country: raw.destination_country_iso3 ?? undefined,
          email: raw.recipient_email ?? undefined,
        }
      : undefined

  const lineItems = (raw.articles_order ?? []).map(transformLineItem)

  return {
    id: raw.external_id ?? undefined,
    orderNumber: raw.order_number ?? undefined,
    status: mapOrderStatus(raw.order_status),
    destinationAddress,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    shipmentIds: shipmentIds.length > 0 ? shipmentIds : undefined,
    currency: raw.order_currency ?? undefined,
    totalAmount: parseDecimal(raw.order_total_amount),
    taxAmount: parseDecimal(raw.order_tax_amount),
    discountAmount: parseDecimal(raw.order_discount_amount),
    orderAt: toISODate(raw.order_date),
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
