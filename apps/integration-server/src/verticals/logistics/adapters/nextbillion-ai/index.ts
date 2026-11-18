/**
 * NextBillion.ai Logistics Adapter
 *
 * NextBillion.ai provides route optimisation, live fleet tracking, and
 * dispatch management APIs. This adapter maps those concepts to the OpenSteward
 * canonical logistics schema.
 *
 * Auth:     API key passed as `?key=<apiKey>` query parameter.
 * Base URL: https://api.nextbillion.io
 * Docs:     https://docs.nextbillion.ai/
 *
 * API surface covered:
 *   Shipments   → Dispatch Routes  (POST /fleetify/routes; no documented read,
 *                 so listShipments/getShipment refuse with 501)
 *   Orders      → Optimization Tasks (POST /optimization/v2)
 *   Tracking    → Skynet Live Tracking (GET /skynet/asset/{id}/location/list)
 *
 * NextBillion.ai does not provide a webhook signing scheme in its public docs;
 * no webhook.ts is included.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: carrier   — NextBillion.ai is a routing/optimization/tracking platform with no carrier management concept or endpoint.
 * Unavailable: label     — No shipping-label generation endpoints exist in the public API.
 * Unavailable: manifest  — No manifest concept or endpoint; not a parcel-carrier platform.
 * Unavailable: rate      — Offers route optimisation but not carrier rate-quoting; no rate endpoints exist.
 * Unavailable: warehouse — Depots are inline parameters in optimization requests, not managed warehouse resources.
 */

