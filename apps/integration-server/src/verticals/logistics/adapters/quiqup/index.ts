import { createHmac, timingSafeEqual } from 'crypto'
import { oauth2ClientCredentials } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { Order } from '../../schema/order'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Label } from '../../schema/label'
import type { WebhookEvent } from '../../schema/webhook'

import { buildAuthUrl, exchangeClientCredentials, refreshCredentials as doRefresh } from './auth'
import { QuiqupClient } from './client'
import {
  QUIQUP_AUTH_BASE,
  QUIQUP_TOKEN_PATH,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  QUIQUP_SCOPES,
} from './constants'

import { transformShipment, type QuiqupDeliveryJob } from './transform/shipment'
import { transformOrder, type QuiqupOrder } from './transform/order'
import { transformTracking, type QuiqupTrackingResponse } from './transform/tracking'
import { transformRate, type QuiqupRate } from './transform/rate'
import { transformLabel, type QuiqupLabel } from './transform/label'

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: carrier   — Quiqup operates its own single-carrier fleet; the platform is
//                          not a multi-carrier marketplace and exposes no carrier-listing endpoint.
// Unavailable: warehouse — Quiqup is a last-mile delivery service, not a warehousing platform;
//                          no warehouse management API is documented or offered.
// Unverified:  manifest  — Manifestation is referenced as a feature by third-party integrators
//                          but no dedicated /manifests endpoint appears in accessible public
//                          API documentation.

export interface QuiqupAdapterConfig {
  clientId?: string
  clientSecret?: string
}

const CREDENTIAL_FORM = oauth2ClientCredentials({
  tokenUrl: `${QUIQUP_AUTH_BASE}${QUIQUP_TOKEN_PATH}`,
  scopes: QUIQUP_SCOPES,
})

export class QuiqupAdapter implements LogisticsAdapter {
  readonly platform = 'quiqup'
  readonly version = '1'

  // Connect Link — OAuth2 client_credentials form
  credentialFields = CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  private config: QuiqupAdapterConfig

  constructor(config: QuiqupAdapterConfig = {}) {
    this.config = config
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error('quiqup: clientId and clientSecret are required')
    }
    return exchangeClientCredentials({
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
    })
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Webhook ────────────────────────────────────────────────────────────────

  /**
   * Quiqup signs webhook payloads with HMAC-SHA256.
   * The hex digest is sent in the `X-Quiqup-Signature` header.
   */
  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    const signature = headers['x-quiqup-signature'] ?? ''
    const expected = createHmac('sha256', secret).update(payload).digest('hex')
    try {
      return timingSafeEqual(Buffer.from(signature, 'utf8'), Buffer.from(expected, 'utf8'))
    } catch {
      return false
    }
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    // Quiqup webhook envelope: { event: "order.updated", data: { id: "..." }, ... }
    const eventType = String(payload['event'] ?? '')
    const data = (payload['data'] ?? {}) as Record<string, unknown>
    const resourceId = data['id'] != null ? String(data['id']) : undefined

    // Map event type to canonical resource + action
    const [resource, rawAction] = eventType.split('.')

    type CanonicalResource = WebhookEvent['resourceType']
    const resourceTypeMap: Record<string, CanonicalResource> = {
      order: 'order',
      job: 'shipment',
      shipment: 'shipment',
      tracking: 'tracking_event',
      label: 'label',
    }

    const resourceType = resourceTypeMap[resource]
    if (!resourceType) return []

    type CanonicalAction = WebhookEvent['action']
    const actionMap: Record<string, CanonicalAction> = {
      created: 'created',
      updated: 'updated',
      deleted: 'deleted',
      cancelled: 'cancelled',
      canceled: 'cancelled',
      completed: 'updated',
      failed: 'updated',
      delivered: 'updated',
    }

    const action: CanonicalAction = actionMap[rawAction] ?? 'updated'

