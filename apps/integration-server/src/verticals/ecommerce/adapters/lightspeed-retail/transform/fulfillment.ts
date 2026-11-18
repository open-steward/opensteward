/**
 * Lightspeed Retail Special Order → canonical Fulfillment.
 *
 * Lightspeed R-Series has limited fulfillment tracking via "Special Orders".
 * The API surface is minimal. We map what's available; most methods return 501.
 */

import type { Fulfillment, FulfillmentStatus } from '../../../schema/fulfillment'

export interface RawLightspeedSpecialOrder {
  specialOrderID: string
  saleID?: string
  saleLineID?: string
  itemID?: string
  shopID?: string
  quantity?: string
  status?: string
  note?: string
  createTime?: string
  timeStamp?: string
  [key: string]: unknown
}

const STATUS_MAP: Record<string, FulfillmentStatus> = {
  pending: 'PENDING',
  ordered: 'OPEN',
  received: 'SUCCESS',
  cancelled: 'CANCELLED',
}

export function transformFulfillment(
  raw: RawLightspeedSpecialOrder,
): Fulfillment {
  const status = raw.status?.toLowerCase()
  return {
    id: raw.specialOrderID,
    orderId: raw.saleID ?? '',
    status: status ? STATUS_MAP[status] ?? undefined : undefined,
    locationId: raw.shopID ?? undefined,
    lineItems: raw.saleLineID
      ? [
          {
            lineItemId: raw.saleLineID,
            quantity: raw.quantity ? parseInt(raw.quantity, 10) : 1,
          },
        ]
      : undefined,
    createdAt: raw.createTime,
    updatedAt: raw.timeStamp,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
