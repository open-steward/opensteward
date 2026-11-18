/**
 * Saleor Fulfillment → canonical Fulfillment.
 *
 * Saleor has first-class Fulfillment objects nested under Order. Status is
 * an UPPER_SNAKE enum (FULFILLED, CANCELED, RETURNED, etc.).
 */

import type {
  Fulfillment,
  FulfillmentStatus,
  FulfillmentLineItem,
} from '../../../schema/fulfillment'

export interface RawSaleorFulfillmentLine {
  id: string
  quantity: number
  orderLine?: { id: string } | null
}

export interface RawSaleorFulfillment {
  id: string
  status?: string
  trackingNumber?: string | null
  fulfillmentOrder?: number
  lines?: RawSaleorFulfillmentLine[]
  warehouse?: { id?: string } | null
  created?: string
  // The parent order id is passed separately by the adapter.
  [key: string]: unknown
}

const STATUS_MAP: Record<string, FulfillmentStatus> = {
  FULFILLED: 'SUCCESS',
  CANCELED: 'CANCELLED',
  RETURNED: 'CANCELLED',
  WAITING_FOR_APPROVAL: 'PENDING',
  REFUNDED: 'CANCELLED',
  REFUNDED_AND_RETURNED: 'CANCELLED',
}

function mapLineItems(raw: RawSaleorFulfillmentLine[] | undefined): FulfillmentLineItem[] | undefined {
  if (!raw || raw.length === 0) return undefined
  return raw.map((li) => ({
    lineItemId: li.orderLine?.id ?? li.id,
    quantity: li.quantity,
  }))
}

export function transformFulfillment(
  raw: RawSaleorFulfillment,
  orderId: string = '',
): Fulfillment {
  return {
    id: raw.id,
    orderId,
    status: raw.status ? STATUS_MAP[raw.status.toUpperCase()] ?? undefined : undefined,
    trackingNumber: raw.trackingNumber ?? undefined,
    locationId: raw.warehouse?.id ?? undefined,
    lineItems: mapLineItems(raw.lines),
    createdAt: raw.created,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformFulfillment(fulfillment: Partial<Fulfillment>): Record<string, unknown> {
  return {
    trackingNumber: fulfillment.trackingNumber,
    notifyCustomer: fulfillment.notifyCustomer ?? false,
  }
}
