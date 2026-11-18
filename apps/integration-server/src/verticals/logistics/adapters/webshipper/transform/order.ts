import type { Order, OrderStatus } from '../../../schema/order'
import { toAddress, toISODate, parseDecimal } from '../../shared/transform'

// ─── Webshipper raw types ────────────────────────────────────────────────────

export interface WebshipperOrderLine {
  id?: string | null
  sku?: string | null
  description?: string | null
  quantity?: number | string | null
  unit_price?: number | string | null
  total_price?: number | string | null
  [key: string]: unknown
}

export interface WebshipperOrderAttributes {
  status?: string | null
  ext_ref?: string | null
  visible_ref?: string | null
  currency?: string | null
  order_lines?: WebshipperOrderLine[] | null
  delivery_address?: Record<string, unknown> | null
  sender_address?: Record<string, unknown> | null
  billing_address?: Record<string, unknown> | null
  total_price?: number | string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

export interface WebshipperOrder {
  id?: string | null
  type?: string
  attributes?: WebshipperOrderAttributes | null
  relationships?: Record<string, unknown> | null
  [key: string]: unknown
}

// ─── Status mapping ──────────────────────────────────────────────────────────

function mapOrderStatus(status: string | null | undefined): OrderStatus {
  if (!status) return 'UNKNOWN'
  const v = status.toLowerCase()
  if (v === 'pending') return 'PENDING'
  if (v === 'on_hold') return 'ON_HOLD'
  if (v === 'dispatched') return 'SHIPPED'
  if (v === 'partly_dispatched') return 'PROCESSING'
  if (v === 'cancelled' || v === 'canceled') return 'CANCELLED'
  if (v === 'error' || v === 'missing_rate') return 'ON_HOLD'
  return 'UNKNOWN'
}

// ─── Transform ───────────────────────────────────────────────────────────────

export function transformOrder(raw: WebshipperOrder): Order {
  const attrs = raw.attributes ?? {}

  const lineItems = (attrs.order_lines ?? []).map((line) => ({
    id: line.id ?? undefined,
    sku: line.sku ?? undefined,
    description: line.description ?? undefined,
    quantity: parseDecimal(line.quantity) ?? undefined,
    unitAmount: parseDecimal(line.unit_price) ?? undefined,
    totalAmount: parseDecimal(line.total_price) ?? undefined,
  }))

  return {
    id: String(raw.id ?? ''),
    status: mapOrderStatus(attrs.status),
    orderNumber: attrs.visible_ref ?? attrs.ext_ref ?? undefined,
    currency: attrs.currency ?? undefined,
    originAddress: toAddress(attrs.sender_address ?? null),
    destinationAddress: toAddress(attrs.delivery_address ?? null),
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    totalAmount: parseDecimal(attrs.total_price) ?? undefined,
    createdAt: toISODate(attrs.created_at),
    updatedAt: toISODate(attrs.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
