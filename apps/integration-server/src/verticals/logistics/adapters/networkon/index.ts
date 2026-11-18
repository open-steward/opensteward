// ── Resource coverage ──────────────────────────────────────────────
// Unverified: carrier   — NetworkON API docs are not publicly accessible; no confirmed /carriers endpoint found in any public source
// Unverified: label     — NetworkON API docs are not publicly accessible; no confirmed /labels endpoint found in any public source
// Unverified: manifest  — NetworkON API docs are not publicly accessible; no confirmed /manifests endpoint found in any public source
// Unverified: rate      — NetworkON API docs are not publicly accessible; no confirmed /rates endpoint found in any public source
// Unverified: warehouse — NetworkON API docs are not publicly accessible; no confirmed /warehouses endpoint found in any public source

import { simpleApiKey } from '@opensteward/shared'
import type { LogisticsAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { Order } from '../../schema/order'
import type { TrackingEvent } from '../../schema/trackingevent'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { NetworkONClient } from './client'
import { transformShipment, type NetworkONShipment } from './transform/shipment'
import { transformTrackingEvent, type NetworkONTrackingEvent } from './transform/tracking'
import { transformOrder, type NetworkONOrder } from './transform/order'

const SIMPLE_API_KEY_FORM = simpleApiKey()

// NetworkON REST API responses are either the resource directly or wrapped in
// a `{ data: T }` envelope. This helper unwraps either shape.
type Envelope<T> = { data: T; [key: string]: unknown }

function unwrap<T>(raw: T | Envelope<T>): T {
  if (raw !== null && typeof raw === 'object' && 'data' in (raw as object)) {
    return (raw as Envelope<T>).data
  }
  return raw as T
}

function unwrapList<T>(raw: T[] | Envelope<T[]>): T[] {
  if (Array.isArray(raw)) return raw
  if (raw !== null && typeof raw === 'object' && 'data' in (raw as object)) {
    const d = (raw as Envelope<T[]>).data
    return Array.isArray(d) ? d : []
  }
  return []
}

export class NetworkONAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'networkon'
  readonly version = '1'

  getAuthUrl(state: string): string { return buildAuthUrl(state) }
  async exchangeCode(code: string, _ru: string): Promise<Credentials> { return exchangeApiKey(code) }
  async refreshCredentials(c: Credentials): Promise<Credentials> { return doRefresh(c) }

  // ─── Shipments ──────────────────────────────────────────────────────────────

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new NetworkONClient(credentials)
    const raw = await client.get<NetworkONShipment[] | Envelope<NetworkONShipment[]>>('shipments', params as Record<string, unknown>)
    return unwrapList(raw).map(transformShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new NetworkONClient(credentials)
    const raw = await client.get<NetworkONShipment | Envelope<NetworkONShipment>>(`shipments/${id}`)
    return transformShipment(unwrap(raw))
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new NetworkONClient(credentials)
    const raw = await client.post<NetworkONShipment | Envelope<NetworkONShipment>>('shipments', {
      reference: data.reference,
      service_code: data.serviceCode,
      notes: data.notes,
      origin: data.originAddress,
      destination: data.destinationAddress,
    })
    return transformShipment(unwrap(raw))
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new NetworkONClient(credentials)
    await client.put<unknown>(`shipments/${id}/cancel`, {})
  }

  // ─── Orders ─────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new NetworkONClient(credentials)
    const raw = await client.get<NetworkONOrder[] | Envelope<NetworkONOrder[]>>('orders', params as Record<string, unknown>)
    return unwrapList(raw).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new NetworkONClient(credentials)
    const raw = await client.get<NetworkONOrder | Envelope<NetworkONOrder>>(`orders/${id}`)
    return transformOrder(unwrap(raw))
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new NetworkONClient(credentials)
    const raw = await client.post<NetworkONOrder | Envelope<NetworkONOrder>>('orders', {
      order_number: data.orderNumber,
      notes: data.notes,
      service_code: data.requestedServiceCode,
      origin: data.originAddress,
      destination: data.destinationAddress,
      items: (data.lineItems ?? []).map((li) => ({
        id: li.id,
        sku: li.sku,
        name: li.name,
        description: li.description,
        quantity: li.quantity,
        unit_price: li.unitAmount,
        total_price: li.totalAmount,
      })),
    })
    return transformOrder(unwrap(raw))
  }

  async updateOrder(credentials: Credentials, id: string, data: Partial<Order>): Promise<Order> {
    const client = new NetworkONClient(credentials)
    const raw = await client.put<NetworkONOrder | Envelope<NetworkONOrder>>(`orders/${id}`, {
      order_number: data.orderNumber,
      notes: data.notes,
      service_code: data.requestedServiceCode,
      destination: data.destinationAddress,
    })
    return transformOrder(unwrap(raw))
  }

  async cancelOrder(credentials: Credentials, id: string): Promise<void> {
    const client = new NetworkONClient(credentials)
    await client.put<unknown>(`orders/${id}/cancel`, {})
  }

  // ─── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new NetworkONClient(credentials)
    const raw = await client.get<NetworkONTrackingEvent[] | Envelope<NetworkONTrackingEvent[]>>(
      `tracking/${trackingNumber}/events`,
    )
    return unwrapList(raw).map(transformTrackingEvent)
  }

  async listTrackingEvents(credentials: Credentials, params: QueryParams): Promise<TrackingEvent[]> {
    const client = new NetworkONClient(credentials)
    const raw = await client.get<NetworkONTrackingEvent[] | Envelope<NetworkONTrackingEvent[]>>(
      'tracking/events',
      params as Record<string, unknown>,
    )
    return unwrapList(raw).map(transformTrackingEvent)
  }
}
