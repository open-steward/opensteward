// ── Resource coverage ──────────────────────────────────────────────
// Available:   order, shipment, trackingevent
// Unavailable: carrier  — Locate2u is a last-mile dispatch/routing platform; no carrier directory in the public API
// Unavailable: label    — Locate2u does not generate shipping labels; no label endpoint exists
// Unavailable: manifest — Locate2u has no manifest concept or endpoint
// Unavailable: rate     — Locate2u does not offer carrier rate shopping; no rate endpoint exists
// Unavailable: warehouse — No warehouse-location resource in the public API; /api/v1/items/scan etc. are for item-level tracking only
// ──────────────────────────────────────────────────────────────────

import { oauth2ClientCredentials } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { Order } from '../../schema/order'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { WebhookEvent } from '../../schema/webhook'

import { buildAuthUrl, exchangeCredentials, refreshCredentials as doRefresh } from './auth'
import { Locate2uClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, LOCATE2U_TOKEN_URL, LOCATE2U_SCOPE } from './constants'

import { transformShipment, type Locate2uShipment } from './transform/shipment'
import { transformOrder, type Locate2uOrder } from './transform/order'
import { transformTracking, type Locate2uTracking } from './transform/tracking'

export interface Locate2uAdapterConfig {
  clientId?: string
  clientSecret?: string
}

const CREDENTIAL_FORM = oauth2ClientCredentials({
  tokenUrl: LOCATE2U_TOKEN_URL,
  scopes: [LOCATE2U_SCOPE],
})

export class Locate2uAdapter implements LogisticsAdapter {
  readonly platform = 'locate2u'
  readonly version = '1'

  // ── Connect Link credential form (client credentials) ─────────────────────
  credentialFields = CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  private config: Locate2uAdapterConfig

  constructor(config: Locate2uAdapterConfig = {}) {
    this.config = config
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error('locate2u: clientId and clientSecret are required')
    }
    return exchangeCredentials({
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
    })
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────
  // Locate2u does not document a webhook signing scheme; verification is not supported.

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    // Locate2u webhook events carry an `event` field with the event type and
    // a `data` object containing the resource.
    // Documented event types:
    //   stop.assigned, stop.status-changed
    //   shipment.assigned, shipment.status-changed
    //   trip.status-changed, trip.created, trip.assigned
    //   note.created
    const eventType = String(payload['event'] ?? '')
    const data = (payload['data'] ?? payload) as Record<string, unknown>

    // Split on the first dot only — event names like "stop.status-changed"
    // have hyphens in the action part.
    const dotIndex = eventType.indexOf('.')
    if (dotIndex === -1) return []

    const resource = eventType.slice(0, dotIndex)
    const rawAction = eventType.slice(dotIndex + 1)

    type CanonicalResource = WebhookEvent['resourceType']
    const resourceTypeMap: Record<string, CanonicalResource> = {
      shipment: 'shipment',
      stop: 'order',
      trip: 'shipment',
      note: 'order',
    }

    const resourceType = resourceTypeMap[resource]
    if (!resourceType) return []

    type CanonicalAction = WebhookEvent['action']
    const actionMap: Record<string, CanonicalAction> = {
      created: 'created',
      assigned: 'updated',
      'status-changed': 'updated',
      updated: 'updated',
      deleted: 'deleted',
      cancelled: 'cancelled',
      completed: 'updated',
      accepted: 'updated',
      discarded: 'cancelled',
    }

    const action: CanonicalAction = actionMap[rawAction] ?? 'updated'

    const shipmentId = data['shipmentId'] ?? data['stopId'] ?? data['tripId']
    const resourceId = shipmentId != null ? String(shipmentId) : undefined

