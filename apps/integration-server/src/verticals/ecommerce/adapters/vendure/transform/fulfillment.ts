/**
 * Vendure Fulfillment -> canonical Fulfillment.
 *
 * Vendure fulfillments have states: Pending, Shipped, Delivered, Cancelled.
 */

import type {
  Fulfillment,
  FulfillmentStatus,
  FulfillmentLineItem,
} from '../../../schema/fulfillment'

export interface RawVendureFulfillmentLine {
  orderLineId: string
  quantity: number
}

export interface RawVendureFulfillment {
  id: string
  state?: string
  trackingCode?: string | null
  method?: string | null
  lines?: RawVendureFulfillmentLine[]
  orders?: Array<{ id: string }> | null
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

const STATUS_MAP: Record<string, FulfillmentStatus> = {
  PENDING: 'PENDING',
  CREATED: 'PENDING',
  SHIPPED: 'SUCCESS',
  DELIVERED: 'SUCCESS',
  CANCELLED: 'CANCELLED',
}

function mapLineItems(raw: RawVendureFulfillmentLine[] | undefined): FulfillmentLineItem[] | undefined {
  if (!raw || raw.length === 0) return undefined
  return raw.map((li) => ({
    lineItemId: String(li.orderLineId),
    quantity: li.quantity,
  }))
}

export function transformFulfillment(
  raw: RawVendureFulfillment,
  orderId: string = '',
): Fulfillment {
  const stateKey = raw.state ? raw.state.toUpperCase() : undefined

  return {
    id: String(raw.id),
    orderId: orderId || (raw.orders?.[0]?.id != null ? String(raw.orders[0].id) : ''),
    status: stateKey ? STATUS_MAP[stateKey] ?? undefined : undefined,
    trackingNumber: raw.trackingCode ?? undefined,
    carrier: raw.method ?? undefined,
    lineItems: mapLineItems(raw.lines),
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformFulfillment(fulfillment: Partial<Fulfillment>): Record<string, unknown> {
  return {
    trackingCode: fulfillment.trackingNumber,
    method: fulfillment.carrier ?? 'Manual',
    handler: { code: 'manual-fulfillment', arguments: [] },
  }
}
