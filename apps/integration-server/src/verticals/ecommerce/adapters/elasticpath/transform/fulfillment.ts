/**
 * Elastic Path Order Fulfillment → canonical Fulfillment.
 *
 * Elastic Path (Commerce Cloud) exposes fulfillment as order shipments.
 * The `data` field of each resource wraps attributes in a JSON:API envelope.
 *
 * Relevant endpoint:
 *   GET  /v2/orders/{orderId}/fulfillments
 *   POST /v2/orders/{orderId}/fulfillments
 *
 * Fulfillment attributes include shipping status, tracking, and carrier info.
 * Line item references are stored in `relationships.items.data[]`.
 *
 * Docs: https://elasticpath.dev/docs/commerce-cloud/orders/fulfillments/overview
 */
import type { Fulfillment, FulfillmentStatus } from '../../../schema/fulfillment'
import type { EpResource } from '../client'

export interface RawEpFulfillment extends EpResource {
  type: 'fulfillment'
  attributes: {
    status?: string | null
    tracking_number?: string | null
    tracking_url?: string | null
    carrier?: string | null
    service?: string | null
    location_id?: string | null
    shipped_at?: string | null
    estimated_delivery_at?: string | null
    delivered_at?: string | null
    created_at?: string | null
    updated_at?: string | null
    notify_customer?: boolean | null
    [key: string]: unknown
  }
  relationships?: {
    items?: {
      data?: Array<{ type: string; id: string }> | null
    } | null
    [key: string]: unknown
  }
}

const STATUS_MAP: Record<string, FulfillmentStatus> = {
  pending: 'PENDING',
  open: 'OPEN',
  fulfilled: 'SUCCESS',
  completed: 'SUCCESS',
  cancelled: 'CANCELLED',
  failed: 'FAILURE',
  error: 'ERROR',
}

function mapStatus(raw: string | null | undefined): FulfillmentStatus | undefined {
  if (!raw) return undefined
  return STATUS_MAP[raw.toLowerCase()] ?? undefined
}

export function transformFulfillment(raw: RawEpFulfillment, orderId: string): Fulfillment {
  const attrs = raw.attributes ?? {}
  const itemRefs = raw.relationships?.items?.data ?? []

  return {
    id: raw.id,
    orderId,
    status: mapStatus(attrs.status as string | undefined),
    trackingNumber: (attrs.tracking_number as string | undefined) ?? undefined,
    trackingUrl: (attrs.tracking_url as string | undefined) ?? undefined,
    carrier: (attrs.carrier as string | undefined) ?? undefined,
    service: (attrs.service as string | undefined) ?? undefined,
    locationId: (attrs.location_id as string | undefined) ?? undefined,
    notifyCustomer: typeof attrs.notify_customer === 'boolean' ? attrs.notify_customer : undefined,
    lineItems:
      itemRefs.length > 0
        ? itemRefs.map((r) => ({ lineItemId: r.id, quantity: 1 }))
        : undefined,
    shippedAt: (attrs.shipped_at as string | undefined) ?? undefined,
    estimatedDeliveryAt: (attrs.estimated_delivery_at as string | undefined) ?? undefined,
    deliveredAt: (attrs.delivered_at as string | undefined) ?? undefined,
    createdAt: (attrs.created_at as string | undefined) ?? undefined,
    updatedAt: (attrs.updated_at as string | undefined) ?? undefined,
    metadata: attrs as Record<string, unknown>,
  }
}

/** Canonical Fulfillment → Elastic Path fulfillment create body. */
export function untransformFulfillment(data: Partial<Fulfillment>): Record<string, unknown> {
  return {
    data: {
      type: 'fulfillment',
      attributes: {
        ...(data.trackingNumber != null ? { tracking_number: data.trackingNumber } : {}),
        ...(data.trackingUrl != null ? { tracking_url: data.trackingUrl } : {}),
        ...(data.carrier != null ? { carrier: data.carrier } : {}),
        ...(data.service != null ? { service: data.service } : {}),
        ...(data.locationId != null ? { location_id: data.locationId } : {}),
        ...(data.notifyCustomer != null ? { notify_customer: data.notifyCustomer } : {}),
        ...(data.shippedAt != null ? { shipped_at: data.shippedAt } : {}),
      },
    },
  }
}
