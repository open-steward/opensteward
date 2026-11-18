/**
 * Big Cartel Shipment → canonical Fulfillment.
 *
 * Big Cartel tracks shipments via its Shipments resource. Each shipment
 * has a tracking number, carrier, status, and is linked to an order.
 *
 * The Big Cartel API endpoint is `/accounts/{account-id}/shipments`.
 *
 * Shipment status is not documented as a fixed enum; we map whatever comes
 * back as a string. The canonical FulfillmentStatus values are:
 * PENDING | OPEN | SUCCESS | CANCELLED | ERROR | FAILURE
 *
 * Docs: https://developers.bigcartel.com/api/v1#shipments
 */

import type { Fulfillment, FulfillmentStatus } from '../../../schema/fulfillment'

// ── Raw Big Cartel shape ───────────────────────────────────────────────────

export interface RawBigCartelShipment {
  id: string | number
  type?: string
  attributes?: {
    tracking_number?: string | null
    carrier?: string | null
    status?: string | null
    created_at?: string | null
    updated_at?: string | null
  }
  relationships?: {
    order?: {
      data?: { id: string | number; type?: string } | null
    }
  }
  [key: string]: unknown
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function mapStatus(status: string | null | undefined): FulfillmentStatus | undefined {
  if (!status) return undefined
  switch (status.toLowerCase()) {
    case 'pending':
      return 'PENDING'
    case 'open':
    case 'in_transit':
      return 'OPEN'
    case 'shipped':
    case 'delivered':
    case 'completed':
      return 'SUCCESS'
    case 'cancelled':
    case 'canceled':
      return 'CANCELLED'
    case 'error':
      return 'ERROR'
    case 'failure':
    case 'failed':
      return 'FAILURE'
    default:
      return undefined
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformFulfillment(raw: RawBigCartelShipment): Fulfillment {
  const attrs = raw.attributes ?? {}
  const orderId = raw.relationships?.order?.data?.id
  return {
    id: String(raw.id),
    orderId: orderId != null ? String(orderId) : '',
    status: mapStatus(attrs.status),
    trackingNumber: attrs.tracking_number ?? undefined,
    carrier: attrs.carrier ?? undefined,
    createdAt: attrs.created_at ?? undefined,
    updatedAt: attrs.updated_at ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformFulfillment(
  fulfillment: Partial<Fulfillment>,
): Record<string, unknown> {
  const attributes: Record<string, unknown> = {}
  if (fulfillment.trackingNumber != null)
    attributes['tracking_number'] = fulfillment.trackingNumber
  if (fulfillment.carrier != null) attributes['carrier'] = fulfillment.carrier
  if (fulfillment.status != null) attributes['status'] = fulfillment.status?.toLowerCase()
  return { data: { type: 'shipments', attributes } }
}
