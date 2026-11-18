/**
 * Shoplazza Fulfillment → canonical Fulfillment.
 *
 * Endpoint: GET /openapi/{version}/orders/{order_id}/fulfillments/{fulfillment_id}
 *
 * Key fields (from Go SDK): id, order_id, status, tracking_company,
 * tracking_company_code, tracking_number, line_items (array of {id, quantity}).
 *
 * Docs: https://www.shoplazza.dev/api/fulfillment-detail
 */

import type {
  Fulfillment,
  FulfillmentStatus,
  FulfillmentLineItem,
} from '../../../schema/fulfillment'

export interface RawShoplazzaFulfillmentLineItem {
  id: number | string
  quantity: number
}

export interface RawShoplazzaFulfillment {
  id: number | string
  order_id: number | string
  status?: string | null
  tracking_number?: string | null
  tracking_company?: string | null
  tracking_company_code?: string | null
  line_items?: RawShoplazzaFulfillmentLineItem[]
  /** Line item ids (alternative representation some responses use). */
  line_item_ids?: Array<number | string>
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

const STATUS_MAP: Record<string, FulfillmentStatus> = {
  pending: 'PENDING',
  open: 'OPEN',
  success: 'SUCCESS',
  cancelled: 'CANCELLED',
  canceled: 'CANCELLED',
  error: 'ERROR',
  failure: 'FAILURE',
}

function mapLineItems(
  raw: RawShoplazzaFulfillmentLineItem[] | undefined,
): FulfillmentLineItem[] | undefined {
  if (!raw || raw.length === 0) return undefined
  return raw.map((li) => ({ lineItemId: String(li.id), quantity: li.quantity }))
}

export function transformFulfillment(raw: RawShoplazzaFulfillment): Fulfillment {
  return {
    id: String(raw.id),
    orderId: String(raw.order_id),
    status: raw.status ? STATUS_MAP[raw.status.toLowerCase()] ?? undefined : undefined,
    trackingNumber: raw.tracking_number ?? undefined,
    carrier: raw.tracking_company ?? raw.tracking_company_code ?? undefined,
    lineItems: mapLineItems(raw.line_items),
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformFulfillment(
  fulfillment: Partial<Fulfillment>,
): Record<string, unknown> {
  return {
    tracking_number: fulfillment.trackingNumber,
    tracking_company: fulfillment.carrier,
    line_items: fulfillment.lineItems?.map((li) => ({
      id: li.lineItemId,
      quantity: li.quantity,
    })),
  }
}
