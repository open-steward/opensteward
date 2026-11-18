import { simpleApiKey } from '@opensteward/shared'
import type { LogisticsAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { Order } from '../../schema/order'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { WebhookEvent } from '../../schema/webhook'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { JeeblyClient } from './client'
import { JEEBLY_SWAGGER_URL } from './constants'

import { transformJeeblyShipment, type JeeblyShipment } from './transform/shipment'

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: carrier   — Jeebly is a single-carrier MENA last-mile platform; no carrier management endpoints exist
// Unavailable: warehouse — Jeebly has no warehouse or fulfillment-centre endpoints
// Unavailable: label, manifest, rate — the public Swagger spec (JEEBLY_SWAGGER_URL, no auth needed)
//              has no label, manifest or rate operation
// Unavailable: shipment, order, trackingevent reads — see NO_READ_ENDPOINTS below

// The spec's paths, verbatim. createShipment (POST shipments) and cancelOrder
// (POST orders/{id}/cancel) still call the undocumented api.jeebly.com host;
// they are writes and outside this rebuild.
const NO_READ_ENDPOINTS =
  'the published spec (' +
  JEEBLY_SWAGGER_URL +
  ') has only PATCH /api/v1/integrations/api_order_update/{slug}, POST /api/v1/integrations/generate_token, ' +
  'GET /api/v1/integrations/order/cancel/{slug}, PATCH /api/v1/integrations/order/cancel_v2/{slug}, ' +
  'PATCH /api/v1/integrations/order/return/{slug} and POST /api/v1/integrations/order_location_wise; ' +
  'none lists or reads shipments, orders or tracking'

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

interface JeeblyAdapterConfig {
  scopes?: string[]
}

const SIMPLE_API_KEY_FORM = simpleApiKey()

export class JeeblyAdapter implements LogisticsAdapter {
  // Connect Link support — single API-key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'jeebly'
  readonly version = '1'

  constructor(_config: JeeblyAdapterConfig = {}) {}

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // For Jeebly the "code" is the API key itself.
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Webhook ────────────────────────────────────────────────────────────────

  verifyWebhook(_payload: Buffer, _headers: Record<string, string>, _secret: string): boolean {
    // Jeebly does not publish a webhook signature scheme in their public docs.
    // Always return false until a verified signing mechanism is documented.
    return false
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    const eventType = String(payload['event'] ?? payload['type'] ?? '')
    const data = payload['data'] as Record<string, unknown> | undefined
    const resourceId = data ? String(data['id'] ?? data['awb'] ?? '') : undefined

    // Map Jeebly event type to canonical resource type and action.
    type CanonicalResource = WebhookEvent['resourceType']
    type CanonicalAction = WebhookEvent['action']

    let resourceType: CanonicalResource | undefined
    let action: CanonicalAction = 'updated'

    if (eventType.includes('shipment')) {
      resourceType = 'shipment'
      if (eventType.includes('created')) action = 'created'
      else if (eventType.includes('cancelled') || eventType.includes('canceled'))
        action = 'cancelled'
      else action = 'updated'
    } else if (eventType.includes('track') || eventType.includes('status')) {
      resourceType = 'tracking_event'
      action = 'updated'
    }

    if (!resourceType) return []

    return [
      {
        platform: 'jeebly',
        type: eventType,
        resourceType,
        action,
        resourceId: resourceId || undefined,
        payload,
      },
    ]
  }

  // ── Reads ──────────────────────────────────────────────────────────────
  // Jeebly's only published API is the Swagger spec at JEEBLY_SWAGGER_URL.
  // Its six operations are order writes and token generation; it has no
  // endpoint that lists or reads shipments, orders or tracking. Every read
  // refuses before sending anything.

  async listShipments(_credentials: Credentials, _params: QueryParams): Promise<Shipment[]> {
    throw notSupported(`Jeebly cannot list shipments: ${NO_READ_ENDPOINTS}`)
  }

  async getShipment(_credentials: Credentials, _id: string): Promise<Shipment> {
    throw notSupported(`Jeebly cannot read shipments: ${NO_READ_ENDPOINTS}`)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new JeeblyClient(credentials)
    const body: Record<string, unknown> = {
      reference: data.reference,
      service_type: data.serviceCode,
      notes: data.notes,
    }

    if (data.destinationAddress) {
      body.consignee = {
        name: data.destinationAddress.name,
        company: data.destinationAddress.company,
        address_line1: data.destinationAddress.street1,
        address_line2: data.destinationAddress.street2,
        city: data.destinationAddress.city,
        state: data.destinationAddress.state,
        country: data.destinationAddress.country,
        postal_code: data.destinationAddress.postalCode,
        phone: data.destinationAddress.phone,
        email: data.destinationAddress.email,
      }
    }

    if (data.originAddress) {
      body.shipper = {
        name: data.originAddress.name,
        company: data.originAddress.company,
        address_line1: data.originAddress.street1,
        address_line2: data.originAddress.street2,
        city: data.originAddress.city,
        state: data.originAddress.state,
        country: data.originAddress.country,
        postal_code: data.originAddress.postalCode,
        phone: data.originAddress.phone,
        email: data.originAddress.email,
      }
    }

    if (data.totalWeight) {
      body.weight = data.totalWeight.value
      body.weight_unit = data.totalWeight.unit
    }

    if (data.cost) {
      body.cod_amount = data.cost.amount
      body.currency = data.cost.currency
    }

    const res = await client.post<{ data: JeeblyShipment } | JeeblyShipment>('shipments', body)
    const raw = 'data' in res && res.data ? (res.data as JeeblyShipment) : (res as JeeblyShipment)
    return transformJeeblyShipment(raw)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(_credentials: Credentials, _params: QueryParams): Promise<Order[]> {
    throw notSupported(`Jeebly cannot list orders: ${NO_READ_ENDPOINTS}`)
  }

  async getOrder(_credentials: Credentials, _id: string): Promise<Order> {
    throw notSupported(`Jeebly cannot read orders: ${NO_READ_ENDPOINTS}`)
  }

  async cancelOrder(credentials: Credentials, id: string): Promise<void> {
    const client = new JeeblyClient(credentials)
    await client.post<unknown>(`orders/${id}/cancel`, {})
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(
    _credentials: Credentials,
    _trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    throw notSupported(`Jeebly cannot read tracking events: ${NO_READ_ENDPOINTS}`)
  }

  async listTrackingEvents(
    _credentials: Credentials,
    _params: QueryParams,
  ): Promise<TrackingEvent[]> {
    throw notSupported(`Jeebly cannot list tracking events: ${NO_READ_ENDPOINTS}`)
  }
}