import { connectionScope, cursorPagerKey, pageByRows, simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { Order } from '../../schema/order'
import type { TrackingEvent } from '../../schema/trackingevent'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { NextBillionClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformRoute, type NBRoute } from './transform/shipment'
import { transformOptTask, type NBOptTask } from './transform/order'
import {
  transformAssetLocation,
  transformAssetEvent,
  type NBAssetLocation,
  type NBAssetEvent,
  type NBAsset,
} from './transform/tracking'

type NextBillionAdapterConfig = Record<string, never>

const SIMPLE_API_KEY_FORM = simpleApiKey()

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

/** GET /skynet/asset/list response: `{ status, data: { list, page } }`. */
interface NBAssetListResponse {
  data?: {
    list?: NBAsset[]
    page?: { total?: number; offset?: number; page?: number; size?: number; hasmore?: boolean }
  }
}

/**
 * The assets on one page of GET /skynet/asset/list and whether another page
 * follows: `data.page.hasmore` when the platform sends it, else a full page.
 */
function readAssetPage(
  res: NBAssetListResponse | { data?: NBAsset[] } | NBAsset[],
  ps: number,
): { assets: NBAsset[]; hasMore: boolean } {
  if (Array.isArray(res)) return { assets: res, hasMore: res.length >= ps }
  const data = res.data
  if (Array.isArray(data)) return { assets: data, hasMore: data.length >= ps }
  const assets = data?.list ?? []
  const hasmore = data?.page?.hasmore
  return { assets, hasMore: typeof hasmore === 'boolean' ? hasmore : assets.length >= ps }
}

export class NextBillionAiAdapter implements LogisticsAdapter {
  // Connect Link support — single API-key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'nextbillion-ai'
  readonly version = '1'

  constructor(_config: NextBillionAdapterConfig = {}) {}

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

  // ── Shipments (Dispatch Routes) ────────────────────────────────────────────

  /**
   * The Route Dispatch API has no read side. Its page,
   * https://docs.nextbillion.ai/dispatches/route-dispatch-api, lists exactly
   * two methods: "POST https://api.nextbillion.io/fleetify/routes" ("Dispatch
   * a new route") and "POST .../fleetify/v2/routes/{route_id}/redispatch".
   * The spec it renders (https://docs.nextbillion.io/openapi.json) has
   * `/dispatch/routes` with `post` only. There is no GET that lists routes or
   * reads one back, so both reads refuse before sending anything.
   */
  async listShipments(_credentials: Credentials, _params: QueryParams): Promise<Shipment[]> {
    throw notSupported(
      'NextBillion.ai cannot list shipments: the Route Dispatch API documents only POST /fleetify/routes and POST /fleetify/v2/routes/{route_id}/redispatch, and no GET that lists routes',
    )
  }

  async getShipment(_credentials: Credentials, _id: string): Promise<Shipment> {
    throw notSupported(
      'NextBillion.ai cannot read shipments: the Route Dispatch API documents only POST /fleetify/routes and POST /fleetify/v2/routes/{route_id}/redispatch, and no GET that reads a route back',
    )
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new NextBillionClient(credentials)

    const body: Record<string, unknown> = {
      routing: data.serviceCode ?? 'car',
      steps: [
        {
          type: 'start',
          address: data.originAddress?.street1 ?? '',
          location: { lat: 0, lng: 0 },
        },
        {
          type: 'end',
          address: data.destinationAddress?.street1 ?? '',
          location: { lat: 0, lng: 0 },
        },
      ],
    }

    if (data.reference) {
      body['short_id'] = data.reference
    }

    const raw = await client.post<NBRoute>('/fleetify/routes', body)
    return transformRoute(raw)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new NextBillionClient(credentials)
    await client.delete(`/fleetify/routes/${id}`)
  }

  // ── Orders (Route Optimisation Tasks) ─────────────────────────────────────

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new NextBillionClient(credentials)
    const raw = await client.get<NBOptTask>(`/optimization/v2/result`, { id })
    return transformOptTask(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new NextBillionClient(credentials)

    // Build a minimal optimisation request — one vehicle, one job per shipment.
    const shipmentCount = data.shipmentIds?.length ?? 1
    const jobs = Array.from({ length: shipmentCount }, (_, i) => ({
      id: i + 1,
      description: data.notes ?? undefined,
      location_index: i + 1,
      service: 300,
    }))

    const body: Record<string, unknown> = {
      locations: [
        { id: 0 }, // depot
        ...jobs.map((j) => ({ id: j.id })),
      ],
      vehicles: [
        {
          id: 1,
          start_index: 0,
          end_index: 0,
        },
      ],
      jobs,
    }

    const raw = await client.post<NBOptTask>('/optimization/v2', body)
    return transformOptTask(raw)
  }

  // ── Tracking Events (Skynet Live Tracking) ─────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new NextBillionClient(credentials)
    // trackingNumber is used as the Skynet asset ID.
    const res = await client.get<{ data?: NBAssetLocation[] } | NBAssetLocation[]>(
      `/skynet/asset/${trackingNumber}/location/list`,
    )
    const locations: NBAssetLocation[] = Array.isArray(res)
      ? res
      : (res as { data?: NBAssetLocation[] }).data ?? []
    return locations.map((loc) => transformAssetLocation(loc, trackingNumber))
  }

  /**
   * GET /skynet/asset/list is page-numbered: `pn` ("Denotes page number",
   * default 1) and `ps` ("Denotes number of search results per page",
   * default 20, maximum 100), with `data.page.hasmore` ("whether there are
   * more items available beyond the current page") as the next signal.
   * https://docs.nextbillion.io/openapi.json (rendered at
   * https://docs.nextbillion.ai/tracking/live-tracking-api, "Get Asset List").
   *
   * One event is emitted per asset that has a last location, so a page of
   * assets is not a caller page of events: page by rows over the pn chain,
   * sizing `ps` from the caller's limit (capped at 100).
   */
  async listTrackingEvents(credentials: Credentials, params: QueryParams): Promise<TrackingEvent[]> {
    const client = new NextBillionClient(credentials)
    const ps = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const key = cursorPagerKey(connectionScope('nextbillion-ai', credentials), 'skynet-assets', { ps })

    const { items } = await pageByRows<TrackingEvent, number>(
      key,
      params,
      async (cursor) => {
        const pn = cursor ?? 1
        // List assets, then return the most-recent location event for each.
        const assetsRes = await client.get<NBAssetListResponse | { data?: NBAsset[] } | NBAsset[]>(
          '/skynet/asset/list',
          { pn, ps },
        )
        const { assets, hasMore } = readAssetPage(assetsRes, ps)

        const events: TrackingEvent[] = []
        for (const asset of assets) {
          const assetId = asset.id ?? undefined
          if (!assetId) continue
          try {
            const locRes = await client.get<{ data?: NBAssetLocation } | NBAssetLocation>(
              `/skynet/asset/${assetId}/location/last`,
            )
            const loc: NBAssetLocation = (locRes as { data?: NBAssetLocation }).data ?? locRes as NBAssetLocation
            events.push(transformAssetLocation(loc, assetId))
          } catch {
            // Skip assets with no location data.
          }
        }
        return { items: events, next: hasMore ? pn + 1 : null }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items
  }

  // ── Asset Events (Geofence / Monitoring) ───────────────────────────────────

  async listAssetEvents(credentials: Credentials, assetId: string, params: QueryParams): Promise<TrackingEvent[]> {
    const client = new NextBillionClient(credentials)
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<{ data?: NBAssetEvent[] } | NBAssetEvent[]>(
      `/skynet/asset/${assetId}/event/list`,
      { limit },
    )
    const events: NBAssetEvent[] = Array.isArray(res)
      ? res
      : (res as { data?: NBAssetEvent[] }).data ?? []
    return events.map((ev) => transformAssetEvent(ev, assetId))
  }
}
