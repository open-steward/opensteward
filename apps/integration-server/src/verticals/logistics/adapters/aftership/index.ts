import {
  simpleApiKey,
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
  RateRequestParams,
  PickupRequestParams,
  PickupCancelParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Carrier } from '../../schema/carrier'
import type { Label } from '../../schema/label'
import type { Manifest } from '../../schema/manifest'
import type { Rate } from '../../schema/rate'
import type { Pickup } from '../../schema/pickup'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { AfterShipClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, AFTERSHIP_SHIPPING_API_BASE } from './constants'

import {
  transformTracker,
  type AfterShipTracking,
  type AfterShipTrackingListResponse,
} from './transform/tracking'
import { transformShipment } from './transform/shipment'
import { transformCarrier, type AfterShipCourier } from './transform/carrier'
import { transformLabel, type AfterShipLabel } from './transform/label'
import { transformManifest, type AfterShipManifest } from './transform/manifest'
import { transformRate, type AfterShipRate } from './transform/rate'
import {
  transformPickup,
  toPickupRequest,
  type AfterShipPickup,
  type AfterShipCancelPickup,
} from './transform/pickup'

// ── Resource coverage ──────────────────────────────────────────────
// shipment  — served from the Tracking API's `trackings` collection (GET /trackings,
//             GET /trackings/:id). AfterShip has no /shipments endpoint, but a tracking
//             IS its shipment record: origin/destination, EDD, delivery date, order
//             reference. trackingevent reads the same page and explodes checkpoints.
// Unavailable: order    — AfterShip (Tracking + Shipping APIs) has no order concept.
// Unavailable: warehouse — AfterShip APIs have no warehouse concept.
// Pickup: list / get / create / cancel over the Shipping API (GET+POST /pickups,
//         GET /pickups/:id, POST /cancel-pickups). Not yet declared in
//         metadata.ts — the metadata PR owns that.

interface AfterShipAdapterConfig {
  clientId?: string
  clientSecret?: string
  redirectUri?: string
  scopes?: string[]
}
const SIMPLE_API_KEY_FORM = simpleApiKey()

/**
 * Pager scope for one connection. An AfterShip API key carries no account id,
 * so the scope is the platform plus the connection's key fingerprint.
 */
function pagerScope(credentials: Credentials): string {
  return connectionScope('aftership', credentials)
}

/** The size actually sent upstream: the caller's limit, capped at the adapter's ceiling. */
function sentSize(params: QueryParams): number {
  return Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
}

/** Report what a cursor-paged list learnt, including a clamped page size. */
function reportCursorPage(params: QueryParams, size: number, hasMore: boolean): void {
  reportUpstreamPage(
    params,
    params.limit !== undefined && size < params.limit ? { hasMore, pageSize: size } : { hasMore },
  )
}


