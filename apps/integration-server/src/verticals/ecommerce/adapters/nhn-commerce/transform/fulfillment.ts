/**
 * NHN Commerce (Shopby) Delivery/Shipping → canonical Fulfillment.
 *
 * Shopby surfaces delivery information within the order detail response
 * at `orderOptions[].delivery`. There is no standalone fulfillment list
 * endpoint in the shop API — fulfillment data is derived from order options.
 *
 * Each order option that has been dispatched contains delivery info:
 *   invoiceNo        - tracking number
 *   deliveryCompanyType - carrier code
 */

import type { Fulfillment, FulfillmentStatus } from '../../../schema/fulfillment'

// ── Raw NHN Commerce shapes ───────────────────────────────────────────────────

export interface RawNhnDelivery {
  invoiceNo?: string | null
  deliveryCompanyType?: string | null
  deliveryType?: string | null
  deliveryStateType?: string | null
  [key: string]: unknown
}

export interface RawNhnOrderOptionWithDelivery {
  orderNo?: string
  orderOptionNo?: number | string
  productNo?: number | string
  orderStatusType?: string | null
  delivery?: RawNhnDelivery | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, FulfillmentStatus> = {
  DELIVERY_PREPARE: 'PENDING',
  DELIVERY_ING: 'OPEN',
  DELIVERY_DONE: 'SUCCESS',
  CANCEL_DONE: 'CANCELLED',
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformFulfillment(
  raw: RawNhnOrderOptionWithDelivery,
  orderId?: string,
): Fulfillment {
  const delivery = raw.delivery
  const status = raw.orderStatusType
    ? (STATUS_MAP[raw.orderStatusType] ?? undefined)
    : undefined

  return {
    id: String(raw.orderOptionNo ?? ''),
    orderId: orderId ?? raw.orderNo ?? '',
    status,
    trackingNumber: delivery?.invoiceNo ?? undefined,
    carrier: delivery?.deliveryCompanyType ?? undefined,
    lineItems: raw.orderOptionNo != null
      ? [{ lineItemId: String(raw.orderOptionNo), quantity: 1 }]
      : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
