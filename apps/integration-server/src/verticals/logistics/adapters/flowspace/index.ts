import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
} from '../../adapter/interface'
import type { Order } from '../../schema/order'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { WebhookEvent } from '../../schema/webhook'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { FlowspaceClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import {
  transformTrackingResponse,
  type FlowspaceTrackingResponse,
} from './transform/tracking'

// ── Resource coverage ──────────────────────────────────────────────────────────
// Available:   order, trackingevent
// Unverified:  carrier — API docs behind private login (developers.flow.space); carrier data appears embedded in order responses
// Unverified:  label — API docs behind private login (developers.flow.space); endpoint paths unconfirmed
// Unverified:  manifest — API docs behind private login (developers.flow.space); endpoint paths unconfirmed
// Unverified:  rate — API docs behind private login (developers.flow.space); endpoint paths unconfirmed
// Unverified:  shipment — API docs behind private login (developers.flow.space); endpoint paths unconfirmed
// Unverified:  warehouse — API docs behind private login (developers.flow.space); endpoint paths unconfirmed

// ── Internal API shapes ────────────────────────────────────────────────────────

interface FlowspaceAddress {
  name?: string | null
  company?: string | null
  address1?: string | null
  address2?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  country?: string | null
  phone?: string | null
  email?: string | null
}

interface FlowspaceLineitem {
  sku?: string | null
  name?: string | null
  quantity?: number | null
  unit_price?: number | null
}

interface FlowspaceOrder {
  id?: string
  order_number?: string | null
  status?: string | null
  warehouse_id?: string | null
  shipping_address?: FlowspaceAddress | null
  billing_address?: FlowspaceAddress | null
  line_items?: FlowspaceLineitem[] | null
  currency?: string | null
  subtotal?: number | null
  tax?: number | null
  shipping?: number | null
  discount?: number | null
  total?: number | null
  notes?: string | null
  service_level?: string | null
  tracking_number?: string | null
  carrier?: string | null
  ordered_at?: string | null
  shipped_at?: string | null
  delivered_at?: string | null
  cancelled_at?: string | null
  created_at?: string | null
  updated_at?: string | null
}

interface FlowspaceOrdersResponse {
  orders?: FlowspaceOrder[]
  data?: FlowspaceOrder[]
  results?: FlowspaceOrder[]
  page?: number
  limit?: number
  total?: number
}

// ── Helpers ────────────────────────────────────────────────────────────────────

import { toISODate, toAddress } from '../shared/transform'

function mapOrderStatus(status: string | null | undefined): Order['status'] {
  switch ((status ?? '').toLowerCase()) {
    case 'pending':        return 'PENDING'
    case 'processing':     return 'PROCESSING'
    case 'on_hold':        return 'ON_HOLD'
    case 'awaiting_shipment':
    case 'ready_to_ship': return 'AWAITING_SHIPMENT'
    case 'shipped':
    case 'in_transit':    return 'SHIPPED'
    case 'delivered':     return 'DELIVERED'
    case 'cancelled':     return 'CANCELLED'
    case 'returned':      return 'RETURNED'
    default:              return 'PENDING'
  }
}

function transformOrder(raw: FlowspaceOrder): Order {
  return {
    id: raw.id,
    status: mapOrderStatus(raw.status),
    orderNumber: raw.order_number ?? undefined,
    warehouseId: raw.warehouse_id ?? undefined,
    destinationAddress: toAddress(raw.shipping_address as Record<string, unknown>),
    lineItems: (raw.line_items ?? []).map((li) => ({
      sku: li.sku ?? undefined,
      name: li.name ?? undefined,
      quantity: li.quantity ?? undefined,
      unitAmount: li.unit_price != null ? Math.round(li.unit_price * 100) : undefined,
    })),
    currency: (raw.currency as Order['currency']) ?? undefined,
    subtotalAmount: raw.subtotal != null ? Math.round(raw.subtotal * 100) : undefined,
    taxAmount: raw.tax != null ? Math.round(raw.tax * 100) : undefined,
    shippingAmount: raw.shipping != null ? Math.round(raw.shipping * 100) : undefined,
    discountAmount: raw.discount != null ? Math.round(raw.discount * 100) : undefined,
    totalAmount: raw.total != null ? Math.round(raw.total * 100) : undefined,
    notes: raw.notes ?? undefined,
    requestedServiceCode: raw.service_level ?? undefined,
    orderAt: toISODate(raw.ordered_at),
    shippedAt: toISODate(raw.shipped_at),
    deliveredAt: toISODate(raw.delivered_at),
    cancelledAt: toISODate(raw.cancelled_at),
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

function extractOrders(res: FlowspaceOrdersResponse): FlowspaceOrder[] {
  return res.orders ?? res.data ?? res.results ?? []
}

// ── Adapter config ─────────────────────────────────────────────────────────────

interface FlowspaceAdapterConfig {
  clientId?: string
  clientSecret?: string
  redirectUri?: string
  scopes?: string[]
}

const SIMPLE_API_KEY_FORM = simpleApiKey()

// ── Adapter ────────────────────────────────────────────────────────────────────

export class FlowspaceAdapter implements LogisticsAdapter {
  // Connect Link support — single API-key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'flowspace'
  readonly version = '1'

  constructor(_config: FlowspaceAdapterConfig = {}) {}

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Webhook ────────────────────────────────────────────────────────────────

  /**
   * Flowspace does not publish a documented webhook signature scheme.
   * Always return false to force callers to rely on IP allowlisting or
   * shared-secret comparison outside this adapter.
   */
  verifyWebhook(
    _payload: Buffer,
    _headers: Record<string, string>,
    _secret: string,
  ): boolean {
    return false
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    const eventType = String(payload['event_type'] ?? payload['type'] ?? '')
    const data = payload['data'] as Record<string, unknown> | undefined
    const resourceId = data ? String(data['id'] ?? '') : undefined

    type CanonicalResource = WebhookEvent['resourceType']
    type CanonicalAction = WebhookEvent['action']

    const resourceMap: Record<string, CanonicalResource> = {
      order: 'order',
      shipment: 'shipment',
      tracking: 'tracking_event',
    }

    const actionMap: Record<string, CanonicalAction> = {
      created: 'created',
      updated: 'updated',
      deleted: 'deleted',
      cancelled: 'cancelled',
    }

    const [resource, rawAction] = eventType.split('.')
    const resourceType = resourceMap[resource]
    if (!resourceType) return []

    const action: CanonicalAction = actionMap[rawAction] ?? 'updated'

    return [
      {
        platform: 'flowspace',
        type: eventType,
        resourceType,
        action,
        resourceId: resourceId || undefined,
        payload,
      },
    ]
  }

  // ── Orders ─────────────────────────────────────────────────────────────────
  // Flowspace is an order-fulfillment platform — orders are the primary
  // resource. Shipments exist as sub-resources of orders.

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new FlowspaceClient(credentials)
    const res = await client.get<FlowspaceOrdersResponse>('orders', {
      limit: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      ...(params.updatedAfter ? { updated_after: (params.updatedAfter as Date).toISOString() } : {}),
    })
    return extractOrders(res).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new FlowspaceClient(credentials)
    const raw = await client.get<FlowspaceOrder>(`orders/${id}`)
    return transformOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new FlowspaceClient(credentials)
    const raw = await client.post<FlowspaceOrder>('orders', {
      order_number: data.orderNumber,
      warehouse_id: data.warehouseId,
      shipping_address: data.destinationAddress
        ? {
            name: data.destinationAddress.name,
            company: data.destinationAddress.company,
            address1: data.destinationAddress.street1,
            address2: data.destinationAddress.street2,
            city: data.destinationAddress.city,
            state: data.destinationAddress.state,
            zip: data.destinationAddress.postalCode,
            country: data.destinationAddress.country,
            phone: data.destinationAddress.phone,
            email: data.destinationAddress.email,
          }
        : undefined,
      line_items: (data.lineItems ?? []).map((li) => ({
        sku: li.sku,
        name: li.name,
        quantity: li.quantity,
        unit_price:
          li.unitAmount != null ? li.unitAmount / 100 : undefined,
      })),
      currency: data.currency,
      notes: data.notes,
      service_level: data.requestedServiceCode,
    })
    return transformOrder(raw)
  }

  async cancelOrder(credentials: Credentials, id: string): Promise<void> {
    const client = new FlowspaceClient(credentials)
    await client.patch<FlowspaceOrder>(`orders/${id}`, { status: 'cancelled' })
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(
    credentials: Credentials,
    trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    const client = new FlowspaceClient(credentials)
    const raw = await client.get<FlowspaceTrackingResponse>(
      `tracking/${trackingNumber}`,
    )
    return transformTrackingResponse(raw)
  }

  async listTrackingEvents(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<TrackingEvent[]> {
    const client = new FlowspaceClient(credentials)
    const res = await client.get<{ data?: FlowspaceTrackingResponse[] }>(
      'tracking',
      {
        limit: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      },
    )
    return (res.data ?? []).flatMap(transformTrackingResponse)
  }
}
