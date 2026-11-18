import { pageLocally, simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Carrier } from '../../schema/carrier'
import type { WebhookEvent } from '../../schema/webhook'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { TrackingMoreClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import {
  transformTracking,
  transformShipment,
  type TrackingMoreTracking,
} from './transform/tracking'
import { transformCarrier, type TrackingMoreCourier } from './transform/carrier'
import { verifyWebhook, parseWebhookEvents } from './webhook'

// ── Resource coverage ──────────────────────────────────────────────────────────
// Available:   carrier, shipment, trackingevent
// Unavailable: label     — TrackingMore is a tracking-only platform; no label generation API
// Unavailable: manifest  — TrackingMore is a tracking-only platform; no manifest endpoint
// Unavailable: order     — TrackingMore is a tracking-only platform; no order management API
// Unavailable: rate      — TrackingMore is a tracking-only platform; no shipping rate API
// Unavailable: warehouse — TrackingMore is a tracking-only platform; no warehouse management API

// ── Types ─────────────────────────────────────────────────────────────────────

interface TrackingMoreAdapterConfig {
  clientId?: string
  clientSecret?: string
  redirectUri?: string
  scopes?: string[]
}

/**
 * Standard envelope returned by all TrackingMore v4 endpoints.
 *
 * {
 *   "meta": { "code": 200, "type": "Success", "message": "..." },
 *   "data": { ... } | [ ... ]
 * }
 */
interface TrackingMoreEnvelope<T> {
  meta?: { code?: number; type?: string; message?: string }
  data?: T
}

interface TrackingMoreListData {
  items?: TrackingMoreTracking[]
  total_pages?: number
  current_page?: number
}

// ── Adapter ───────────────────────────────────────────────────────────────────

const SIMPLE_API_KEY_FORM = simpleApiKey()

export class TrackingMoreAdapter implements LogisticsAdapter {
  // Connect Link support — single API-key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'trackingmore'
  readonly version = '1'

  constructor(_config: TrackingMoreAdapterConfig = {}) {}

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // For TrackingMore the "code" is the API key itself.
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Webhook ────────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseWebhookEvents(payload)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  /**
   * Retrieve full tracking event history for a single tracking number.
   * TrackingMore: POST /trackings/create (idempotent) then GET /trackings/get.
   */
  async getTrackingEvents(
    credentials: Credentials,
    trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    const client = new TrackingMoreClient(credentials)

    // Ensure the tracking number is registered (idempotent — duplicate returns
    // an error code but the existing record is still usable).
    await client
      .post<TrackingMoreEnvelope<TrackingMoreTracking>>('/trackings/create', {
        tracking_number: trackingNumber,
      })
      .catch(() => undefined)

    const res = await client.get<TrackingMoreEnvelope<TrackingMoreTracking>>(
      '/trackings/get',
      { tracking_numbers: trackingNumber },
    )

    const tracking = res.data
    if (!tracking) return []
    // The endpoint returns a single tracking object when queried by number.
    return transformTracking(tracking)
  }

  /**
   * List recent tracking events across all registered tracking numbers.
   * Uses GET /trackings/get with pagination parameters.
   */
  async listTrackingEvents(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<TrackingEvent[]> {
    const client = new TrackingMoreClient(credentials)
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const extra = params as Record<string, unknown>

    const res = await client.get<TrackingMoreEnvelope<TrackingMoreListData>>(
      '/trackings/get',
      {
        limit,
        page: extra['page'] ?? 1,
        created_date_min: extra['createdDateMin'] ?? undefined,
        created_date_max: extra['createdDateMax'] ?? undefined,
      },
    )

    const items = res.data?.items ?? []
    return items.flatMap(transformTracking)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  /**
   * List shipments (tracked packages) registered with the account.
   * Each TrackingMore tracking record maps to a canonical Shipment.
   */
  async listShipments(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Shipment[]> {
    const client = new TrackingMoreClient(credentials)
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const extra = params as Record<string, unknown>

    const res = await client.get<TrackingMoreEnvelope<TrackingMoreListData>>(
      '/trackings/get',
      {
        limit,
        page: extra['page'] ?? 1,
        created_date_min: extra['createdDateMin'] ?? undefined,
        created_date_max: extra['createdDateMax'] ?? undefined,
      },
    )

    const items = res.data?.items ?? []
    return items.map(transformShipment)
  }

  /**
   * Get a single shipment by tracking number.
   */
  async getShipment(credentials: Credentials, trackingNumber: string): Promise<Shipment> {
    const client = new TrackingMoreClient(credentials)

    const res = await client.get<TrackingMoreEnvelope<TrackingMoreTracking>>(
      '/trackings/get',
      { tracking_numbers: trackingNumber },
    )

    if (!res.data) {
      throw new Error(`TrackingMore: no tracking found for ${trackingNumber}`)
    }

    return transformShipment(res.data)
  }

  /**
   * Register a new tracking number for monitoring.
   * Maps Shipment.trackingNumber + optional carrierId as the courier_code.
   */
  async createShipment(
    credentials: Credentials,
    data: Partial<Shipment>,
  ): Promise<Shipment> {
    if (!data.trackingNumber) {
      throw new Error('TrackingMore: trackingNumber is required to create a shipment')
    }

    const client = new TrackingMoreClient(credentials)

    const res = await client.post<TrackingMoreEnvelope<TrackingMoreTracking>>(
      '/trackings/create',
      {
        tracking_number: data.trackingNumber,
        courier_code: data.carrierId ?? undefined,
        order_number: data.reference ?? undefined,
        note: data.notes ?? undefined,
      },
    )

    const tracking = res.data
    if (!tracking) {
      throw new Error(`TrackingMore: failed to create tracking for ${data.trackingNumber}`)
    }

    return transformShipment(tracking)
  }

  /**
   * Stop tracking a shipment by deleting it from TrackingMore.
   */
  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new TrackingMoreClient(credentials)
    await client.delete(`/trackings/delete/${id}`)
  }

  // ── Carriers ───────────────────────────────────────────────────────────────

  /**
   * List all couriers supported by TrackingMore.
   * Uses GET /couriers/all, which takes no paging parameters and returns every
   * courier ("Return a list of all supported couriers."), so the caller's page
   * is cut from the whole list.
   */
  async listCarriers(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Carrier[]> {
    const client = new TrackingMoreClient(credentials)
    const res = await client.get<TrackingMoreEnvelope<TrackingMoreCourier[]>>(
      '/couriers/all',
    )
    return pageLocally((res.data ?? []).map(transformCarrier), params)
  }

  /**
   * Get a single carrier by courier_code.
   * TrackingMore does not have a per-courier endpoint — filter from the full list.
   */
  async getCarrier(credentials: Credentials, id: string): Promise<Carrier> {
    const carriers = await this.listCarriers(credentials, {})
    const found = carriers.find((c) => c.code === id || c.id === id)
    if (!found) throw new Error(`TrackingMore: carrier not found: ${id}`)
    return found
  }
}
