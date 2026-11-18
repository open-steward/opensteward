// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: label — project44 has no parcel label (PDF/PNG/ZPL) API; the Electronic BOL endpoint produces a carrier BOL document, not a shipping label
// Unavailable: manifest — no manifest endpoint exists in the project44 v4 REST API

import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Carrier } from '../../schema/carrier'
import type { Warehouse } from '../../schema/warehouse'
import type { Rate } from '../../schema/rate'
import type { Order } from '../../schema/order'

import { buildAuthUrl, exchangeCredentials, refreshCredentials as doRefresh } from './auth'
import { Project44Client } from './client'
import { pageLocally, pageOffset, reportUpstreamPage } from '@opensteward/shared'

/** POST /inventory/orders/search: `size` "valid range: [1, 1000]", `page` "valid range: [1, 50]". */
const ORDERS_MAX_PAGE_SIZE = 1000
const ORDERS_MAX_PAGE = 50

import { transformTrackingEvents, type Project44TrackingResponse } from './transform/tracking'
import { transformShipment, type Project44ShipmentResponse, type Project44ShipmentsListResponse } from './transform/shipment'
import { transformCarrier, type Project44CapacityProvider, type Project44CapacityProvidersResponse } from './transform/carrier'
import { transformRate, type Project44RateQuotesResponse } from './transform/rate'
import { transformWarehouse, type Project44StopLocation, type Project44StopLocationsResponse } from './transform/warehouse'
import { transformOrder, type Project44Order, type Project44OrdersSearchResponse } from './transform/order'

export interface Project44AdapterConfig {
  clientId?: string
  clientSecret?: string
  sandbox?: boolean
}

export class Project44Adapter implements LogisticsAdapter {
  readonly platform = 'project44'
  readonly version = '1'

  private config: Project44AdapterConfig

  constructor(config: Project44AdapterConfig = {}) {
    this.config = config
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error('project44: clientId and clientSecret are required')
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

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new Project44Client(credentials)
    const res = await client.post<Project44TrackingResponse>('/shipments/track', {
      identifiers: [
        {
          type: 'TRACKING_NUMBER',
          value: trackingNumber,
        },
      ],
    })
    const results = res.results ?? []
    return results.flatMap(transformTrackingEvents)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new Project44Client(credentials)
    const res = await client.get<Project44ShipmentsListResponse>('/shipments', {
      page: params.page,
      limit: params.limit,
    })
    return (res.results ?? []).map(transformShipment)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new Project44Client(credentials)

    const body = {
      trackingNumber: data.trackingNumber,
      carrierCode: data.carrierId,
      mode: data.serviceCode,
      origin: {
        city: data.originAddress?.city,
        state: data.originAddress?.state,
        postalCode: data.originAddress?.postalCode,
        country: data.originAddress?.country,
      },
      destination: {
        city: data.destinationAddress?.city,
        state: data.destinationAddress?.state,
        postalCode: data.destinationAddress?.postalCode,
        country: data.destinationAddress?.country,
      },
    }

    const res = await client.post<Project44ShipmentResponse>('/shipments', body)
    return transformShipment(res)
  }

  // ── Carriers ───────────────────────────────────────────────────────────────

  // GET /capacityproviders documents no paging parameters and returns every
  // capacity provider, so one response is the whole collection: page it here.
  async listCarriers(credentials: Credentials, params: QueryParams): Promise<Carrier[]> {
    const client = new Project44Client(credentials)
    const res = await client.get<Project44CapacityProvidersResponse>('/capacityproviders')
    return pageLocally((res.capacityProviders ?? []).map(transformCarrier), params)
  }

  async getCarrier(credentials: Credentials, id: string): Promise<Carrier> {
    const client = new Project44Client(credentials)
    const res = await client.get<Project44CapacityProvidersResponse>('/capacityproviders', {
      'capacityProviderIdentifier.type': 'SCAC',
      'capacityProviderIdentifier.value': id,
    })
    const raw: Project44CapacityProvider = res.capacityProviders?.[0] ?? {}
    return transformCarrier(raw)
  }

  // ── Warehouses (Stop Locations) ────────────────────────────────────────────

  async listWarehouses(credentials: Credentials, params: QueryParams): Promise<Warehouse[]> {
    const client = new Project44Client(credentials)
    // Offset-paged: `offset` is the first location's position, `pageSize`
    // the page size, `totalItems` the size of the whole list.
    const pageSize = Math.max(1, Math.floor(params.limit ?? 50))
    const offset = pageOffset(params, pageSize)
    const res = await client.get<Project44StopLocationsResponse>('/stoplocations', {
      pageSize,
      offset,
    })
    const rows = res.locations ?? []
    const total = res.totalItems
    reportUpstreamPage(params, {
      hasMore: typeof total === 'number' ? offset + rows.length < total : rows.length >= pageSize,
      ...(typeof total === 'number' ? { totalCount: total } : {}),
    })
    return rows.map(transformWarehouse)
  }

  async getWarehouse(credentials: Credentials, id: string): Promise<Warehouse> {
    const client = new Project44Client(credentials)
    const raw = await client.get<Project44StopLocation>(`/stoplocations/${id}`)
    return transformWarehouse(raw)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new Project44Client(credentials)
    const res = await client.post<Project44RateQuotesResponse>('/ltl/quotes/rates/query', {
      originAddress: {
        postalCode: params.originAddress.postalCode,
        city: params.originAddress.city,
        state: params.originAddress.state,
        country: params.originAddress.country ?? 'US',
      },
      destinationAddress: {
        postalCode: params.destinationAddress.postalCode,
        city: params.destinationAddress.city,
        state: params.destinationAddress.state,
        country: params.destinationAddress.country ?? 'US',
      },
      lineItems: params.packages.map((pkg) => ({
        totalWeight: pkg.weight?.value ?? 0,
        weightUnit: pkg.weight?.unit ?? 'LB',
        totalPieces: 1,
      })),
    })
    return (res.rateQuotes ?? []).map(transformRate)
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    // Page-numbered: query `page` "valid range: [1, 50]" and `size` "valid
    // range: [1, 1000]". The body's `pagination` is sent in step with them.
    const page = typeof params.page === 'number' && params.page >= 1 ? Math.floor(params.page) : 1
    if (page > ORDERS_MAX_PAGE) {
      throw Object.assign(
        new Error(
          `project44: order search serves pages 1..${ORDERS_MAX_PAGE} only (asked for page ${page}); use a larger limit`,
        ),
        { statusCode: 400, code: 'VALIDATION' },
      )
    }
    const limit = Math.max(1, Math.floor(params.limit ?? 50))
    const size = Math.min(limit, ORDERS_MAX_PAGE_SIZE)
    const client = new Project44Client(credentials)
    const res = await client.post<Project44OrdersSearchResponse>(
      '/inventory/orders/search',
      { pagination: { pageNumber: page, pageSize: size } },
      { page, size },
    )
    const items = res.orders ?? res.results ?? []
    const total = res.paginationInfo?.total
    reportUpstreamPage(params, {
      hasMore: typeof total === 'number' ? (page - 1) * size + items.length < total : items.length >= size,
      ...(typeof total === 'number' ? { totalCount: total } : {}),
      ...(size < limit ? { pageSize: size } : {}),
    })
    return items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new Project44Client(credentials)
    const raw = await client.get<Project44Order>(`/inventory/orders/${id}`)
    return transformOrder(raw)
  }
}
