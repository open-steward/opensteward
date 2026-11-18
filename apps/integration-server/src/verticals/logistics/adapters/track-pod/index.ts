// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: carrier   — Track-POD API only exposes Address/Route/Order/Driver/Test/Vehicle; no carrier endpoint.
// Unavailable: label     — Track-POD API only exposes Address/Route/Order/Driver/Test/Vehicle; no label endpoint.
// Unavailable: manifest  — Track-POD API only exposes Address/Route/Order/Driver/Test/Vehicle; no manifest endpoint.
// Unavailable: rate      — Track-POD API only exposes Address/Route/Order/Driver/Test/Vehicle; no rate-quoting endpoint.
// Unavailable: warehouse — Track-POD API only exposes Address/Route/Order/Driver/Test/Vehicle; no warehouse/depot list endpoint.

import { simpleApiKey } from '@opensteward/shared'
import type { LogisticsAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { Order } from '../../schema/order'
import type { TrackingEvent } from '../../schema/trackingevent'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { TrackPodClient } from './client'
import {
  transformOrder,
  buildNewOrder,
  type TrackPodOrder,
} from './transform/order'
import { transformShipment } from './transform/shipment'
import { transformTracking } from './transform/tracking'
export { trackPodWebhook } from './webhook'

const SIMPLE_API_KEY_FORM = simpleApiKey()

export class TrackPodAdapter implements LogisticsAdapter {
  // Connect Link support — single API-key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'track-pod'
  readonly version = '1'

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ─── Orders ──────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new TrackPodClient(credentials)
    // Use today's date when no specific date is provided
    const date = (params.date as string | undefined) ?? new Date().toISOString().slice(0, 10)
    const raw = await client.get<TrackPodOrder[]>(`Order/Date/${date}`)
    return (raw ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new TrackPodClient(credentials)
    const raw = await client.get<TrackPodOrder>(`Order/Number/${encodeURIComponent(id)}`)
    return transformOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new TrackPodClient(credentials)
    const body = buildNewOrder(data)
    const raw = await client.post<TrackPodOrder>('Order', body)
    return transformOrder(raw)
  }

  async updateOrder(credentials: Credentials, id: string, data: Partial<Order>): Promise<Order> {
    const client = new TrackPodClient(credentials)
    const body = { ...buildNewOrder(data), Number: id }
    const raw = await client.put<TrackPodOrder>('Order', body)
    return transformOrder(raw)
  }

  async cancelOrder(credentials: Credentials, id: string): Promise<void> {
    const client = new TrackPodClient(credentials)
    await client.delete(`Order/Number/${encodeURIComponent(id)}`)
  }

  // ─── Shipments ───────────────────────────────────────────────────────────────

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new TrackPodClient(credentials)
    const date = (params.date as string | undefined) ?? new Date().toISOString().slice(0, 10)
    const raw = await client.get<TrackPodOrder[]>(`Order/Date/${date}`)
    return (raw ?? []).map(transformShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new TrackPodClient(credentials)
    const raw = await client.get<TrackPodOrder>(`Order/Number/${encodeURIComponent(id)}`)
    return transformShipment(raw)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new TrackPodClient(credentials)
    const body: Record<string, unknown> = {
      Number: data.reference,
      Note: data.notes,
      ContactName: data.destinationAddress?.name,
      Phone: data.destinationAddress?.phone,
      Email: data.destinationAddress?.email,
      Address: data.destinationAddress?.street1,
    }
    const raw = await client.post<TrackPodOrder>('Order', body)
    return transformShipment(raw)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new TrackPodClient(credentials)
    await client.delete(`Order/Number/${encodeURIComponent(id)}`)
  }

  // ─── Tracking Events ─────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new TrackPodClient(credentials)
    const raw = await client.get<TrackPodOrder>(`Order/TrackId/${encodeURIComponent(trackingNumber)}`)
    return transformTracking(raw)
  }

  async listTrackingEvents(credentials: Credentials, params: QueryParams): Promise<TrackingEvent[]> {
    const client = new TrackPodClient(credentials)
    const date = (params.date as string | undefined) ?? new Date().toISOString().slice(0, 10)
    const raw = await client.get<TrackPodOrder[]>(`Order/Status/Date/${date}`)
    return (raw ?? []).flatMap(transformTracking)
  }
}
