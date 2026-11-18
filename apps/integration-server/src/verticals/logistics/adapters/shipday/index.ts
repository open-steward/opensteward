import { simpleApiKey } from '@opensteward/shared'
import type { LogisticsAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { Order } from '../../schema/order'
import type { Carrier } from '../../schema/carrier'
import type { TrackingEvent } from '../../schema/trackingevent'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { ShipdayClient } from './client'
import { transformOrder, type ShipdayOrder } from './transform/order'
import { transformShipment } from './transform/shipment'
import { transformTracking } from './transform/tracking'
import { transformCarrier, type ShipdayCarrier } from './transform/carrier'

const SIMPLE_API_KEY_FORM = simpleApiKey()

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: label    — Shipday is a last-mile dispatch platform; it has no label-generation API (confirmed via docs.shipday.com/llms.txt)
// Unavailable: manifest — no manifest/SCAN-form concept exists in the Shipday API
// Unavailable: rate     — Shipday does not expose a rating/quoting endpoint
// Unavailable: warehouse — Shipday has no warehouse management API

/**
 * Shipday logistics adapter.
 *
 * Shipday is a last-mile delivery dispatch platform.  It models deliveries as
 * "orders" rather than shipments, so several of the canonical logistics
 * interfaces (listShipments, createShipment, getTrackingEvents) project
 * Shipday orders onto the appropriate canonical schema.
 *
 * Authentication: HTTP Basic auth — API key as username, empty password.
 * Base URL: https://api.shipday.com/
 */
export class ShipdayAdapter implements LogisticsAdapter {
  // Connect Link support — single API-key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'shipday'
  readonly version = '1'

  getAuthUrl(state: string): string { return buildAuthUrl(state) }
  async exchangeCode(code: string, _ru: string): Promise<Credentials> { return exchangeApiKey(code) }
  async refreshCredentials(c: Credentials): Promise<Credentials> { return doRefresh(c) }

  // ─── Orders ───────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, _params: QueryParams): Promise<Order[]> {
    const client = new ShipdayClient(credentials)
    const raw = await client.get<ShipdayOrder[]>('orders')
    return (raw ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new ShipdayClient(credentials)
    // Shipday retrieves by orderNumber
    const raw = await client.get<ShipdayOrder>(`orders/${encodeURIComponent(id)}`)
    return transformOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new ShipdayClient(credentials)
    const body: Record<string, unknown> = {
      orderNumber: data.orderNumber ?? data.id,
      customerName: data.destinationAddress?.name,
      customerAddress: data.destinationAddress?.street1,
      customerEmail: data.destinationAddress?.email,
      customerPhoneNumber: data.destinationAddress?.phone,
      pickupName: data.originAddress?.name,
      pickupPhoneNumber: data.originAddress?.phone,
      pickupAddress: data.originAddress
        ? {
            street: data.originAddress.street1,
            city: data.originAddress.city,
            state: data.originAddress.state,
            zip: data.originAddress.postalCode,
            country: data.originAddress.country,
          }
        : undefined,
    }
    const raw = await client.post<ShipdayOrder>('orders', body)
    return transformOrder(raw)
  }

  async updateOrder(credentials: Credentials, id: string, data: Partial<Order>): Promise<Order> {
    const client = new ShipdayClient(credentials)
    const body: Record<string, unknown> = {
      customerName: data.destinationAddress?.name,
      customerAddress: data.destinationAddress?.street1,
      customerEmail: data.destinationAddress?.email,
      customerPhoneNumber: data.destinationAddress?.phone,
    }
    const raw = await client.put<ShipdayOrder>(
      `order/edit/${encodeURIComponent(id)}`,
      body,
    )
    return transformOrder(raw)
  }

  async cancelOrder(credentials: Credentials, id: string): Promise<void> {
    const client = new ShipdayClient(credentials)
    await client.delete<unknown>(`orders/${encodeURIComponent(id)}`)
  }

  // ─── Shipments (projected from orders) ───────────────────────────────────

  async listShipments(credentials: Credentials, _params: QueryParams): Promise<Shipment[]> {
    const client = new ShipdayClient(credentials)
    const raw = await client.get<ShipdayOrder[]>('orders')
    return (raw ?? []).map(transformShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new ShipdayClient(credentials)
    const raw = await client.get<ShipdayOrder>(`orders/${encodeURIComponent(id)}`)
    return transformShipment(raw)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new ShipdayClient(credentials)
    const body: Record<string, unknown> = {
      orderNumber: data.trackingNumber ?? data.reference ?? data.id,
      customerName: data.destinationAddress?.name,
      customerAddress: data.destinationAddress?.street1,
      customerEmail: data.destinationAddress?.email,
      customerPhoneNumber: data.destinationAddress?.phone,
      pickupName: data.originAddress?.name,
      pickupPhoneNumber: data.originAddress?.phone,
      pickupAddress: data.originAddress
        ? {
            street: data.originAddress.street1,
            city: data.originAddress.city,
            state: data.originAddress.state,
            zip: data.originAddress.postalCode,
            country: data.originAddress.country,
          }
        : undefined,
      notes: data.notes,
    }
    const raw = await client.post<ShipdayOrder>('orders', body)
    return transformShipment(raw)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new ShipdayClient(credentials)
    await client.delete<unknown>(`orders/${encodeURIComponent(id)}`)
  }

  // ─── Tracking ─────────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new ShipdayClient(credentials)
    const raw = await client.get<ShipdayOrder>(`orders/${encodeURIComponent(trackingNumber)}`)
    return transformTracking(raw)
  }

  // ─── Carriers (drivers) ───────────────────────────────────────────────────

  async listCarriers(credentials: Credentials, _params: QueryParams): Promise<Carrier[]> {
    const client = new ShipdayClient(credentials)
    const raw = await client.get<ShipdayCarrier[]>('carriers')
    return (raw ?? []).map(transformCarrier)
  }

  async getCarrier(credentials: Credentials, id: string): Promise<Carrier> {
    // Shipday does not expose a single-carrier GET; fetch all and find by id.
    const client = new ShipdayClient(credentials)
    const all = await client.get<ShipdayCarrier[]>('carriers')
    const found = (all ?? []).find(c => String(c.id) === id)
    if (!found) throw new Error(`Carrier ${id} not found`)
    return transformCarrier(found)
  }
}
