import type { Order, OrderStatus } from '../../../schema/order'
import { toISODate, toAddress } from '../../shared/transform'

export interface ShippoOrderAddress {
  name?: string | null
  company?: string | null
  street1?: string | null
  street2?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  country?: string | null
  phone?: string | null
  email?: string | null
  [key: string]: unknown
}

export interface ShippoOrderLineItem {
  object_id?: string
  title?: string
  variant_title?: string
  sku?: string | null
  quantity?: number
  total_price?: string | null
  unit_price?: string | null
  currency?: string | null
  weight?: string | null
  weight_unit?: string | null
  [key: string]: unknown
}

export interface ShippoOrder {
  object_id: string
  order_number?: string | null
  order_status?: string | null
  placed_at?: string | null
  to_address?: ShippoOrderAddress | null
  from_address?: ShippoOrderAddress | null
  line_items?: ShippoOrderLineItem[]
  currency?: string | null
  subtotal_price?: string | null
  total_tax?: string | null
  shipping_cost?: string | null
  total_price?: string | null
  transactions?: string[]
  shipping_method?: string | null
  notes?: string | null
  object_created?: string
  object_updated?: string
  [key: string]: unknown
}

const STATUS_MAP: Record<string, OrderStatus> = {
  PAID: 'PROCESSING',
  PARTIALLY_FULFILLED: 'AWAITING_SHIPMENT',
  FULFILLED: 'SHIPPED',
  CANCELLED: 'CANCELLED',
  REFUNDED: 'RETURNED',
}

function mapStatus(raw: string | undefined | null): OrderStatus | undefined {
  if (!raw) return undefined
  return STATUS_MAP[raw.toUpperCase()] ?? 'PENDING'
}

function parseAmount(v: string | null | undefined): number | undefined {
  if (!v) return undefined
  const n = parseFloat(v)
  return isNaN(n) ? undefined : Math.round(n * 100)
}

export function transformOrder(raw: ShippoOrder): Order {
  const currency = raw.currency ?? undefined

  const lineItems = (raw.line_items ?? []).map((li) => ({
    id: li.object_id ?? undefined,
    sku: li.sku ?? undefined,
    name: li.title ?? li.variant_title ?? undefined,
    description: li.variant_title ?? undefined,
    quantity: li.quantity ?? undefined,
    unitAmount: parseAmount(li.unit_price),
    totalAmount: parseAmount(li.total_price),
  }))

  return {
    id: raw.object_id,
    status: mapStatus(raw.order_status),
    orderNumber: raw.order_number ?? undefined,
    shipmentIds: raw.transactions && raw.transactions.length > 0 ? raw.transactions : undefined,
    originAddress: raw.from_address
      ? toAddress({
          name: raw.from_address.name,
          company: raw.from_address.company,
          street1: raw.from_address.street1,
          street2: raw.from_address.street2,
          city: raw.from_address.city,
          state: raw.from_address.state,
          postalCode: raw.from_address.zip,
          country: raw.from_address.country,
          phone: raw.from_address.phone,
          email: raw.from_address.email,
        })
      : undefined,
    destinationAddress: raw.to_address
      ? toAddress({
          name: raw.to_address.name,
          company: raw.to_address.company,
          street1: raw.to_address.street1,
          street2: raw.to_address.street2,
          city: raw.to_address.city,
          state: raw.to_address.state,
          postalCode: raw.to_address.zip,
          country: raw.to_address.country,
          phone: raw.to_address.phone,
          email: raw.to_address.email,
        })
      : undefined,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    currency: currency,
    subtotalAmount: parseAmount(raw.subtotal_price),
    taxAmount: parseAmount(raw.total_tax),
    shippingAmount: parseAmount(raw.shipping_cost),
    totalAmount: parseAmount(raw.total_price),
    notes: raw.notes ?? undefined,
    requestedServiceCode: raw.shipping_method ?? undefined,
    orderAt: toISODate(raw.placed_at),
    createdAt: toISODate(raw.object_created),
    updatedAt: toISODate(raw.object_updated),
    metadata: raw as Record<string, unknown>,
  }
}
