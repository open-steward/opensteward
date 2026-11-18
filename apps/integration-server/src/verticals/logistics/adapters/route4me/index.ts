// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: carrier  — Route4Me is a route-optimization platform, not a carrier; no carrier management API exists
// Unavailable: label    — Route4Me does not generate shipping labels; no label endpoint exists
// Unavailable: manifest — Route4Me has no manifest concept or endpoint
// Unavailable: rate     — Route4Me is not a carrier rating service; no rate/quote endpoint exists

import {
  connectionScope,
  cursorPagerKey,
  pageByRows,
  pageOffset,
  reportUpstreamPage,
  simpleApiKey,
} from '@opensteward/shared'
import type { LogisticsAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { Order } from '../../schema/order'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Warehouse } from '../../schema/warehouse'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { Route4MeClient } from './client'
import {
  transformShipment,
  type Route4MeOptimization,
} from './transform/shipment'
import {
  transformTrackingEvents,
  type Route4MeRouteDestination,
} from './transform/tracking'
import { transformOrder, type Route4MeOrder } from './transform/order'
import { transformWarehouse, type Route4MeDepot } from './transform/warehouse'

const SIMPLE_API_KEY_FORM = simpleApiKey()

interface OptimizationListResponse {
  optimizations?: Route4MeOptimization[] | null
  totalRecords?: number | null
  [key: string]: unknown
}

interface RouteResponse {
  addresses?: Route4MeRouteDestination[] | null
  route_id?: string | null
  [key: string]: unknown
}

interface OrderListResponse {
  results?: Route4MeOrder[] | null
  total?: number | null
  [key: string]: unknown
}

interface DepotListResponse {
  data?: Route4MeDepot[] | null
  [key: string]: unknown
}

/**
 * Offset paging on the v4 list endpoints (https://route4me.io/docs/):
 * `limit` is "The number of records to return." and `offset` is "Search
 * starting position" (Get Optimizations, Get Multiple Routes) / "The number of
 * records to skip before searching." (Get Orders). Optimizations report
 * `totalRecords`, orders `total`; a routes page is a bare array.
 */
const DEFAULT_LIMIT = 30

/**
 * Routes fetched per upstream request when flattening their destinations into
 * tracking events. The docs name no maximum; 20 is the size their own
 * Get Multiple Routes example asks for.
 */
const ROUTE_PAGE_SIZE = 20

/** Report hasMore from a documented total, else from a short page. */
function reportOffsetPage(
  params: QueryParams,
  offset: number,
  limit: number,
  got: number,
  total: number | null | undefined,
): void {
  if (typeof total === 'number' && Number.isFinite(total)) {
    reportUpstreamPage(params, { totalCount: total, hasMore: offset + got < total })
  } else if (got < limit) {
    reportUpstreamPage(params, { hasMore: false })
  }
}

// Depot/warehouse endpoint lives on the v5 API host
const ROUTE4ME_V5_BASE = 'https://wh.route4me.com/modules/api/v5.0/'

export class Route4MeAdapter implements LogisticsAdapter {
  // Connect Link support — single API-key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'route4me'
  readonly version = '1'

  getAuthUrl(state: string): string { return buildAuthUrl(state) }
  async exchangeCode(code: string, _ru: string): Promise<Credentials> { return exchangeApiKey(code) }
  async refreshCredentials(c: Credentials): Promise<Credentials> { return doRefresh(c) }

  // ── Shipments (optimization problems) ────────────────────────────────────

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new Route4MeClient(credentials)
    const limit = params.limit ?? DEFAULT_LIMIT
    const offset = pageOffset(params, limit)
    const raw = await client.get<OptimizationListResponse | Route4MeOptimization[]>(
      'optimization_problem.php',
      { state: params.state ?? 4, limit, offset },
    )
    const items: Route4MeOptimization[] = Array.isArray(raw)
      ? raw
      : (raw as OptimizationListResponse).optimizations ?? []
    const total = Array.isArray(raw) ? undefined : (raw as OptimizationListResponse).totalRecords
    reportOffsetPage(params, offset, limit, items.length, total)
    return items.map(transformShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new Route4MeClient(credentials)
    const raw = await client.get<Route4MeOptimization>(
      'optimization_problem.php',
      { optimization_problem_id: id },
    )
    return transformShipment(raw)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new Route4MeClient(credentials)
    const addresses: Record<string, unknown>[] = []
    if (data.originAddress) {
      addresses.push({
        address: data.originAddress.street1,
        alias: data.originAddress.name,
        is_depot: true,
      })
    }
    if (data.destinationAddress) {
      addresses.push({
        address: data.destinationAddress.street1,
        alias: data.destinationAddress.name,
        first_name: data.destinationAddress.name,
        city: data.destinationAddress.city,
        state: data.destinationAddress.state,
        country_id: data.destinationAddress.country,
        zip: data.destinationAddress.postalCode,
        phone: data.destinationAddress.phone,
        email: data.destinationAddress.email,
        is_depot: false,
      })
    }
    const raw = await client.post<Route4MeOptimization>('optimization_problem.php', {
      parameters: {
        algorithm_type: 1,
        route_name: data.reference ?? 'Integration Route',
        rt: false,
      },
      addresses,
    })
    return transformShipment(raw)
  }

