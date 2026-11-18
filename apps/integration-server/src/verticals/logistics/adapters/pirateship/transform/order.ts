/**
 * PirateShip Order → canonical Order.
 *
 * PirateShip is primarily a label/rate platform, but exposes shipment
 * records that can be treated as orders for the canonical logistics
 * interface. An order corresponds to a "shipment" purchase.
 *
 * Docs: https://docs.pirateship.com/
 */

import type { Order, OrderStatus } from '../../../schema/order'
import { toAddress, toISODate } from '../../shared/transform'

export interface PirateShipOrderSender {
  name?: string | null
  company?: string | null
  address_line1?: string | null
  address_line2?: string | null
  city?: string | null
  state?: string | null
  postal_code?: string | null
  country?: string | null
  phone?: string | null
  email?: string | null
  [key: string]: unknown
}

export interface PirateShipOrderItem {
  description?: string | null
  sku?: string | null
  quantity?: number | null
  price?: number | null
  [key: string]: unknown
}

export interface PirateShipOrder {
  shipment_id?: string | null
  order_id?: string | null
  status?: string | null
  tracking_number?: string | null
  service_code?: string | null
  reference?: string | null
  notes?: string | null
  sender?: PirateShipOrderSender | null
  recipient?: PirateShipOrderSender | null
  items?: PirateShipOrderItem[]
  weight?: number | null
  weight_unit?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

function mapOrderStatus(status: string | null | undefined): OrderStatus {
  if (!status) return 'PENDING'
  switch (status) {
    case 'LABEL_CREATED': return 'AWAITING_SHIPMENT'
    case 'IN_TRANSIT':    return 'SHIPPED'
    case 'DELIVERED':     return 'DELIVERED'
    case 'EXCEPTION':     return 'RETURNED'
    case 'RETURNED':      return 'RETURNED'
    case 'CANCELLED':     return 'CANCELLED'
    default:              return 'PENDING'
  }
}

function toOrderAddress(raw: PirateShipOrderSender | null | undefined) {
  if (!raw) return undefined
  return toAddress(raw as Record<string, unknown>)
}

export function transformOrder(raw: PirateShipOrder): Order {
  const id = raw.order_id ?? raw.shipment_id ?? undefined

  const lineItems = (raw.items ?? [])
    .filter((it) => it.description || it.sku)
    .map((it) => ({
      sku: it.sku ?? undefined,
      description: it.description ?? undefined,
      quantity: it.quantity ?? undefined,
      unitAmount: it.price != null ? Math.round(it.price * 100) : undefined,
    }))

  return {
    id,
    status: mapOrderStatus(raw.status),
    orderNumber: raw.reference ?? undefined,
    originAddress: toOrderAddress(raw.sender),
    destinationAddress: toOrderAddress(raw.recipient),
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    notes: raw.notes ?? undefined,
    requestedServiceCode: raw.service_code ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
