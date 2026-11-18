import { pageLocally, reportUpstreamPage, simpleApiKey } from '@opensteward/shared'
import { timingSafeEqual } from 'crypto'
import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { Order } from '../../schema/order'
import type { Carrier } from '../../schema/carrier'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { WebhookEvent } from '../../schema/webhook'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { TransportifyClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformShipment, type TransportifyDelivery } from './transform/shipment'
import { transformOrder, type TransportifyOrderDelivery } from './transform/order'
import { transformTrackingEvents, type TransportifyTrackingDelivery } from './transform/tracking'
import { transformRate, type TransportifyQuoteEntry } from './transform/rate'
import { transformCarrier, type TransportifyVehicleType } from './transform/carrier'

interface TransportifyAdapterConfig {
  // Optional: override base URL (e.g. sandbox).
  baseUrl?: string
}

const SIMPLE_API_KEY_FORM = simpleApiKey()

interface TransportifyDeliveriesResponse {
  pagination?: {
    total_count: number
    per_page: number
    next_page: string | null
    previous_page: string | null
  }
  data: TransportifyDelivery[]
}

interface TransportifyQuoteResponse {
  data?: TransportifyQuoteEntry[]
}

interface TransportifyVehicleTypesResponse {
  data?: TransportifyVehicleType[]
}

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: label    — Transportify is a courier booking platform; drivers handle pickup/delivery without generating shipping labels via API
// Unavailable: manifest — no manifest concept exists in the Deliveree/Transportify public API
// Unavailable: warehouse — no warehouse or storage management concept in the public API

/**
 * One caller page of `GET /deliveries`, reporting the upstream end.
 *
 * https://developers.deliveree.com/ — "Use the page parameter to navigate
 * through pages [...] you can adjust the page size using the per_page
 * parameter, supporting custom sizes of up to 100 items per page", and the
 * response's `pagination.next_page` is the "Query string for the next page".
 */
async function getDeliveriesPage(
  client: TransportifyClient,
  params: QueryParams,
  extra: Record<string, unknown>,
): Promise<TransportifyDeliveriesResponse> {
  const perPage = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
  const res = await client.get<TransportifyDeliveriesResponse>('deliveries', {
    per_page: perPage,
    page: params.page ?? 1,
    ...extra,
  })
  if (res.pagination) {
    reportUpstreamPage(params, {
      hasMore: Boolean(res.pagination.next_page),
      totalCount:
        typeof res.pagination.total_count === 'number' ? res.pagination.total_count : undefined,
    })
  }
  return res
}

export class TransportifyAdapter implements LogisticsAdapter {
  // GET /deliveries: "custom sizes of up to 100 items per page"; the other
  // list (vehicle_types) is unpaginated and sliced locally.
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  // Connect Link support — single API-key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'transportify'
  readonly version = '1'

  private baseUrl: string | undefined

