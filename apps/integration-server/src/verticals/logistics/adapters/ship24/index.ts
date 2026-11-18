// ── Resource coverage ──────────────────────────────────────────────
// Available:   carrier, shipment, trackingevent
// Unavailable: label     — Ship24 is a tracking-only API; no label creation or printing endpoints (confirmed via OpenAPI spec).
// Unavailable: manifest  — Ship24 is a tracking-only API; no manifest endpoints (confirmed via OpenAPI spec).
// Unavailable: order     — Ship24 is a tracking-only API; no order management endpoints (confirmed via OpenAPI spec).
// Unavailable: rate      — Ship24 is a tracking-only API; no rate quoting endpoints (confirmed via OpenAPI spec).
// Unavailable: warehouse — Ship24 is a tracking-only API; no warehouse management endpoints (confirmed via OpenAPI spec).

import {
  connectionScope,
  cursorPagerKey,
  pageByRows,
  pageLocally,
  simpleApiKey,
} from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
} from '../../adapter/interface'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Carrier } from '../../schema/carrier'
import type { Shipment } from '../../schema/shipment'
import type { WebhookEvent } from '../../schema/webhook'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { Ship24Client } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import {
  transformTrackingEvents,
  transformShipment,
  type Ship24TrackingResult,
} from './transform/tracking'
import { transformCarrier, type Ship24Courier } from './transform/carrier'
import { parseWebhookEvents } from './webhook'

interface Ship24AdapterConfig {
  // Reserved for future configuration options (e.g. per-call vs subscription plan)
  [key: string]: unknown
}

const SIMPLE_API_KEY_FORM = simpleApiKey()

