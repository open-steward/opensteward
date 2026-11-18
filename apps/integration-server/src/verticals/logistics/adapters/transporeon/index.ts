import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { Order } from '../../schema/order'
import type { TrackingEvent } from '../../schema/trackingevent'

import { buildAuthUrl, exchangeCredentials, refreshCredentials as doRefresh } from './auth'
import { TransporeonCarrierClient, TransporeonRtvClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import {
  transformTransport,
  extractTransports,
  type TransporeonTransportDto,
  type TransporeonTransportListResponse,
} from './transform/shipment'
import {
  transformVisibilityEvents,
  trackingEventFromTransport,
  type TransporeonVisibilityResponse,
} from './transform/tracking'
import {
  transformDelivery,
  extractDeliveries,
  type TransporeonDeliveryListResponse,
} from './transform/order'

// ── Resource coverage ──────────────────────────────────────────────────────────
// Unavailable: carrier   — no /v1/carrier endpoint; Carrier Interface is used BY carriers, not to list them
// Unavailable: rate      — no rate-quoting endpoint in the Carrier Interface API; rate management is web-only
// Unavailable: label     — Transporeon is a TMS/marketplace and does not generate or store shipping labels
// Unavailable: manifest  — no manifest endpoint; carrier manifests are not managed via this API
// Unavailable: warehouse — no warehouse/location listing endpoint in the Carrier Interface API

// ── Config ────────────────────────────────────────────────────────────────────

export interface TransporeonAdapterConfig {
  clientId?: string
  clientSecret?: string
  /** Set true to target acceptance environment (xch.test.transporeon.com) */
  sandbox?: boolean
}

// ── NTO accept/decline payload shapes ────────────────────────────────────────

interface NtoAcceptPayload {
  transport_id: number | string
  [key: string]: unknown
}

interface NtoPushResult {
  success?: boolean
  message?: string
  [key: string]: unknown
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class TransporeonAdapter implements LogisticsAdapter {
  readonly platform = 'transporeon'
  readonly version = '1'

  private config: TransporeonAdapterConfig

  constructor(config: TransporeonAdapterConfig = {}) {
    this.config = config
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error('transporeon: clientId and clientSecret are required')
    }
    return exchangeCredentials({
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
      sandbox: this.config.sandbox,
    })
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  /**
   * List transport orders assigned to the carrier.
   * Calls GET /v1/transport on the Carrier Interface API.
   *
   * Transporeon returns all unacknowledged DTOs since the last call.
   * Pass `transactional=true` to enable transactional pulling (with acknowledgement).
   */
  async listShipments(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Shipment[]> {
    const client = new TransporeonCarrierClient(credentials)
    const extra = params as Record<string, unknown>

    const res = await client.get<TransporeonTransportListResponse>('/v1/transport', {
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
      offset: params.page != null ? (params.page - 1) * (params.limit ?? DEFAULT_PAGE_SIZE) : undefined,
      transactional: extra['transactional'] ?? undefined,
    })

    return extractTransports(res).map(transformTransport)
  }

  /**
   * Get a single transport order by its Transporeon ID.
   * Uses GET /v1/transport with an id filter.
   */
  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new TransporeonCarrierClient(credentials)

    const res = await client.get<TransporeonTransportListResponse>('/v1/transport', {
      id,
    })

    const transports = extractTransports(res)
    const found = transports.find((t) => String(t.id) === id) ?? transports[0]

    if (!found) {
      throw new Error(`transporeon: transport not found for id=${id}`)
    }

    return transformTransport(found)
  }

  /**
   * Accept a No-Touch Order (NTO) transport.
   * Calls POST /v1/nto/accept on the Carrier Interface API.
   *
   * The canonical `data.id` must be the Transporeon transport ID.
   * Returns a refreshed view of the transport after acceptance.
   */
  async createShipment(
    credentials: Credentials,
    data: Partial<Shipment>,
  ): Promise<Shipment> {
    if (!data.id) {
      throw new Error(
        'transporeon: data.id (transport ID) is required to accept an NTO transport',
      )
    }

    const client = new TransporeonCarrierClient(credentials)

    const payload: NtoAcceptPayload = { transport_id: data.id }
    await client.post<NtoPushResult>('/v1/nto/accept', payload)

    // Fetch the updated transport state
    return this.getShipment(credentials, data.id)
  }

  /**
   * Cancel (decline) a No-Touch Order transport awaiting acceptance.
   * Calls POST /v1/nto/decline on the Carrier Interface API.
   */
  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new TransporeonCarrierClient(credentials)
    await client.post<NtoPushResult>('/v1/nto/decline', { transport_id: id })
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  /**
   * List delivery orders assigned to the carrier.
   * Calls GET /v1/delivery on the Carrier Interface API.
   *
   * Each Transporeon delivery is a shipper-created order entity that is grouped
   * into a transport assignment; it maps to the canonical Order resource.
   */
  async listOrders(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Order[]> {
    const client = new TransporeonCarrierClient(credentials)

    const res = await client.get<TransporeonDeliveryListResponse>('/v1/delivery', {
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
      offset: params.page != null ? (params.page - 1) * (params.limit ?? DEFAULT_PAGE_SIZE) : undefined,
    })

    return extractDeliveries(res).map(transformDelivery)
  }

  /**
   * Get a single delivery order by its Transporeon delivery ID.
   * Uses GET /v1/delivery with an id filter.
   */
  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new TransporeonCarrierClient(credentials)

    const res = await client.get<TransporeonDeliveryListResponse>('/v1/delivery', {
      id,
    })

    const deliveries = extractDeliveries(res)
    const found = deliveries.find((d) => String(d.id) === id) ?? deliveries[0]

    if (!found) {
      throw new Error(`transporeon: delivery not found for id=${id}`)
    }

    return transformDelivery(found)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  /**
   * Retrieve real-time tracking events for a transport via the Visibility API.
   * Falls back to a synthetic event derived from the transport qualifier when
   * the Visibility API returns no data.
   */
  async getTrackingEvents(
    credentials: Credentials,
    trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    const rtvClient = new TransporeonRtvClient(credentials)

    // Primary: query Visibility API for events on this transport
    const visRes = await rtvClient
      .get<TransporeonVisibilityResponse>(`/v1/transports/status`, {
        transport_id: trackingNumber,
      })
      .catch(() => null)

    if (visRes && (visRes.events?.length ?? visRes.data?.length ?? 0) > 0) {
      return transformVisibilityEvents(trackingNumber, visRes)
    }

    // Fallback: fetch transport DTO from Carrier API and synthesise one event
    const carrierClient = new TransporeonCarrierClient(credentials)
    const carrierRes = await carrierClient
      .get<TransporeonTransportListResponse>('/v1/transport', { id: trackingNumber })
      .catch(() => null)

    if (carrierRes) {
      const transports = extractTransports(carrierRes)
      const t: TransporeonTransportDto | undefined =
        transports.find((x) => String(x.id) === trackingNumber) ?? transports[0]

      if (t) {
        return [
          trackingEventFromTransport(
            trackingNumber,
            t.qualifier,
            t.timestamp,
            t.comment_plain_text,
            t as Record<string, unknown>,
          ),
        ]
      }
    }

    // Final fallback: return a single UNKNOWN event
    return [
      {
        trackingNumber,
        carrierId: 'transporeon',
        status: 'UNKNOWN',
        metadata: { trackingNumber },
      },
    ]
  }

  /**
   * Send a visibility status update (GPS position / milestone) for a transport.
   * Calls POST /v1/transports/status on the Visibility API.
   */
  async listTrackingEvents(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<TrackingEvent[]> {
    const extra = params as Record<string, unknown>
    const transportId = extra['transportId'] as string | undefined

    if (!transportId) {
      return []
    }

    return this.getTrackingEvents(credentials, transportId)
  }
}
