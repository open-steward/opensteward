/**
 * Shyplite Order → canonical Order.
 *
 * Shyplite exposes order creation/retrieval via /orders.
 * Orders follow Shyplite's shipment/consignee model.
 */

import type { Order, OrderStatus } from '../../../schema/order'

export interface ShypliteOrderAddress {
  name?: string | null
  address?: string | null
  city?: string | null
  state?: string | null
  pincode?: string | null
  country?: string | null
  phone?: string | null
  email?: string | null
  [key: string]: unknown
}

export interface ShypliteOrderItem {
  name?: string | null
  sku?: string | null
  quantity?: number | null
  price?: number | null
  [key: string]: unknown
}

export interface ShypliteOrder {
  id?: string | number | null
  order_id?: string | null
  awb?: string | null
  status?: string | null
  carrier?: string | null
  consignee?: ShypliteOrderAddress | null
  pickup_address?: ShypliteOrderAddress | null
  items?: ShypliteOrderItem[]
  weight?: number | null
  cod?: boolean | null
  cod_amount?: number | null
  notes?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

function mapOrderStatus(status: string | null | undefined): OrderStatus {
  if (!status) return 'PENDING'
  const s = status.toLowerCase().trim()
  if (s.includes('delivered')) return 'DELIVERED'
  if (s.includes('shipped') || s.includes('in transit') || s.includes('in_transit')) return 'SHIPPED'
  if (s.includes('cancelled') || s.includes('canceled') || s.includes('lost')) return 'CANCELLED'
  if (s.includes('rto') || s.includes('return')) return 'RETURNED'
  if (s.includes('booked') || s.includes('manifested') || s.includes('pending') || s.includes('created')) return 'PENDING'
  return 'PENDING'
}

function toAddress(raw: ShypliteOrderAddress | null | undefined) {
  if (!raw) return undefined
  if (!raw.name && !raw.address && !raw.city) return undefined
  return {
    name: raw.name ?? undefined,
    street1: raw.address ?? undefined,
    city: raw.city ?? undefined,
    state: raw.state ?? undefined,
    postalCode: raw.pincode ?? undefined,
    country: raw.country ?? undefined,
    phone: raw.phone ?? undefined,
    email: raw.email ?? undefined,
  }
}

export function transformOrder(raw: ShypliteOrder): Order {
  const id = raw.id != null ? String(raw.id) : (raw.order_id ?? undefined)

  const lineItems = (raw.items ?? [])
    .filter((it) => it.name || it.sku)
    .map((it) => ({
      sku: it.sku ?? undefined,
      description: it.name ?? undefined,
      quantity: it.quantity ?? undefined,
      unitAmount: it.price ?? undefined,
    }))

  return {
    id,
    status: mapOrderStatus(raw.status),
    originAddress: toAddress(raw.pickup_address),
    destinationAddress: toAddress(raw.consignee),
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    notes: raw.notes ?? undefined,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
