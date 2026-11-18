/**
 * SAP Commerce Cloud Order → canonical Fulfillment.
 *
 * SAP Commerce does not have a first-class "fulfillment" resource in
 * the OCC API. Fulfillment status is tracked on the order itself via
 * `deliveryStatus` / `statusDisplay`. The adapter synthesizes a
 * fulfillment record from the order's delivery information.
 *
 * For consignment-based fulfillment (available in some SAP Commerce
 * configurations), the consignment data is preserved in metadata.
 */

import type { Fulfillment, FulfillmentStatus, FulfillmentLineItem } from '../../../schema/fulfillment'
import { toIsoDatetime } from '@opensteward/shared'
import type { RawSapOrder } from './order'

export interface RawSapConsignment {
  code?: string
  status?: string
  statusDate?: string
  trackingID?: string
  carrier?: string
  deliveryPointOfService?: { name?: string }
  entries?: Array<{
    orderEntry?: { entryNumber?: number }
    quantity?: number
    shippedQuantity?: number
  }>
  [key: string]: unknown
}

function mapFulfillmentStatus(
  status: string | undefined,
): FulfillmentStatus {
  const s = (status ?? '').toLowerCase()
  if (s.includes('cancel')) return 'CANCELLED'
  if (s.includes('shipped') || s.includes('delivery_completed')) return 'SUCCESS'
  if (s.includes('ready') || s.includes('pickup_complete')) return 'OPEN'
  if (s.includes('error')) return 'ERROR'
  return 'PENDING'
}

/**
 * Transform an SAP Commerce order into a canonical Fulfillment. If the
 * order contains consignment data, use the first consignment.
 */
export function transformFulfillment(
  raw: RawSapOrder,
  consignment?: RawSapConsignment,
): Fulfillment {
  const lineItems: FulfillmentLineItem[] | undefined = raw.entries?.map((e) => ({
    lineItemId: String(e.entryNumber ?? 0),
    quantity: e.quantity ?? 1,
  }))

  if (consignment) {
    return {
      id: consignment.code ?? raw.code,
      orderId: raw.code,
      status: mapFulfillmentStatus(consignment.status),
      trackingNumber: consignment.trackingID,
      carrier: consignment.carrier,
      lineItems: consignment.entries?.map((e) => ({
        lineItemId: String(e.orderEntry?.entryNumber ?? 0),
        quantity: e.shippedQuantity ?? e.quantity ?? 0,
      })),
      createdAt: consignment.statusDate,
      metadata: { order: raw, consignment } as unknown as Record<string, unknown>,
    }
  }

  return {
    id: raw.code,
    orderId: raw.code,
    status: mapFulfillmentStatus(raw.deliveryStatus ?? raw.statusDisplay),
    lineItems,
    createdAt: toIsoDatetime(raw.created),
    updatedAt: toIsoDatetime(raw.statusDate),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