  // ── Tracking events (route destination visits) ───────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new Route4MeClient(credentials)
    const raw = await client.get<RouteResponse>('route.php', { route_id: trackingNumber })
    const routeId = raw.route_id ?? trackingNumber
    const addresses: Route4MeRouteDestination[] = raw.addresses ?? []
    return transformTrackingEvents(addresses, routeId)
  }

  async listTrackingEvents(credentials: Credentials, params: QueryParams): Promise<TrackingEvent[]> {
    const client = new Route4MeClient(credentials)
    // Recent routes, their destinations flattened into tracking events. A page
    // of routes holds any number of events, so caller pages are cut by rows
    // from route pages walked by offset.
    const key = cursorPagerKey(connectionScope('route4me', credentials), 'route-events', {
      limit: ROUTE_PAGE_SIZE,
    })
    const { items } = await pageByRows<TrackingEvent, number>(
      key,
      params,
      async (cursor) => {
        const offset = cursor ?? 0
        const raw = await client.get<RouteResponse[] | { data?: RouteResponse[] }>(
          'route.php',
          { limit: ROUTE_PAGE_SIZE, offset },
        )
        const routes: RouteResponse[] = Array.isArray(raw)
          ? raw
          : (raw as { data?: RouteResponse[] }).data ?? []
        return {
          items: routes.flatMap((r) =>
            transformTrackingEvents(r.addresses ?? [], r.route_id ?? ''),
          ),
          next: routes.length < ROUTE_PAGE_SIZE ? null : offset + ROUTE_PAGE_SIZE,
        }
      },
      { defaultLimit: DEFAULT_LIMIT },
    )
    return items
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new Route4MeClient(credentials)
    const limit = params.limit ?? DEFAULT_LIMIT
    const offset = pageOffset(params, limit)
    const raw = await client.get<OrderListResponse | Route4MeOrder[]>(
      'order.php',
      { limit, offset, fields: params.fields as string | undefined },
    )
    const items: Route4MeOrder[] = Array.isArray(raw)
      ? raw
      : (raw as OrderListResponse).results ?? []
    const total = Array.isArray(raw) ? undefined : (raw as OrderListResponse).total
    reportOffsetPage(params, offset, limit, items.length, total)
    return items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new Route4MeClient(credentials)
    const raw = await client.get<Route4MeOrder>('order.php', { order_id: id })
    return transformOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new Route4MeClient(credentials)
    const raw = await client.post<Route4MeOrder>('order.php', {
      address_1: data.destinationAddress?.street1,
      address_alias: data.destinationAddress?.name,
      address_city: data.destinationAddress?.city,
      address_state_id: data.destinationAddress?.state,
      address_country_id: data.destinationAddress?.country,
      address_zip: data.destinationAddress?.postalCode,
      first_name: data.destinationAddress?.name,
      phone: data.destinationAddress?.phone,
      email: data.destinationAddress?.email,
      ext_field_custom_data: data.notes,
    })
    return transformOrder(raw)
  }

  async updateOrder(credentials: Credentials, id: string, data: Partial<Order>): Promise<Order> {
    const client = new Route4MeClient(credentials)
    const raw = await client.put<Route4MeOrder>('order.php', {
      order_id: id,
      address_1: data.destinationAddress?.street1,
      address_alias: data.destinationAddress?.name,
      address_city: data.destinationAddress?.city,
      address_state_id: data.destinationAddress?.state,
      address_country_id: data.destinationAddress?.country,
      address_zip: data.destinationAddress?.postalCode,
      first_name: data.destinationAddress?.name,
      phone: data.destinationAddress?.phone,
      email: data.destinationAddress?.email,
      ext_field_custom_data: data.notes,
    })
    return transformOrder(raw)
  }

  async cancelOrder(credentials: Credentials, id: string): Promise<void> {
    const client = new Route4MeClient(credentials)
    await client.delete('order.php', { order_id: id })
  }

  // ── Warehouses (depot addresses on the v5 API) ────────────────────────────

  async listWarehouses(credentials: Credentials, params: QueryParams): Promise<Warehouse[]> {
    const client = new Route4MeClient(credentials, ROUTE4ME_V5_BASE)
    const page = params.offset != null && params.limit != null
      ? Math.floor((params.offset as number) / (params.limit as number)) + 1
      : 1
    const perPage = params.limit ?? 30
    const raw = await client.get<DepotListResponse | Route4MeDepot[]>(
      'address-book/addresses/depots',
      { page, per_page: perPage },
    )
    const items: Route4MeDepot[] = Array.isArray(raw)
      ? raw
      : (raw as DepotListResponse).data ?? []
    return items.map(transformWarehouse)
  }

  async getWarehouse(credentials: Credentials, id: string): Promise<Warehouse> {
    const client = new Route4MeClient(credentials, ROUTE4ME_V5_BASE)
    const raw = await client.get<Route4MeDepot>(
      'address-book/addresses/depots',
      { address_id: id },
    )
    return transformWarehouse(raw)
  }
}
