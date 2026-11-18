// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: carrier  — ShipMonk has no carrier listing endpoint; carrier codes appear only as metadata on shipments/webhooks
// Unavailable: rate     — ShipMonk auto-selects rates internally; no rate-quoting endpoint exists
// Unavailable: manifest — ShipMonk has no manifest endpoint in its public API

import { reportUpstreamPage, simpleApiKey } from '@opensteward/shared'
import type { LogisticsAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { Order } from '../../schema/order'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Warehouse } from '../../schema/warehouse'
import type { Label } from '../../schema/label'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { ShipmonkClient } from './client'
import { SHIPMONK_DEFAULT_PAGE_SIZE, SHIPMONK_MAX_PAGE_SIZE } from './constants'

import { transformTracking, type ShipmonkTrackingResponse } from './transform/tracking'
import { transformShipment, type ShipmonkShipment } from './transform/shipment'
import { transformOrder, type ShipmonkOrder } from './transform/order'
import { transformWarehouse, type ShipmonkWarehouse, type ShipmonkWarehouseListResponse } from './transform/warehouse'
import { transformLabel } from './transform/label'

interface ShipmonkAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()

/** ShipMonk's `page` + `pageSize` for the caller's 1-based page and limit, pageSize capped at 1000. */
function shipmonkPageQuery(params: QueryParams): { page: number; pageSize: number } {
  const p = Number(params.page)
  const n = Number(params.limit)
  return {
    page: Number.isFinite(p) && p >= 1 ? Math.floor(p) : 1,
    pageSize:
      Number.isFinite(n) && n >= 1
        ? Math.min(Math.floor(n), SHIPMONK_MAX_PAGE_SIZE)
        : SHIPMONK_DEFAULT_PAGE_SIZE,
  }
}

/** Report the end from ShipMonk's `paginator` ({ total, pages, page }). */
function reportShipmonkPage(params: QueryParams, pageSize: number, paginator: unknown): void {
  if (!paginator || typeof paginator !== 'object') return
  const { total, pages, page } = paginator as { total?: unknown; pages?: unknown; page?: unknown }
  if (typeof pages !== 'number' || typeof page !== 'number') return
  reportUpstreamPage(params, {
    hasMore: page < pages,
    ...(typeof total === 'number' ? { totalCount: total } : {}),
    pageSize,
  })
}


export class ShipmonkAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'shipmonk'
  readonly version = '1'

  constructor(_config: ShipmonkAdapterConfig = {}) {}

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new ShipmonkClient(credentials)
    const raw = await client.get<ShipmonkOrder>(`v1/orders/${encodeURIComponent(id)}`)
    return transformOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new ShipmonkClient(credentials)
    const raw = await client.post<ShipmonkOrder>('v1/orders', {
      order_number: data.orderNumber,
      customer_id: data.customerId,
      warehouse_id: data.warehouseId,
      ship_to: data.destinationAddress,
      ship_from: data.originAddress,
      items: data.lineItems?.map((li) => ({
        sku: li.sku,
        quantity: li.quantity,
        name: li.description,
        price: li.unitAmount,
      })),
      notes: data.notes,
      service_code: data.requestedServiceCode,
    })
    return transformOrder(raw)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new ShipmonkClient(credentials)
    const raw = await client.get<ShipmonkShipment>(`v1/shipments/${encodeURIComponent(id)}`)
    return transformShipment(raw)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new ShipmonkClient(credentials)
    const raw = await client.post<ShipmonkShipment>('v1/shipments', {
      ship_from: data.originAddress,
      ship_to: data.destinationAddress,
      weight: data.totalWeight?.value,
      weight_unit: data.totalWeight?.unit,
      service_code: data.serviceCode,
      reference: data.reference,
    })
    return transformShipment(raw)
  }

  /**
   * GET /v1/integrations/warehouses, paged by `page` (1-based) + `pageSize`
   * (1..1000, default 50); `paginator` = { total, pages, page } marks the end.
   */
  async listWarehouses(credentials: Credentials, params: QueryParams): Promise<Warehouse[]> {
    const client = new ShipmonkClient(credentials)
    const query = shipmonkPageQuery(params)
    const raw = await client.get<ShipmonkWarehouseListResponse>('v1/integrations/warehouses', query)
    reportShipmonkPage(params, query.pageSize, raw.paginator)
    return (raw.data ?? []).map(transformWarehouse)
  }

  async getWarehouse(credentials: Credentials, id: string): Promise<Warehouse> {
    // ShipMonk has no single-warehouse GET; fetch the list and find by id or identifier
    const client = new ShipmonkClient(credentials)
    const raw = await client.get<ShipmonkWarehouseListResponse>('v1/integrations/warehouses')
    const match = (raw.data ?? []).find(
      (w: ShipmonkWarehouse) => String(w.id) === id || w.identifier === id,
    )
    if (!match) throw new Error(`ShipMonk warehouse not found: ${id}`)
    return transformWarehouse(match)
  }

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    // Label data is embedded on the shipment; retrieve the shipment and derive the label
    const client = new ShipmonkClient(credentials)
    const raw = await client.get<ShipmonkShipment>(`v1/shipments/${encodeURIComponent(id)}`)
    return transformLabel(raw)
  }

  async listTrackingEvents(credentials: Credentials, params: QueryParams): Promise<TrackingEvent[]> {
    const trackingNumber =
      typeof params.trackingNumber === 'string'
        ? params.trackingNumber
        : undefined
    if (!trackingNumber) return []
    return this.getTrackingEvents(credentials, trackingNumber)
  }

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new ShipmonkClient(credentials)
    const raw = await client.get<ShipmonkTrackingResponse>(
      `v1/tracking/${encodeURIComponent(trackingNumber)}`,
    )
    return transformTracking(raw)
  }
}
