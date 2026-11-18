// ── Resource coverage ──────────────────────────────────────────────────────────
// Available:   shipment      — mapped from Samsara Routes (/fleet/routes)
// Available:   trackingevent — derived from route stop states
// Unavailable: carrier   — Samsara is a telematics platform; no carrier/parcel-carrier endpoint exists
// Unavailable: label     — Samsara does not issue or store shipping labels
// Unavailable: manifest  — Samsara has no end-of-day shipment manifest concept or endpoint
// Unavailable: order     — Samsara has no order management endpoint
// Unavailable: rate      — Samsara does not provide shipping rate quoting
// Unavailable: warehouse — Samsara Addresses are geofenced fleet locations, not warehouse entities

import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  pageByRows,
  reportUpstreamPage,
} from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { WebhookEvent } from '../../schema/webhook'

import { buildAuthUrl, buildCredentials, refreshCredentials as doRefresh } from './auth'
import { SamsaraClient, type SamsaraPaginatedResponse } from './client'
import { SAMSARA_ROUTES_MAX_LIMIT } from './constants'
import { transformRoute, type SamsaraRoute } from './transform/route'
import { transformRouteTrackingEvents } from './transform/tracking'
import { samsaraWebhook } from './webhook'

export { samsaraWebhook }

/**
 * A position in GET /fleet/routes: the `after` cursor plus the time window it
 * was minted under. The default window is "the last 30 days from now", so it
 * is computed once on page 1 and carried forward; later pages of one walk ask
 * for exactly the window that produced their cursor.
 */
interface RoutesCursor {
  after: string
  startTime: string
  endTime: string
}

/**
 * One page of GET /fleet/routes. https://developers.samsara.com/reference/fetchroutes:
 * `limit` "Default and max for this value is 512 objects"; `after` "should be
 * the endCursor value from the previous page of results"; `hasNextPage` "True
 * if there are more pages of results immediately available after this
 * endCursor."
 */
async function fetchRoutesPage(
  credentials: Credentials,
  limit: number,
  cursor: RoutesCursor | undefined,
): Promise<{ items: SamsaraRoute[]; next: RoutesCursor | null }> {
  const now = new Date()
  const startTime =
    cursor?.startTime ?? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const endTime = cursor?.endTime ?? now.toISOString()
  const res = await new SamsaraClient(credentials).get<SamsaraPaginatedResponse<SamsaraRoute>>(
    '/fleet/routes',
    { startTime, endTime, limit, after: cursor?.after },
  )
  const endCursor = res.pagination?.endCursor
  const next =
    res.pagination?.hasNextPage && endCursor ? { after: endCursor, startTime, endTime } : null
  return { items: res.data ?? [], next }
}

/** The caller's limit, clamped to the documented 1..512. */
function routesLimit(params: QueryParams): number {
  const raw = params.limit ?? 100
  return Math.min(Math.max(Math.floor(raw) || 1, 1), SAMSARA_ROUTES_MAX_LIMIT)
}

export interface SamsaraAdapterConfig {
  apiKey?: string
}

export class SamsaraAdapter implements LogisticsAdapter {
  readonly platform = 'samsara'
  readonly version = '1'
  readonly capabilities = { maxPageSize: SAMSARA_ROUTES_MAX_LIMIT }

  private config: SamsaraAdapterConfig

  constructor(config: SamsaraAdapterConfig = {}) {
    this.config = config
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  /**
   * Samsara uses static API keys — there is no OAuth code exchange.
   * The "code" parameter is treated as the API key itself, allowing the
   * standard OpenSteward auth flow to work: the integration installer pastes
   * the Samsara API token into the "code" field.
   */
  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    const apiKey = code || this.config.apiKey
    if (!apiKey) throw new Error('samsara: apiKey is required')
    return buildCredentials({ apiKey })
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Shipments (mapped from Samsara Routes) ─────────────────────────────────

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    // One route is one shipment, so one upstream page at the caller's limit is
    // one caller page. Default window: routes active in the last 30 days.
    const limit = routesLimit(params)
    const key = cursorPagerKey(connectionScope('samsara', credentials), 'routes', { limit })
    const { items, hasMore } = await pageByCursor<SamsaraRoute, RoutesCursor>(
      key,
      params.page,
      (cursor) => fetchRoutesPage(credentials, limit, cursor),
    )
    reportUpstreamPage(
      params,
      params.limit !== undefined && limit < params.limit
        ? { hasMore, pageSize: limit }
        : { hasMore },
    )
    return items.map(transformRoute)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new SamsaraClient(credentials)
    const res = await client.get<{ data: SamsaraRoute }>(`/fleet/routes/${id}`)
    return transformRoute(res.data)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new SamsaraClient(credentials)

    const stops: Array<Record<string, unknown>> = []

    if (data.originAddress) {
      stops.push({
        singleUseLocation: {
          address: [
            data.originAddress.street1,
            data.originAddress.city,
            data.originAddress.state,
            data.originAddress.postalCode,
            data.originAddress.country,
          ]
            .filter(Boolean)
            .join(', '),
        },
      })
    }

    if (data.destinationAddress) {
      stops.push({
        singleUseLocation: {
          address: [
            data.destinationAddress.street1,
            data.destinationAddress.city,
            data.destinationAddress.state,
            data.destinationAddress.postalCode,
            data.destinationAddress.country,
          ]
            .filter(Boolean)
            .join(', '),
        },
        scheduledArrivalTime: data.estimatedDeliveryAt?.toISOString(),
      })
    }

    const body: Record<string, unknown> = {
      name: data.reference ?? data.notes ?? 'OpenSteward Shipment',
      stops,
    }

    if (data.notes) body.notes = data.notes

    const res = await client.post<{ data: SamsaraRoute }>('/fleet/routes', body)
    return transformRoute(res.data)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    // Samsara doesn't have a tracking-number lookup; interpret trackingNumber as route id.
    const client = new SamsaraClient(credentials)
    const res = await client.get<{ data: SamsaraRoute }>(`/fleet/routes/${trackingNumber}`)
    return transformRouteTrackingEvents(res.data)
  }

  async listTrackingEvents(credentials: Credentials, params: QueryParams): Promise<TrackingEvent[]> {
    // Events are flattened out of route stops, so an upstream page of routes
    // is not a caller page: page by rows over pages of the documented maximum.
    const key = cursorPagerKey(connectionScope('samsara', credentials), 'route-events', {
      limit: SAMSARA_ROUTES_MAX_LIMIT,
    })
    const { items } = await pageByRows<TrackingEvent, RoutesCursor>(key, params, async (cursor) => {
      const page = await fetchRoutesPage(credentials, SAMSARA_ROUTES_MAX_LIMIT, cursor)
      return { items: page.items.flatMap(transformRouteTrackingEvents), next: page.next }
    })
    return items
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return samsaraWebhook.parseWebhookEvents(payload)
  }
}
