/**
 * Crystallize Fulfillment -> canonical Fulfillment.
 *
 * Crystallize does not have a first-class fulfillment model. Fulfillment
 * data is stored as order metadata/pipelines. We model fulfillments as
 * pipeline stage entries on orders.
 */

import type {
  Fulfillment,
  FulfillmentStatus,
  FulfillmentLineItem,
} from '../../../schema/fulfillment'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawCrystallizePipelineStage {
  stageId?: string
  pipelineId?: string
}

export interface RawCrystallizeFulfillment {
  id: string
  orderId: string
  status?: string
  trackingNumber?: string | null
  carrier?: string | null
  lineItems?: Array<{ lineItemId: string; quantity: number }>
  createdAt?: string
  [key: string]: unknown
}

const STATUS_MAP: Record<string, FulfillmentStatus> = {
  shipped: 'SUCCESS',
  delivered: 'SUCCESS',
  pending: 'PENDING',
  processing: 'OPEN',
  cancelled: 'CANCELLED',
  returned: 'CANCELLED',
}

function mapLineItems(
  items: Array<{ lineItemId: string; quantity: number }> | undefined,
): FulfillmentLineItem[] | undefined {
  if (!items || items.length === 0) return undefined
  return items.map((li) => ({
    lineItemId: li.lineItemId,
    quantity: li.quantity,
  }))
}

export function transformFulfillment(
  raw: RawCrystallizeFulfillment,
  orderId: string = '',
): Fulfillment {
  const statusKey = (raw.status ?? '').toLowerCase()
  return {
    id: raw.id,
    orderId: raw.orderId || orderId,
    status: STATUS_MAP[statusKey] ?? undefined,
    trackingNumber: raw.trackingNumber ?? undefined,
    carrier: raw.carrier ?? undefined,
    lineItems: mapLineItems(raw.lineItems),
    createdAt: toIsoDatetime(raw.createdAt),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformFulfillment(fulfillment: Partial<Fulfillment>): Record<string, unknown> {
  return {
    trackingNumber: fulfillment.trackingNumber,
    carrier: fulfillment.carrier,
  }
}
