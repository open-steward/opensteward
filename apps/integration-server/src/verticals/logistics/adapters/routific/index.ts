import { simpleApiKey } from '@opensteward/shared'
import type { LogisticsAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Order } from '../../schema/order'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { RoutificClient } from './client'
import { ROUTIFIC_PLATFORM_API_BASE, ROUTIFIC_PLATFORM_API_V2_BASE } from './constants'
import { transformTracking, type RoutificVisit } from './transform/tracking'
import { transformShipment, type RoutificVisitShipment } from './transform/shipment'
import { transformOrder, type RoutificOrder } from './transform/order'

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: carrier   — Routific is a route-optimization platform; it has no carrier/shipping-carrier concept or API
// Unavailable: label     — Routific has no shipping label creation or retrieval endpoints
// Unavailable: manifest  — Routific has no manifest endpoints; route printing is done via the UI only
// Unavailable: rate      — Routific has no rate-shopping or rate-retrieval endpoints
// Unavailable: warehouse — Routific has no warehouse management endpoints

const SIMPLE_API_KEY_FORM = simpleApiKey()

export class RoutificAdapter implements LogisticsAdapter {
  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'routific'
  readonly version = '1'

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }
  async exchangeCode(code: string, _ru: string): Promise<Credentials> {
    return exchangeApiKey(code)
  }
  async refreshCredentials(c: Credentials): Promise<Credentials> {
    return doRefresh(c)
  }

  async getTrackingEvents(
    credentials: Credentials,
    trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    const client = new RoutificClient(credentials)
    const raw = await client.get<RoutificVisit>(`visits/${trackingNumber}`)
    return transformTracking(raw)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new RoutificClient(credentials)
    const raw = await client.post<RoutificVisitShipment>('visits', {
      location: { address: data.destinationAddress?.street1, name: data.destinationAddress?.name },
      custom_notes: data.notes,
    })
    return transformShipment(raw)
  }

  /**
   * Routific's Platform API has no order collection. Its docs index
   * (https://api-docs.routific.com/llms.txt) lists Create orders, Fetch order,
   * Fetch photos, Update order, Update order completion, Delete single order,
   * Delete multiple orders and Fetch order action status, and Fetch order is a
   * single-record read of /v2/orders/{orderUuid}.
   */
  async listOrders(_credentials: Credentials, _params: QueryParams): Promise<Order[]> {
    throw Object.assign(
      new Error(
        'Routific cannot list orders: the Platform API documents no order-list endpoint, only "Fetch order" (GET https://api.plan.routific.com/v2/orders/{orderUuid}) by uuid',
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }

  /** Fetch order: GET https://api.plan.routific.com/v2/orders/{orderUuid}. */
  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new RoutificClient(credentials, ROUTIFIC_PLATFORM_API_V2_BASE)
    const raw = await client.get<RoutificOrder>(`orders/${encodeURIComponent(id)}`)
    return transformOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new RoutificClient(credentials, ROUTIFIC_PLATFORM_API_BASE)
    const workspaceId = (data.metadata as Record<string, unknown> | undefined)?.workspaceId as
      string | undefined
    const payload = [
      {
        name: data.destinationAddress?.name,
        locations: data.destinationAddress
          ? [{ address: data.destinationAddress.street1 }]
          : undefined,
        phone: data.destinationAddress?.phone,
        email: data.destinationAddress?.email,
        customerOrderNumber: data.orderNumber,
        instructions: data.notes,
        deliveryDate: data.orderAt ? (data.orderAt as Date).toISOString().slice(0, 10) : undefined,
      },
    ]
    const path = workspaceId ? `orders?workspaceId=${encodeURIComponent(workspaceId)}` : 'orders'
    const res = await client.post<{ data?: RoutificOrder[] }>(path, payload)
    const created = Array.isArray(res.data) ? res.data[0] : undefined
    if (!created) throw new Error('routific: createOrder returned no data')
    return transformOrder(created)
  }

  async updateOrder(credentials: Credentials, id: string, data: Partial<Order>): Promise<Order> {
    const client = new RoutificClient(credentials, ROUTIFIC_PLATFORM_API_BASE)
    const payload = {
      name: data.destinationAddress?.name,
      locations: data.destinationAddress
        ? [{ address: data.destinationAddress.street1 }]
        : undefined,
      phone: data.destinationAddress?.phone,
      email: data.destinationAddress?.email,
      customerOrderNumber: data.orderNumber,
      instructions: data.notes,
      deliveryDate: data.orderAt ? (data.orderAt as Date).toISOString().slice(0, 10) : undefined,
    }
    const raw = await client.put<RoutificOrder>(`orders/${id}`, payload)
    return transformOrder(raw)
  }
}
