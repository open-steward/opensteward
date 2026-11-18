// ── Resource coverage ──────────────────────────────────────────────────────────
// Unavailable: carrier   — Janio is a single-carrier platform; no carrier list endpoint exists
// Unavailable: warehouse — Janio is a cross-border carrier, not a WMS; no warehouse API
// Unverified:  rate      — apidocs.janio.asia is a JS SPA with an invalid TLS cert; could not confirm a rate endpoint
// Unverified:  manifest  — apidocs.janio.asia is a JS SPA with an invalid TLS cert; could not confirm a manifest endpoint

import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Order } from '../../schema/order'
import type { Label } from '../../schema/label'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { JanioClient } from './client'

import { transformTracking, type JanioTrackingResponse } from './transform/tracking'
import { transformShipment, type JanioOrder } from './transform/shipment'
import { transformOrder } from './transform/order'
import { transformLabel } from './transform/label'

interface JanioAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class JanioAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'janio'
  readonly version = '1'

  constructor(_config: JanioAdapterConfig = {}) {}

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

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new JanioClient(credentials)
    const raw = await client.get<JanioTrackingResponse>(`orders/${trackingNumber}/tracking`)
    return transformTracking(raw)
  }

  // ── Orders ─────────────────────────────────────────────────────────────────
  // Janio calls its shipments "orders" internally.  The same /orders endpoint
  // powers both the Shipment and Order resources.

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new JanioClient(credentials)
    const raw = await client.get<{ results: JanioOrder[] }>('orders', params as Record<string, unknown>)
    return (raw.results ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new JanioClient(credentials)
    const raw = await client.get<JanioOrder>(`orders/${id}`)
    return transformOrder(raw)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────
  // Janio embeds label_url on every order response; there is no separate /labels
  // endpoint.  Labels are derived from the /orders collection.

  async listLabels(credentials: Credentials, params: QueryParams): Promise<Label[]> {
    const client = new JanioClient(credentials)
    const raw = await client.get<{ results: JanioOrder[] }>('orders', params as Record<string, unknown>)
    return (raw.results ?? [])
      .filter((o) => o.label_url != null)
      .map(transformLabel)
  }

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new JanioClient(credentials)
    const raw = await client.get<JanioOrder>(`orders/${id}`)
    return transformLabel(raw)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new JanioClient(credentials)
    const raw = await client.post<JanioOrder>('orders', {
      sender: data.originAddress
        ? {
            name: data.originAddress.name,
            company: data.originAddress.company,
            address_line1: data.originAddress.street1,
            address_line2: data.originAddress.street2,
            city: data.originAddress.city,
            postal_code: data.originAddress.postalCode,
            country: data.originAddress.country,
            phone: data.originAddress.phone,
            email: data.originAddress.email,
          }
        : undefined,
      recipient: data.destinationAddress
        ? {
            name: data.destinationAddress.name,
            company: data.destinationAddress.company,
            address_line1: data.destinationAddress.street1,
            address_line2: data.destinationAddress.street2,
            city: data.destinationAddress.city,
            postal_code: data.destinationAddress.postalCode,
            country: data.destinationAddress.country,
            phone: data.destinationAddress.phone,
            email: data.destinationAddress.email,
          }
        : undefined,
      weight: data.totalWeight?.value,
      weight_unit: data.totalWeight?.unit ?? 'kg',
      service_code: data.serviceCode,
      reference: data.reference,
    })
    return transformShipment(raw)
  }
}