  constructor(config: TransportifyAdapterConfig = {}) {
    this.baseUrl = config.baseUrl
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // For Transportify the "code" is the API key itself.
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Webhook ────────────────────────────────────────────────────────────────
  //
  // Transportify webhooks are configured by contacting regional support.
  // The webhook payload is a JSON delivery status update.
  // Authentication is via a shared Authorization header value (user-generated key)
  // that is verified by comparing it to the stored secret — there is no HMAC signing.
  // verifyWebhook performs a constant-time comparison of the raw header value.

  verifyWebhook(
    _payload: Buffer,
    headers: Record<string, string>,
    secret: string,
  ): boolean {
    const provided = headers['authorization'] ?? ''
    if (!provided || !secret) return false
    // Constant-time comparison to avoid timing attacks.
    try {
      const a = Buffer.from(provided, 'utf8')
      const b = Buffer.from(secret, 'utf8')
      if (a.length !== b.length) return false
      return timingSafeEqual(a, b)
    } catch {
      return false
    }
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    // Transportify webhook payload is a delivery status update object.
    const status = payload['status'] as string | undefined
    const id = payload['id'] ?? payload['booking_id']
    const resourceId = id != null ? String(id) : undefined

    // Map delivery status to canonical action.
    type CanonicalAction = WebhookEvent['action']
    let action: CanonicalAction = 'updated'
    if (status === 'delivery_complete') action = 'updated'
    else if (status === 'canceled') action = 'cancelled'

    return [
      {
        platform: 'transportify',
        type: `delivery.${status ?? 'updated'}`,
        resourceType: 'shipment',
        action,
        resourceId,
        payload,
      },
    ]
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new TransportifyClient(credentials, this.baseUrl)
    const res = await getDeliveriesPage(client, params, { sort_by: 'id', order_by: 'desc' })
    return (res.data ?? []).map(transformShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new TransportifyClient(credentials, this.baseUrl)
    const raw = await client.get<TransportifyDelivery>(`deliveries/${id}`)
    return transformShipment(raw)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new TransportifyClient(credentials, this.baseUrl)

    const locations: Array<Record<string, unknown>> = []

    if (data.originAddress) {
      locations.push({
        address: data.originAddress.street1 ?? '',
        recipient_name: data.originAddress.name ?? '',
        recipient_phone: data.originAddress.phone ?? '',
        is_payer: true,
      })
    }

    if (data.destinationAddress) {
      locations.push({
        address: data.destinationAddress.street1 ?? '',
        recipient_name: data.destinationAddress.name ?? '',
        recipient_phone: data.destinationAddress.phone ?? '',
        is_payer: false,
      })
    }

    const raw = await client.post<TransportifyDelivery>('deliveries', {
      time_type: 'now',
      note: data.notes ?? undefined,
      job_order_number: data.reference ?? undefined,
      locations,
    })
    return transformShipment(raw)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new TransportifyClient(credentials, this.baseUrl)
    await client.post<unknown>(`deliveries/${id}/cancel`, {})
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new TransportifyClient(credentials, this.baseUrl)
    const res = await getDeliveriesPage(client, params, { sort_by: 'id', order_by: 'desc' })
    return (res.data ?? []).map((d) => transformOrder(d as TransportifyOrderDelivery))
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new TransportifyClient(credentials, this.baseUrl)
    const raw = await client.get<TransportifyOrderDelivery>(`deliveries/${id}`)
    return transformOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new TransportifyClient(credentials, this.baseUrl)

    const locations: Array<Record<string, unknown>> = []

    if (data.originAddress) {
      locations.push({
        address: data.originAddress.street1 ?? '',
        recipient_name: data.originAddress.name ?? '',
        recipient_phone: data.originAddress.phone ?? '',
        is_payer: true,
      })
    }

    if (data.destinationAddress) {
      locations.push({
        address: data.destinationAddress.street1 ?? '',
        recipient_name: data.destinationAddress.name ?? '',
        recipient_phone: data.destinationAddress.phone ?? '',
        is_payer: false,
      })
    }

    const raw = await client.post<TransportifyOrderDelivery>('deliveries', {
      time_type: 'now',
      job_order_number: data.orderNumber ?? undefined,
      notes: data.notes ?? undefined,
      locations,
    })
    return transformOrder(raw)
  }

  async cancelOrder(credentials: Credentials, id: string): Promise<void> {
    const client = new TransportifyClient(credentials, this.baseUrl)
    await client.post<unknown>(`deliveries/${id}/cancel`, {})
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new TransportifyClient(credentials, this.baseUrl)
    // Transportify uses booking ID as the tracking reference.
    const raw = await client.get<TransportifyTrackingDelivery>(`deliveries/${trackingNumber}`)
    return transformTrackingEvents(raw)
  }

  async listTrackingEvents(credentials: Credentials, params: QueryParams): Promise<TrackingEvent[]> {
    const client = new TransportifyClient(credentials, this.baseUrl)
    // transformTrackingEvents yields exactly one event per delivery, so one
    // upstream page of deliveries is one caller page of events.
    const res = await getDeliveriesPage(client, params, {})
    return (res.data ?? []).flatMap((d) =>
      transformTrackingEvents(d as TransportifyTrackingDelivery),
    )
  }

  // ── Carriers ───────────────────────────────────────────────────────────────
  // Transportify vehicle types are the closest equivalent to carrier services.
  // GET /public_api/v10/vehicle_types returns available truck/van types for a location.

  async listCarriers(credentials: Credentials, params: QueryParams): Promise<Carrier[]> {
    const client = new TransportifyClient(credentials, this.baseUrl)
    const res = await client.get<TransportifyVehicleTypesResponse>('vehicle_types')
    // GET /vehicle_types documents no paging parameters and returns every
    // vehicle type of the area in one response: slice the caller's page.
    return pageLocally((res.data ?? []).map(transformCarrier), params)
  }

  async getCarrier(credentials: Credentials, id: string): Promise<Carrier> {
    const client = new TransportifyClient(credentials, this.baseUrl)
    const res = await client.get<TransportifyVehicleTypesResponse>('vehicle_types')
    const found = (res.data ?? []).find((vt) => vt.id != null && String(vt.id) === id)
    if (!found) throw new Error(`Carrier (vehicle type) not found: ${id}`)
    return transformCarrier(found)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new TransportifyClient(credentials, this.baseUrl)

    const locations: Array<Record<string, unknown>> = [
      {
        address: params.originAddress.street1 ?? '',
        recipient_name: params.originAddress.name ?? '',
        recipient_phone: params.originAddress.phone ?? '',
        is_payer: true,
      },
      {
        address: params.destinationAddress.street1 ?? '',
        recipient_name: params.destinationAddress.name ?? '',
        recipient_phone: params.destinationAddress.phone ?? '',
        is_payer: false,
      },
    ]

    const packs = params.packages.map((pkg) => ({
      dimensions: {
        sub_packs: [
          {
            length: pkg.dimensions?.length ?? 0,
            width: pkg.dimensions?.width ?? 0,
            height: pkg.dimensions?.height ?? 0,
            weight: pkg.weight?.value ?? 0,
            quantity: 1,
          },
        ],
      },
    }))

    const res = await client.post<TransportifyQuoteResponse>('deliveries/get_quote', {
      time_type: 'now',
      locations,
      packs: packs.length > 0 ? packs : undefined,
    })

    return (res.data ?? []).map(transformRate)
  }
}
