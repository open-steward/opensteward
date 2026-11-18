/**
 * Sylius Shipment -> canonical Fulfillment.
 *
 * Sylius shipments live under `/api/v2/admin/shipments` and carry:
 *  - `state`: cart | ready | shipped | cancelled
 *  - `tracking`: tracking code string
 *  - `method`: shipping method info
 *
 * Sylius shipments transition: cart -> ready -> shipped.
 */

import type {
  Fulfillment,
  FulfillmentStatus,
  FulfillmentLineItem,
} from '../../../schema/fulfillment'

export interface RawSyliusShipmentUnit {
  id?: number | string
  shippable?: { code?: string; name?: string }
  [key: string]: unknown
}

export interface RawSyliusShipment {
  id: number | string
  order?: { id?: number | string; number?: string } | string | null
  state?: string // cart | ready | shipped | cancelled
  tracking?: string | null
  method?: { code?: string; name?: string } | string | null
  units?: RawSyliusShipmentUnit[]
  shippedAt?: string | null
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

function mapStatus(state: string | undefined): FulfillmentStatus | undefined {
  switch (state) {
    case 'cart':
    case 'ready':
      return 'PENDING'
    case 'shipped':
      return 'SUCCESS'
    case 'cancelled':
      return 'CANCELLED'
    default:
      return undefined
  }
}

function extractOrderId(
  order: { id?: number | string; number?: string } | string | null | undefined,
): string {
  if (!order) return ''
  if (typeof order === 'string') {
    const parts = order.split('/')
    return parts[parts.length - 1] ?? ''
  }
  return order.id != null ? String(order.id) : ''
}

function extractMethodName(
  method: { code?: string; name?: string } | string | null | undefined,
): string | undefined {
  if (!method) return undefined
  if (typeof method === 'string') return method
  return method.name ?? method.code ?? undefined
}

function mapLineItems(
  units: RawSyliusShipmentUnit[] | undefined,
): FulfillmentLineItem[] | undefined {
  if (!units || units.length === 0) return undefined
  // Each unit is one shippable item
  const grouped = new Map<string, number>()
  for (const unit of units) {
    const key = unit.shippable?.code ?? String(unit.id ?? '')
    if (key) {
      grouped.set(key, (grouped.get(key) ?? 0) + 1)
    }
  }
  return Array.from(grouped.entries()).map(([lineItemId, quantity]) => ({
    lineItemId,
    quantity,
  }))
}

export function transformFulfillment(raw: RawSyliusShipment): Fulfillment {
  return {
    id: String(raw.id),
    orderId: extractOrderId(raw.order),
    status: mapStatus(raw.state),
    trackingNumber: raw.tracking ?? undefined,
    carrier: extractMethodName(raw.method),
    lineItems: mapLineItems(raw.units),
    shippedAt: raw.shippedAt ?? undefined,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformFulfillment(
  fulfillment: Partial<Fulfillment>,
): Record<string, unknown> {
  return {
    tracking: fulfillment.trackingNumber,
  }
}