export class AfterShipAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'aftership'
  readonly version = '1'

  constructor(_config: AfterShipAdapterConfig = {}) {}

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // For AfterShip the "code" is the API key itself.
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new AfterShipClient(credentials)
    // AfterShip: create a tracking (idempotent by tracking_number + slug)
    const res = await client.post<{ data: { tracking: AfterShipTracking } }>('trackings', {
      tracking: { tracking_number: trackingNumber },
    })
    return transformTracker(res.data.tracking)
  }

  /**
   * Events are flattened from each tracking's checkpoints, so one page of
   * trackings is not one page of events: page by rows over the tracking
   * cursor chain (`pagination.next_cursor`). Trackings are fetched at the
   * caller's size (capped), which the key therefore includes.
   */
  async listTrackingEvents(credentials: Credentials, params: QueryParams): Promise<TrackingEvent[]> {
    const upstream = sentSize(params)
    if (typeof params.cursor === 'string') {
      const page = await this.fetchTrackings(credentials, upstream, params.cursor)
      return page.items.flatMap(transformTracker)
    }
    const key = cursorPagerKey(pagerScope(credentials), 'trackingevents', { limit: upstream })
    const { items } = await pageByRows<TrackingEvent>(
      key,
      params,
      async (cursor) => {
        const page = await this.fetchTrackings(credentials, upstream, cursor)
        return { items: page.items.flatMap(transformTracker), next: page.next }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items
  }

  // ── Shipments (Tracking API) ───────────────────────────────────────────────
  // A tracking is AfterShip's shipment record; see the coverage note above.

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const size = sentSize(params)
    if (typeof params.cursor === 'string') {
      const page = await this.fetchTrackings(credentials, size, params.cursor)
      return page.items.map(transformShipment)
    }
    const key = cursorPagerKey(pagerScope(credentials), 'trackings', { limit: size })
    const { items, hasMore } = await pageByCursor(key, params.page, (cursor: string | undefined) =>
      this.fetchTrackings(credentials, size, cursor),
    )
    reportCursorPage(params, size, hasMore)
    return items.map(transformShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new AfterShipClient(credentials)
    // 2024-10 returns the record directly under `data` (the legacy v4 API
    // wrapped it as `data.tracking`).
    const res = await client.get<{ data: AfterShipTracking }>(`trackings/${id}`)
    return transformShipment(res.data)
  }

  /**
   * One page of GET /trackings. `cursor` is AfterShip's opaque page token:
   * `pagination.next_cursor` on the previous page, absent for the first. The
   * chain ends where `has_next_page` is false or no `next_cursor` comes back.
   * A direct caller may still pass `params.cursor`; the REST router does not.
   */
  private async fetchTrackings(
    credentials: Credentials,
    limit: number,
    cursor: string | undefined,
  ): Promise<{ items: AfterShipTracking[]; next: string | null }> {
    const client = new AfterShipClient(credentials)
    const res = await client.get<AfterShipTrackingListResponse>('trackings', { limit, cursor })
    const pagination = res.data.pagination
    const next = pagination?.has_next_page === false ? null : pagination?.next_cursor || null
    return { items: res.data.trackings ?? [], next }
  }

  // ── Carriers ───────────────────────────────────────────────────────────────

  async listCarriers(credentials: Credentials, _params: QueryParams): Promise<Carrier[]> {
    const client = new AfterShipClient(credentials)
    const res = await client.get<{ data: { couriers: AfterShipCourier[] } }>('couriers')
    return (res.data.couriers ?? []).map(transformCarrier)
  }

  async getCarrier(credentials: Credentials, id: string): Promise<Carrier> {
    const client = new AfterShipClient(credentials)
    // AfterShip lists all couriers; filter by slug
    const res = await client.get<{ data: { couriers: AfterShipCourier[] } }>('couriers/all')
    const courier = (res.data.couriers ?? []).find((c) => c.slug === id)
    if (!courier) throw new Error(`Carrier not found: ${id}`)
    return transformCarrier(courier)
  }

  // ── Labels (Shipping API / Postmen v3) ─────────────────────────────────────

  async listLabels(credentials: Credentials, params: QueryParams): Promise<Label[]> {
    const client = new AfterShipClient(credentials, AFTERSHIP_SHIPPING_API_BASE)
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<{ data: { labels: AfterShipLabel[]; total: number } }>(
      'labels',
      { limit, page: (params as Record<string, unknown>).page ?? undefined },
    )
    return (res.data.labels ?? []).map(transformLabel)
  }

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new AfterShipClient(credentials, AFTERSHIP_SHIPPING_API_BASE)
    const res = await client.get<{ data: AfterShipLabel }>(`labels/${id}`)
    return transformLabel(res.data)
  }

  // ── Manifests (Shipping API / Postmen v3) ──────────────────────────────────

  async listManifests(credentials: Credentials, params: QueryParams): Promise<Manifest[]> {
    const client = new AfterShipClient(credentials, AFTERSHIP_SHIPPING_API_BASE)
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<{ data: { manifests: AfterShipManifest[]; total: number } }>(
      'manifests',
      { limit, page: (params as Record<string, unknown>).page ?? undefined },
    )
    return (res.data.manifests ?? []).map(transformManifest)
  }

  async getManifest(credentials: Credentials, id: string): Promise<Manifest> {
    const client = new AfterShipClient(credentials, AFTERSHIP_SHIPPING_API_BASE)
    const res = await client.get<{ data: AfterShipManifest }>(`manifests/${id}`)
    return transformManifest(res.data)
  }

  // ── Rates (Shipping API / Postmen v3) ─────────────────────────────────────
  // getRates is a POST endpoint; request body describes the shipment.

  async getRates(credentials: Credentials, _params: RateRequestParams): Promise<Rate[]> {
    const client = new AfterShipClient(credentials, AFTERSHIP_SHIPPING_API_BASE)
    // The Postmen /rates endpoint returns a list of rate objects with individual quotes.
    // We query the list endpoint (GET /rates) since AfterShip caches rate results.
    const res = await client.get<{ data: { rates: AfterShipRate[] } }>('rates')
    return (res.data.rates ?? []).map(transformRate)
  }

  // ── Pickups (Shipping API / Postmen v3) ────────────────────────────────────
  // Carrier collections booked on a FedEx / UPS / DHL Express / Purolator
  // shipper account. The list is token-paginated (`next_token`), not paged.

  async listPickups(credentials: Credentials, params: QueryParams): Promise<Pickup[]> {
    const client = new AfterShipClient(credentials, AFTERSHIP_SHIPPING_API_BASE)
    const limit = sentSize(params)
    const fetchPage = async (nextToken: string | undefined) => {
      const res = await client.get<{
        data: { pickups: AfterShipPickup[]; next_token?: string | null }
      }>('pickups', { limit, next_token: nextToken })
      return { items: res.data.pickups ?? [], next: res.data.next_token || null }
    }
    // A direct caller holding a `next_token` is at a position, not a page.
    if (typeof params.cursor === 'string') {
      return (await fetchPage(params.cursor)).items.map(transformPickup)
    }
    const key = cursorPagerKey(pagerScope(credentials), 'pickups', { limit })
    const { items, hasMore } = await pageByCursor(key, params.page, fetchPage)
    reportCursorPage(params, limit, hasMore)
    return items.map(transformPickup)
  }

  async getPickup(credentials: Credentials, id: string): Promise<Pickup> {
    const client = new AfterShipClient(credentials, AFTERSHIP_SHIPPING_API_BASE)
    const res = await client.get<{ data: AfterShipPickup }>(`pickups/${id}`)
    return transformPickup(res.data)
  }

  async createPickup(credentials: Credentials, data: PickupRequestParams): Promise<Pickup> {
    const client = new AfterShipClient(credentials, AFTERSHIP_SHIPPING_API_BASE)
    // Synchronous: the response is the pickup record, already `created` (or
    // `failed`) with the carrier's confirmation number when it has one.
    const res = await client.post<{ data: AfterShipPickup }>('pickups', toPickupRequest(data))
    return transformPickup(res.data)
  }

  async cancelPickup(
    credentials: Credentials,
    id: string,
    _data?: PickupCancelParams,
  ): Promise<Pickup> {
    const client = new AfterShipClient(credentials, AFTERSHIP_SHIPPING_API_BASE)
    // AfterShip cancels by posting a cancel-pickup record, and answers with
    // THAT record ({ id, status, pickup: { id } }), not the pickup — so the
    // pickup is re-read afterwards to return its actual state. `reason` has no
    // field to land in and is ignored.
    const res = await client.post<{ data: AfterShipCancelPickup }>('cancel-pickups', {
      pickup: { id },
    })
    if (res.data.status === 'failed') {
      throw new Error(`AfterShip could not cancel pickup ${id}: cancel-pickup ${res.data.id} failed`)
    }
    const pickup = await client.get<{ data: AfterShipPickup }>(`pickups/${id}`)
    return transformPickup(pickup.data)
  }
}
