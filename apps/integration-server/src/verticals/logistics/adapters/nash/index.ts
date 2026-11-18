import { pageLocally, pageOffset, reportUpstreamPage, simpleApiKey } from '@opensteward/shared'
import type { LogisticsAdapter, Credentials, QueryParams, RateRequestParams } from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Order } from '../../schema/order'
import type { Carrier } from '../../schema/carrier'
import type { Warehouse } from '../../schema/warehouse'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { NashClient } from './client'
import { DEFAULT_PAGE_SIZE, ORDERS_MAX_PAGE_SIZE } from './constants'
import { transformTracking, type NashJob } from './transform/tracking'
import { transformShipment, type NashShipment } from './transform/shipment'
import { transformRate, type NashQuote } from './transform/rate'
import { transformTrackingEvent, type NashJobStatus } from './transform/trackingevent'
import { transformOrder, type NashOrder } from './transform/order'
import { transformCarrier, type NashProvider } from './transform/carrier'
import { transformWarehouse, type NashStoreLocation } from './transform/warehouse'

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: label    — Nash embeds labels as documents within order/job responses; no standalone label endpoint exists
// Unavailable: manifest — Nash embeds manifest documents within order responses; no standalone manifest endpoint exists

const SIMPLE_API_KEY_FORM = simpleApiKey()

/** GET /v1/orders response (OrdersListResponse). */
interface NashOrdersListResponse {
  results?: NashOrder[] | null
  totalCount?: number | null
  limit?: number | null
  offset?: number | null
}

/** GET /v1/store_locations response (ListStoreLocationsResponse). */
interface NashStoreLocationsResponse {
  storeLocations?: NashStoreLocation[] | null
}

/** The caller's page size: a whole number of at least 1, else the adapter default. */
function requestedSize(params: QueryParams): number {
  const asked = Number(params.limit)
  return Number.isFinite(asked) && asked >= 1 ? Math.floor(asked) : DEFAULT_PAGE_SIZE
}


export class NashAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'nash'
  readonly version = '1'

  getAuthUrl(state: string): string { return buildAuthUrl(state) }
  async exchangeCode(code: string, _ru: string): Promise<Credentials> { return exchangeApiKey(code) }
  async refreshCredentials(c: Credentials): Promise<Credentials> { return doRefresh(c) }

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new NashClient(credentials)
    const raw = await client.get<NashJob>(`jobs/${trackingNumber}`)
    return transformTracking(raw)
  }

  async listTrackingEvents(credentials: Credentials, params: QueryParams): Promise<TrackingEvent[]> {
    const jobId = String(params['trackingNumber'] ?? params['id'] ?? '')
    if (!jobId) return []
    const client = new NashClient(credentials)
    const raw = await client.get<NashJob>(`jobs/${jobId}`)
    const statusEvent: NashJobStatus = {
      job_id: raw.id,
      status: raw.status,
      created_at: raw.created_at,
    }
    return [transformTrackingEvent(statusEvent, jobId)]
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new NashClient(credentials)
    const raw = await client.post<NashShipment>('jobs', {
      pickup_address: data.originAddress,
      dropoff_address: data.destinationAddress,
      external_id: data.reference,
    })
    return transformShipment(raw)
  }

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new NashClient(credentials)
    const raw = await client.post<{ quotes?: NashQuote[] }>('quotes', {
      pickup_address: params.originAddress,
      dropoff_address: params.destinationAddress,
    })
    return (raw.quotes ?? []).map(transformRate)
  }

  // Paged by limit + offset: https://docs.usenash.com/api-reference/order/listsearch-orders.md
  // — "List orders with filters, sorting, and pagination."; `limit` is
  // "maximum: 100 minimum: 1 ... default: 25", `offset` "minimum: 0"; the
  // response (OrdersListResponse) carries `results` and `totalCount`.
  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new NashClient(credentials)
    const limit = Math.min(requestedSize(params), ORDERS_MAX_PAGE_SIZE)
    const offset = pageOffset(params, limit)
    const raw = await client.get<NashOrdersListResponse | NashOrder[]>('orders', { limit, offset })
    const rows = Array.isArray(raw) ? raw : (raw?.results ?? [])
    const total = !Array.isArray(raw) && typeof raw?.totalCount === 'number' ? raw.totalCount : undefined
    reportUpstreamPage(params, {
      hasMore: total !== undefined ? offset + rows.length < total : rows.length === limit,
      ...(total !== undefined ? { totalCount: total } : {}),
      pageSize: limit,
    })
    return rows.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new NashClient(credentials)
    const raw = await client.get<NashOrder>(`order/${id}`)
    return transformOrder(raw)
  }

  // GET /v1/providers takes no parameters and returns every provider as one
  // array: https://docs.usenash.com/api-reference/provider/get-providers.md
  // — "List all delivery providers configured for the organization". Each
  // caller page is cut from the whole list.
  async listCarriers(credentials: Credentials, params: QueryParams): Promise<Carrier[]> {
    const client = new NashClient(credentials)
    const raw = await client.get<NashProvider[]>('providers')
    return pageLocally((Array.isArray(raw) ? raw : []).map(transformCarrier), params)
  }

  // Paged by size + offset: https://docs.usenash.com/api-reference/store-locations/get-store-locations.md
  // — "Use size and offset parameters to paginate through results." No
  // maximum and no total are documented (the response is `storeLocations`
  // only), so a short page is the end.
  async listWarehouses(credentials: Credentials, params: QueryParams): Promise<Warehouse[]> {
    const client = new NashClient(credentials)
    const size = requestedSize(params)
    const offset = pageOffset(params, size)
    const raw = await client.get<NashStoreLocationsResponse | NashStoreLocation[]>('store_locations', {
      size,
      offset,
    })
    const rows = Array.isArray(raw) ? raw : (raw?.storeLocations ?? [])
    reportUpstreamPage(params, { hasMore: rows.length === size, pageSize: size })
    return rows.map(transformWarehouse)
  }
}