    return [
      {
        platform: 'locate2u',
        type: eventType,
        resourceType,
        action,
        resourceId,
        payload,
      },
    ]
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new Locate2uClient(credentials)
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<Locate2uShipment[] | { items?: Locate2uShipment[] }>('shipments', {
      pageSize: limit,
      page: params.page ?? 1,
    })
    const items = Array.isArray(res) ? res : (res.items ?? [])
    return items.map(transformShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new Locate2uClient(credentials)
    const raw = await client.get<Locate2uShipment>(`shipments/${id}`)
    return transformShipment(raw)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new Locate2uClient(credentials)

    const body: Record<string, unknown> = {
      shipmentRef: data.reference,
      notes: data.notes,
      load: data.totalWeight
        ? { weight: data.totalWeight.value }
        : undefined,
    }

    if (data.originAddress) {
      body.pickupStop = {
        address: [
          data.originAddress.street1,
          data.originAddress.street2,
          data.originAddress.city,
          data.originAddress.state,
          data.originAddress.postalCode,
          data.originAddress.country,
        ]
          .filter(Boolean)
          .join(', '),
        contact: {
          name: data.originAddress.name,
          phone: data.originAddress.phone,
          email: data.originAddress.email,
        },
      }
    }

    if (data.destinationAddress) {
      body.dropStop = {
        address: [
          data.destinationAddress.street1,
          data.destinationAddress.street2,
          data.destinationAddress.city,
          data.destinationAddress.state,
          data.destinationAddress.postalCode,
          data.destinationAddress.country,
        ]
          .filter(Boolean)
          .join(', '),
        contact: {
          name: data.destinationAddress.name,
          phone: data.destinationAddress.phone,
          email: data.destinationAddress.email,
        },
      }
    }

    const raw = await client.post<Locate2uShipment>('shipments', body)
    return transformShipment(raw)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new Locate2uClient(credentials)
    await client.post<unknown>(`shipments/${id}/discard`, {})
  }

  // ── Orders (via stops) ─────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new Locate2uClient(credentials)
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<Locate2uOrder[] | { items?: Locate2uOrder[] }>('stops', {
      pageSize: limit,
      page: params.page ?? 1,
    })
    const items = Array.isArray(res) ? res : (res.items ?? [])
    return items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new Locate2uClient(credentials)
    const raw = await client.get<Locate2uOrder>(`stops/${id}`)
    return transformOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new Locate2uClient(credentials)

    const body: Record<string, unknown> = {
      name: data.orderNumber,
      notes: data.notes,
    }

    if (data.destinationAddress) {
      body.address = [
        data.destinationAddress.street1,
        data.destinationAddress.street2,
        data.destinationAddress.city,
        data.destinationAddress.state,
        data.destinationAddress.postalCode,
        data.destinationAddress.country,
      ]
        .filter(Boolean)
        .join(', ')

      body.contact = {
        name: data.destinationAddress.name,
        phone: data.destinationAddress.phone,
        email: data.destinationAddress.email,
      }
    }

    if (data.customerId) {
      const parsed = parseInt(data.customerId, 10)
      body.customerId = isNaN(parsed) ? undefined : parsed
    }

    const raw = await client.post<Locate2uOrder>('stops', body)
    return transformOrder(raw)
  }

  async cancelOrder(credentials: Credentials, id: string): Promise<void> {
    const client = new Locate2uClient(credentials)
    await client.post<unknown>(`stops/${id}/discard`, {})
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new Locate2uClient(credentials)
    // Locate2u identifies shipments by ID; trackingNumber maps to shipmentRef.
    const raw = await client.get<Locate2uTracking>(`shipments/${trackingNumber}`)
    return transformTracking(raw)
  }

  async listTrackingEvents(credentials: Credentials, params: QueryParams): Promise<TrackingEvent[]> {
    const client = new Locate2uClient(credentials)
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<Locate2uTracking[] | { items?: Locate2uTracking[] }>('shipments', {
      pageSize: limit,
      page: params.page ?? 1,
    })
    const items = Array.isArray(res) ? res : (res.items ?? [])
    return items.flatMap(transformTracking)
  }
}
