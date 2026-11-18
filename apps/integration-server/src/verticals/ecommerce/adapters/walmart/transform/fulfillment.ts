/**
 * Walmart Order Line Status → canonical Fulfillment.
 *
 * Walmart doesn't have a standalone fulfillment resource. Instead,
 * shipment info is embedded in order line statuses. When a seller ships
 * an order, they POST to /v3/orders/{purchaseOrderId}/shipping with
 * tracking info per line. The order's orderLineStatuses array then
 * contains the tracking/shipping data.
 *
 * We derive Fulfillment records from order line statuses that have
 * a `Shipped` status and tracking info.
 */

import type { Fulfillment, FulfillmentStatus } from '../../../schema/fulfillment'

// ── Raw shapes ───────────────────────────────────────────────────────────────

export interface RawWalmartShipment {
  orderId: string
  lineNumber?: string
  status?: string
  trackingNumber?: string
  carrier?: string
  trackingUrl?: string
  shipDateTime?: string
  methodCode?: string
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function inferStatus(raw: RawWalmartShipment): FulfillmentStatus {
  const status = raw.status?.toUpperCase()
  if (status === 'SHIPPED') return 'SUCCESS'
  if (status === 'DELIVERED') return 'SUCCESS'
  if (status === 'CANCELLED') return 'CANCELLED'
  return 'PENDING'
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformFulfillment(raw: RawWalmartShipment): Fulfillment {
  const id = raw.trackingNumber
    ? `${raw.orderId}:${raw.trackingNumber}`
    : `${raw.orderId}:${raw.lineNumber ?? '0'}`

  const lineItems = raw.lineNumber
    ? [{ lineItemId: raw.lineNumber, quantity: 1 }]
    : undefined

  return {
    id,
    orderId: raw.orderId,
    status: inferStatus(raw),
    trackingNumber: raw.trackingNumber,
    trackingUrl: raw.trackingUrl,
    carrier: raw.carrier,
    service: raw.methodCode,
    lineItems,
    shippedAt: raw.shipDateTime,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Extract fulfillment records from Walmart order line statuses.
 */
export function extractFulfillmentsFromOrder(
  orderId: string,
  orderLines: Array<{
    lineNumber?: string
    orderLineStatuses?: Array<{
      status?: string
      trackingInfo?: {
        shipDateTime?: string
        carrierName?: { carrier?: string }
        trackingNumber?: string
        trackingURL?: string
      }
    }>
    fulfillment?: {
      fulfillmentOption?: string
      shipMethod?: string
    }
  }> | undefined,
): Fulfillment[] {
  if (!orderLines) return []

  const fulfillments: Fulfillment[] = []
  for (const line of orderLines) {
    for (const status of line.orderLineStatuses ?? []) {
      if (status.status === 'Shipped' && status.trackingInfo) {
        const raw: RawWalmartShipment = {
          orderId,
          lineNumber: line.lineNumber,
          status: status.status,
          trackingNumber: status.trackingInfo.trackingNumber,
          carrier: status.trackingInfo.carrierName?.carrier,
          trackingUrl: status.trackingInfo.trackingURL,
          shipDateTime: status.trackingInfo.shipDateTime,
          methodCode: line.fulfillment?.shipMethod,
        }
        fulfillments.push(transformFulfillment(raw))
      }
    }
  }
  return fulfillments
}

/**
 * Canonical Fulfillment → Walmart shipping update body.
 */
export function untransformFulfillment(
  data: Partial<Fulfillment>,
): Record<string, unknown> {
  const orderShipment: Record<string, unknown> = {}

  const orderLines: unknown[] = []
  if (data.lineItems) {
    for (const li of data.lineItems) {
      orderLines.push({
        lineNumber: li.lineItemId,
        orderLineStatuses: {
          orderLineStatus: [
            {
              status: 'Shipped',
              statusQuantity: {
                unitOfMeasurement: 'EACH',
                amount: String(li.quantity),
              },
              trackingInfo: {
                shipDateTime: data.shippedAt ?? new Date().toISOString(),
                carrierName: {
                  carrier: data.carrier ?? 'OTHER',
                },
                trackingNumber: data.trackingNumber ?? '',
                trackingURL: data.trackingUrl ?? '',
                methodCode: data.service ?? 'Standard',
              },
            },
          ],
        },
      })
    }
  }

  orderShipment['orderLines'] = { orderLine: orderLines }

  return { orderShipment }
}