/** Trackers to ask for per upstream page: the caller's limit, capped at the documented 500. */
function trackerPageSize(params: QueryParams): number {
  const asked = Math.floor(Number(params.limit ?? DEFAULT_PAGE_SIZE))
  return Math.min(Math.max(Number.isFinite(asked) ? asked : DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE)
}

/**
 * One page of GET /public/v1/trackers. The response carries no total or next
 * flag, so a page shorter than `limit` is the last; a full one may be followed
 * by an empty page, which ends the walk.
 */
async function listTrackerPage(
  client: Ship24Client,
  page: number,
  limit: number,
): Promise<{ trackers: Array<{ trackerId: string }>; next: number | null }> {
  const res = await client.get<{ data: { trackers: Array<{ trackerId: string }> } }>('trackers', {
    page,
    limit,
  })
  const trackers = res.data?.trackers ?? []
  return { trackers, next: trackers.length >= limit ? page + 1 : null }
}

export class Ship24Adapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'ship24'
  readonly version = '1'

  constructor(_config: Ship24AdapterConfig = {}) {}

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // For Ship24 the "code" is the API key itself.
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseWebhookEvents(payload)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  /**
   * Fetch tracking events for a single tracking number using the synchronous
   * POST /trackers/track endpoint which returns results in one call.
   */
  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new Ship24Client(credentials)
    const res = await client.post<{ data: { trackings: Ship24TrackingResult[] } }>('trackers/track', {
      trackingNumber,
    })
    const trackings = res.data?.trackings ?? []
    return trackings.flatMap(transformTrackingEvents)
  }

  /**
   * List tracking events, flattened out of each tracker's results, in tracker
   * order. GET /public/v1/trackers is page-numbered ("using page-based
   * pagination"; `page`: "The page index.", `limit`: "The maximum number of
   * trackers returned per page.", maximum 500), and a short page is its end.
   * https://docs.ship24.com/assets/openapi/ship24-tracking-api.yaml (rendered
   * at https://docs.ship24.com/tracking-api-reference/).
   *
   * A page of trackers is not a caller page of events, so this pages by rows.
   */
  async listTrackingEvents(credentials: Credentials, params: QueryParams): Promise<TrackingEvent[]> {
    const client = new Ship24Client(credentials)
    const limit = trackerPageSize(params)
    const key = cursorPagerKey(connectionScope('ship24', credentials), 'trackers-events', { limit })
    const { items } = await pageByRows<TrackingEvent, number>(
      key,
      params,
      async (cursor) => {
        const page = cursor ?? 1
        const { trackers, next } = await listTrackerPage(client, page, limit)
        const results = await Promise.all(
          trackers.map((t) =>
            client.get<{ data: { trackings: Ship24TrackingResult[] } }>(
              `trackers/${t.trackerId}/results`,
            ).then((r) => (r.data?.trackings ?? []).flatMap(transformTrackingEvents))
             .catch(() => [] as TrackingEvent[]),
          ),
        )
        return { items: results.flat(), next }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  /**
   * Get a shipment by tracker ID using GET /trackers/:trackerId/results.
   */
  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new Ship24Client(credentials)
    const res = await client.get<{ data: { trackings: Ship24TrackingResult[] } }>(
      `trackers/${id}/results`,
    )
    const tracking = res.data?.trackings?.[0]
    if (!tracking) throw new Error(`Ship24: no tracking result for tracker ${id}`)
    return transformShipment(tracking)
  }

  /**
   * List shipments, one per tracker that has a tracking result. Pages by rows
   * over the page-numbered GET /public/v1/trackers (see listTrackingEvents),
   * since a tracker without results yields no shipment.
   */
  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new Ship24Client(credentials)
    const limit = trackerPageSize(params)
    const key = cursorPagerKey(connectionScope('ship24', credentials), 'trackers-shipments', { limit })
    const { items } = await pageByRows<Shipment, number>(
      key,
      params,
      async (cursor) => {
        const page = cursor ?? 1
        const { trackers, next } = await listTrackerPage(client, page, limit)
        const shipments = await Promise.all(
          trackers.map((t) =>
            client.get<{ data: { trackings: Ship24TrackingResult[] } }>(
              `trackers/${t.trackerId}/results`,
            ).then((r) => {
              const tracking = r.data?.trackings?.[0]
              return tracking ? transformShipment(tracking) : null
            }).catch(() => null as Shipment | null),
          ),
        )
        return { items: shipments.filter((s): s is Shipment => s !== null), next }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items
  }

  /**
   * Create a shipment tracker using POST /trackers.
   */
  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new Ship24Client(credentials)
    const body: Record<string, unknown> = {
      trackingNumber: data.trackingNumber,
      isSubscribed: true,
    }
    if (data.reference) body['shipmentReference'] = data.reference
    if (data.originAddress?.country) body['originCountryCode'] = data.originAddress.country
    if (data.destinationAddress?.country) body['destinationCountryCode'] = data.destinationAddress.country
    if (data.destinationAddress?.postalCode) body['destinationPostCode'] = data.destinationAddress.postalCode

    const res = await client.post<{
      data: { tracker: Ship24TrackingResult['tracker'] }
    }>('trackers', body)
    const tracker = res.data?.tracker
    if (!tracker) throw new Error('Ship24: tracker creation returned no tracker object')

    // Return a minimal Shipment from the created tracker (no results yet)
    return {
      id: tracker.trackerId,
      trackingNumber: tracker.trackingNumber ?? data.trackingNumber,
      status: 'PENDING',
      reference: tracker.shipmentReference ?? tracker.clientTrackerId ?? undefined,
      createdAt: tracker.createdAt ? new Date(tracker.createdAt) : undefined,
      metadata: tracker as unknown as Record<string, unknown>,
    }
  }

  /**
   * Cancel (delete) a tracker by ID.
   */
  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new Ship24Client(credentials)
    await client.delete(`trackers/${id}`)
  }

  // ── Carriers ───────────────────────────────────────────────────────────────

  /**
   * GET /public/v1/couriers "will return the list of all couriers supported by
   * Ship24" and takes no paging parameters, so the caller's page is cut from
   * the whole list.
   */
  async listCarriers(credentials: Credentials, params: QueryParams): Promise<Carrier[]> {
    const client = new Ship24Client(credentials)
    const res = await client.get<{ data: { couriers: Ship24Courier[] } }>('couriers')
    return pageLocally((res.data?.couriers ?? []).map(transformCarrier), params)
  }

  async getCarrier(credentials: Credentials, id: string): Promise<Carrier> {
    const client = new Ship24Client(credentials)
    const res = await client.get<{ data: { couriers: Ship24Courier[] } }>('couriers')
    const courier = (res.data?.couriers ?? []).find(
      (c) => c.courierCode === id || c.courierName === id,
    )
    if (!courier) throw new Error(`Ship24: carrier not found: ${id}`)
    return transformCarrier(courier)
  }
}
