// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: label    — no dedicated label endpoint in the 3PL WM REST API; label URLs are embedded in shipment records as `labelUrl`
// Unavailable: manifest — no manifest endpoint in the 3PL WM REST API; manifesting is a UI-only or Parcel API concept
// Unavailable: rate     — no rate-shopping endpoint in the 3PL WM REST API; rate selection is handled via UI or the separate Extensiv Parcel API product

import type { LogisticsAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { Order } from '../../schema/order'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Warehouse } from '../../schema/warehouse'
import type { Carrier } from '../../schema/carrier'

import { buildAuthUrl, exchangeCredentials, refreshCredentials as doRefresh } from './auth'
import { ExtensivClient } from './client'
import { pageLocally, reportUpstreamPage } from '@opensteward/shared'

import { transformTracking, type ExtensivTrackingResponse } from './transform/tracking'
import { transformShipment, type ExtensivShipment } from './transform/shipment'
import { transformOrder, type ExtensivOrder } from './transform/order'
import {
  transformWarehouse,
  facilityRows,
  type ExtensivFacilitiesResponse,
} from './transform/warehouse'
import { transformCarriers, type ExtensivCarriersResponse } from './transform/carrier'

interface ExtensivAdapterConfig {
  sandbox?: boolean
}

export class ExtensivAdapter implements LogisticsAdapter {
  readonly platform = 'extensiv'
  readonly version = '1'

  constructor(_config: ExtensivAdapterConfig = {}) {}

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    const [clientId, clientSecret, tplGuid, userLoginId] = code.split(':')
    return exchangeCredentials({ clientId, clientSecret, tplGuid, userLoginId })
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new ExtensivClient(credentials)
    const raw = await client.get<ExtensivOrder>(`orders/${encodeURIComponent(id)}`)
    return transformOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new ExtensivClient(credentials)
    const raw = await client.post<ExtensivOrder>('orders', {
      referenceNum: data.orderNumber,
      customerId: data.customerId,
      warehouseId: data.warehouseId,
      shipToAddress: data.destinationAddress,
      shipFromAddress: data.originAddress,
      items: data.lineItems?.map((li) => ({
        sku: li.sku,
        quantity: li.quantity,
        description: li.description,
        unitPrice: li.unitAmount,
      })),
      notes: data.notes,
      requestedServiceCode: data.requestedServiceCode,
    })
    return transformOrder(raw)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new ExtensivClient(credentials)
    const raw = await client.get<ExtensivShipment>(`shipments/${encodeURIComponent(id)}`)
    return transformShipment(raw)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new ExtensivClient(credentials)
    const raw = await client.post<ExtensivShipment>('shipments', {
      shipFromAddress: data.originAddress,
      shipToAddress: data.destinationAddress,
      weight: data.totalWeight?.value,
      weightUnit: data.totalWeight?.unit,
      serviceCode: data.serviceCode,
      reference: data.reference,
    })
    return transformShipment(raw)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new ExtensivClient(credentials)
    const raw = await client.get<ExtensivTrackingResponse>(
      `tracking/${encodeURIComponent(trackingNumber)}`,
    )
    return transformTracking(raw)
  }

  // ── Carriers ───────────────────────────────────────────────────────────────

  /**
   * `GET /properties/carriers` documents no paging parameters and answers with
   * every carrier in one HAL object, so the caller's page is cut locally.
   */
  async listCarriers(credentials: Credentials, params: QueryParams): Promise<Carrier[]> {
    return pageLocally(await this.fetchCarriers(credentials), params)
  }

  /**
   * The id is the carrier `name`, the key of the documented
   * `/properties/carriers/{name}` link. That route's response is not
   * documented, so the carrier is read from the documented collection.
   */
  async getCarrier(credentials: Credentials, id: string): Promise<Carrier> {
    const found = (await this.fetchCarriers(credentials)).find((c) => c.id === id)
    if (!found) throw notFound(`Extensiv carrier ${id} not found`)
    return found
  }

  private async fetchCarriers(credentials: Credentials): Promise<Carrier[]> {
    const client = new ExtensivClient(credentials)
    return transformCarriers(await client.get<ExtensivCarriersResponse>('properties/carriers'))
  }

  // ── Warehouses ─────────────────────────────────────────────────────────────

  /**
   * Warehouses are 3PL Warehouse Manager facilities: `GET /properties/facilities`
   * with `pgsiz` ("Set max records to return per response") and `pgnum`
   * ("Consider pgsiz, returns the pgnum-th page, 1-indexed"). The documented
   * `totalResults` makes `hasMore` exact.
   */
  async listWarehouses(credentials: Credentials, params: QueryParams): Promise<Warehouse[]> {
    const client = new ExtensivClient(credentials)
    const page = params.page ?? 1
    const query: Record<string, unknown> = { pgnum: page }
    if (params.limit !== undefined) query.pgsiz = params.limit
    const res = await client.get<ExtensivFacilitiesResponse>('properties/facilities', query)
    const rows = facilityRows(res)
    const total = res?.totalResults
    if (typeof total === 'number' && params.limit !== undefined) {
      reportUpstreamPage(params, {
        totalCount: total,
        hasMore: page * params.limit < total,
      })
    }
    return rows.map(transformWarehouse)
  }

  /**
   * No single-facility route is documented, so the facility is found by
   * walking the documented collection with `pgnum` until `totalResults` rows
   * have been seen.
   */
  async getWarehouse(credentials: Credentials, id: string): Promise<Warehouse> {
    const client = new ExtensivClient(credentials)
    let seen = 0
    for (let pgnum = 1; pgnum <= MAX_FACILITY_PAGES; pgnum++) {
      const res = await client.get<ExtensivFacilitiesResponse>('properties/facilities', { pgnum })
      const rows = facilityRows(res)
      const hit = rows.find((r) => r.facilityId != null && String(r.facilityId) === id)
      if (hit) return transformWarehouse(hit)
      seen += rows.length
      const total = res?.totalResults
      if (rows.length === 0 || typeof total !== 'number' || seen >= total) break
    }
    throw notFound(`Extensiv facility ${id} not found`)
  }
}

/** Upper bound on the facility pages getWarehouse walks. */
const MAX_FACILITY_PAGES = 100

function notFound(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 404, code: 'NOT_FOUND' })
}