    return [
      {
        platform: 'quiqup',
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
    const client = new QuiqupClient(credentials)
    const res = await client.get<{ jobs: QuiqupDeliveryJob[] }>('jobs', {
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      page: params.page ?? 1,
    })
    return (res.jobs ?? []).map(transformShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new QuiqupClient(credentials)
    const raw = await client.get<QuiqupDeliveryJob>(`jobs/${id}`)
    return transformShipment(raw)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new QuiqupClient(credentials)
    const raw = await client.post<QuiqupDeliveryJob>('jobs', {
      reference: data.reference ?? undefined,
      service_type: data.serviceCode ?? undefined,
      pickup_address: data.originAddress
        ? {
            name: data.originAddress.name,
            company_name: data.originAddress.company,
            address_line_1: data.originAddress.street1,
            address_line_2: data.originAddress.street2,
            city: data.originAddress.city,
            postcode: data.originAddress.postalCode,
            country_code: data.originAddress.country,
            phone: data.originAddress.phone,
            email: data.originAddress.email,
          }
        : undefined,
      delivery_address: data.destinationAddress
        ? {
            name: data.destinationAddress.name,
            company_name: data.destinationAddress.company,
            address_line_1: data.destinationAddress.street1,
            address_line_2: data.destinationAddress.street2,
            city: data.destinationAddress.city,
            postcode: data.destinationAddress.postalCode,
            country_code: data.destinationAddress.country,
            phone: data.destinationAddress.phone,
            email: data.destinationAddress.email,
          }
        : undefined,
      weight_grams: data.totalWeight?.unit === 'g'
        ? data.totalWeight.value
        : data.totalWeight?.unit === 'kg'
          ? (data.totalWeight.value ?? 0) * 1000
          : undefined,
      notes: data.notes ?? undefined,
    })
    return transformShipment(raw)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new QuiqupClient(credentials)
    await client.patch<QuiqupDeliveryJob>(`jobs/${id}/cancel`, {})
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new QuiqupClient(credentials)
    const res = await client.get<{ orders: QuiqupOrder[] }>('orders', {
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      page: params.page ?? 1,
    })
    return (res.orders ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new QuiqupClient(credentials)
    const raw = await client.get<QuiqupOrder>(`orders/${id}`)
    return transformOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new QuiqupClient(credentials)
    const raw = await client.post<QuiqupOrder>('orders', {
      reference: data.orderNumber ?? undefined,
      pickup_address: data.originAddress
        ? {
            name: data.originAddress.name,
            company_name: data.originAddress.company,
            address_line_1: data.originAddress.street1,
            address_line_2: data.originAddress.street2,
            city: data.originAddress.city,
            postcode: data.originAddress.postalCode,
            country_code: data.originAddress.country,
            phone: data.originAddress.phone,
            email: data.originAddress.email,
          }
        : undefined,
      delivery_address: data.destinationAddress
        ? {
            name: data.destinationAddress.name,
            company_name: data.destinationAddress.company,
            address_line_1: data.destinationAddress.street1,
            address_line_2: data.destinationAddress.street2,
            city: data.destinationAddress.city,
            postcode: data.destinationAddress.postalCode,
            country_code: data.destinationAddress.country,
            phone: data.destinationAddress.phone,
            email: data.destinationAddress.email,
          }
        : undefined,
      service_type: data.requestedServiceCode ?? undefined,
      notes: data.notes ?? undefined,
    })
    return transformOrder(raw)
  }

  async updateOrder(credentials: Credentials, id: string, data: Partial<Order>): Promise<Order> {
    const client = new QuiqupClient(credentials)
    const raw = await client.patch<QuiqupOrder>(`orders/${id}`, {
      reference: data.orderNumber ?? undefined,
      notes: data.notes ?? undefined,
      service_type: data.requestedServiceCode ?? undefined,
    })
    return transformOrder(raw)
  }

  async cancelOrder(credentials: Credentials, id: string): Promise<void> {
    const client = new QuiqupClient(credentials)
    await client.patch<QuiqupOrder>(`orders/${id}/cancel`, {})
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new QuiqupClient(credentials)
    const raw = await client.get<QuiqupTrackingResponse>(`tracking/${trackingNumber}`)
    return transformTracking(raw)
  }

  async listTrackingEvents(credentials: Credentials, params: QueryParams): Promise<TrackingEvent[]> {
    const client = new QuiqupClient(credentials)
    const res = await client.get<{ items: QuiqupTrackingResponse[] }>('tracking', {
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      page: params.page ?? 1,
    })
    return (res.items ?? []).flatMap(transformTracking)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new QuiqupClient(credentials)
    const res = await client.post<{ rates: QuiqupRate[] }>('rates', {
      pickup_address: {
        address_line_1: params.originAddress.street1,
        city: params.originAddress.city,
        postcode: params.originAddress.postalCode,
        country_code: params.originAddress.country,
      },
      delivery_address: {
        address_line_1: params.destinationAddress.street1,
        city: params.destinationAddress.city,
        postcode: params.destinationAddress.postalCode,
        country_code: params.destinationAddress.country,
      },
      weight_grams: params.packages[0]?.weight
        ? params.packages[0].weight.unit === 'g'
          ? params.packages[0].weight.value
          : params.packages[0].weight.unit === 'kg'
            ? (params.packages[0].weight.value ?? 0) * 1000
            : undefined
        : undefined,
    })
    return (res.rates ?? []).map(transformRate)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new QuiqupClient(credentials)
    // Labels live on delivery jobs in Quiqup; id is a job id
    const job = await client.get<QuiqupDeliveryJob>(`jobs/${id}`)
    const labelRaw: QuiqupLabel = {
      url: job.label_url ?? undefined,
      status: job.status ?? undefined,
      created_at: job.created_at ?? undefined,
      updated_at: job.updated_at ?? undefined,
    }
    return transformLabel(labelRaw, job.id, job.tracking_number ?? undefined)
  }

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    if (!data.shipmentId) throw new Error('shipmentId is required to create a Quiqup label')
    const client = new QuiqupClient(credentials)
    const raw = await client.post<QuiqupLabel>(`jobs/${data.shipmentId}/label`, {
      format: data.format ?? 'PDF',
    })
    return transformLabel(raw, data.shipmentId, data.trackingNumber)
  }

  async voidLabel(credentials: Credentials, id: string): Promise<void> {
    const client = new QuiqupClient(credentials)
    await client.patch<QuiqupDeliveryJob>(`jobs/${id}/cancel`, {})
  }
}
