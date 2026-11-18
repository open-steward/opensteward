// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: carrier   — Bringg carriers are external fleet integrations; no partner_api endpoint to enumerate them
// Unavailable: rate      — No shipping rate/quote endpoint in the partner_api
// Unverified:  label     — Package label generation uses service-GUID endpoints (per-merchant config), no partner_api/labels REST path confirmed
// Unverified:  manifest  — Create Manifest exists only in v2 Delivery Hub API (us2-api.bringg.com/v2/), not the partner_api base
// Unverified:  warehouse — Teams listing uses service-GUID endpoints (per-merchant config), no partner_api/teams REST path confirmed

import { simpleApiKey } from '@opensteward/shared'
import type { LogisticsAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Order } from '../../schema/order'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { BringgClient } from './client'
import { transformTracking, type BringgTask } from './transform/tracking'
import { transformShipment, type BringgShipment } from './transform/shipment'
import { transformOrder, type BringgOrder } from './transform/order'
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class BringgAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'bringg'
  readonly version = '1'

  getAuthUrl(state: string): string { return buildAuthUrl(state) }
  async exchangeCode(code: string, _ru: string): Promise<Credentials> { return exchangeApiKey(code) }
  async refreshCredentials(c: Credentials): Promise<Credentials> { return doRefresh(c) }

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new BringgClient(credentials)
    const raw = await client.get<BringgTask>(`tasks/${trackingNumber}`)
    return transformTracking(raw)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new BringgClient(credentials)
    const raw = await client.post<BringgShipment>('tasks', {
      external_id: data.reference,
      title: data.notes,
      way_points: [
        ...(data.originAddress ? [{ address: data.originAddress.street1, customer_name: data.originAddress.name, phone: data.originAddress.phone }] : []),
        ...(data.destinationAddress ? [{ address: data.destinationAddress.street1, customer_name: data.destinationAddress.name, phone: data.destinationAddress.phone }] : []),
      ],
    })
    return transformShipment(raw)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new BringgClient(credentials)
    const raw = await client.get<BringgOrder>(`tasks/${id}`)
    return transformOrder(raw)
  }

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new BringgClient(credentials)
    const raw = await client.get<BringgOrder[]>('tasks', params as Record<string, unknown>)
    return Array.isArray(raw) ? raw.map(transformOrder) : []
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new BringgClient(credentials)
    const wps = [
      ...(data.originAddress ? [{ address: data.originAddress.street1, customer_name: data.originAddress.name, phone: data.originAddress.phone }] : []),
      ...(data.destinationAddress ? [{ address: data.destinationAddress.street1, customer_name: data.destinationAddress.name, phone: data.destinationAddress.phone }] : []),
    ]
    const raw = await client.post<BringgOrder>('tasks', {
      external_id: data.orderNumber,
      note: data.notes,
      team_id: data.warehouseId != null ? Number(data.warehouseId) : undefined,
      way_points: wps.length > 0 ? wps : undefined,
    })
    return transformOrder(raw)
  }
}
