// ── Resource coverage ──────────────────────────────────────────────
// Unverified: label    — Swagger UI at api.wdgcorp.com/swagger requires authentication; LabelURL is embedded in shipment responses suggesting WMS-managed printing rather than a standalone /labels endpoint; cannot confirm from public docs.
// Unverified: manifest — Swagger UI at api.wdgcorp.com/swagger requires authentication; end-of-day manifests are an internal WMS workflow; no public docs confirm a /manifests REST endpoint.
// Unverified: rate     — Swagger UI at api.wdgcorp.com/swagger requires authentication; rate shopping is an internal WMS capability; no public docs confirm a /rates REST endpoint.

import type { LogisticsAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { Order } from '../../schema/order'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Warehouse } from '../../schema/warehouse'
import type { Carrier } from '../../schema/carrier'

import { buildAuthUrl, buildCredentials, refreshCredentials as doRefresh } from './auth'
import { DaVinciUnifiedClient } from './client'

import { transformShipment, type DaVinciShipment } from './transform/shipment'
import { transformOrder, type DaVinciOrder } from './transform/order'
import { transformTracking, type DaVinciTrackingResponse } from './transform/tracking'
import { transformWarehouse, type DaVinciWarehouse } from './transform/warehouse'
import { transformCarrier, type DaVinciCarrier } from './transform/carrier'

interface DaVinciUnifiedAdapterConfig {
  sandbox?: boolean
}

interface DaVinciListResponse<T> {
  Data?: T[]
  Items?: T[]
  Results?: T[]
  TotalCount?: number
  [key: string]: unknown
}

function extractList<T>(res: DaVinciListResponse<T> | T[]): T[] {
  if (Array.isArray(res)) return res
  return res.Data ?? res.Items ?? res.Results ?? []
}

export class DaVinciUnifiedAdapter implements LogisticsAdapter {
  readonly platform = 'da-vinci-unified'
  readonly version = '1'

  constructor(_config: DaVinciUnifiedAdapterConfig = {}) {}

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // code is expected to be a JSON string with fields:
    //   { email, password, licenseId, dbName, serverUrl?, sandbox? }
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(code) as Record<string, unknown>
    } catch {
      throw new Error(
        'DaVinciUnified exchangeCode expects a JSON string with fields: email, password, licenseId, dbName (and optionally serverUrl, sandbox)',
      )
    }
    return buildCredentials({
      email: String(parsed['email'] ?? ''),
      password: String(parsed['password'] ?? ''),
      licenseId: String(parsed['licenseId'] ?? ''),
      dbName: String(parsed['dbName'] ?? ''),
      serverUrl: parsed['serverUrl'] != null ? String(parsed['serverUrl']) : undefined,
      sandbox: Boolean(parsed['sandbox'] ?? false),
    })
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ─── Shipments ─────────────────────────────────────────────────────────────

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new DaVinciUnifiedClient(credentials)
    const res = await client.get<DaVinciListResponse<DaVinciShipment> | DaVinciShipment[]>(
      'v1/shipments',
      params as Record<string, unknown>,
    )
    return extractList(res).map(transformShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new DaVinciUnifiedClient(credentials)
    const raw = await client.get<DaVinciShipment>(`v1/shipments/${encodeURIComponent(id)}`)
    return transformShipment(raw)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new DaVinciUnifiedClient(credentials)
    const raw = await client.post<DaVinciShipment>('v1/shipments', {
      ShipFromAddress: data.originAddress,
      ShipToAddress: data.destinationAddress,
      Weight: data.totalWeight?.value,
      WeightUOM: data.totalWeight?.unit,
      CarrierCode: data.carrierId,
      ServiceCode: data.serviceCode,
      WarehouseId: data.warehouseId,
      Reference: data.reference,
    })
    return transformShipment(raw)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new DaVinciUnifiedClient(credentials)
    await client.delete(`v1/shipments/${encodeURIComponent(id)}`)
  }

  // ─── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new DaVinciUnifiedClient(credentials)
    const res = await client.get<DaVinciListResponse<DaVinciOrder> | DaVinciOrder[]>(
      'v1/orders',
      params as Record<string, unknown>,
    )
    return extractList(res).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new DaVinciUnifiedClient(credentials)
    const raw = await client.get<DaVinciOrder>(`v1/orders/${encodeURIComponent(id)}`)
    return transformOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new DaVinciUnifiedClient(credentials)
    const raw = await client.post<DaVinciOrder>('v1/orders', {
      OrderNumber: data.orderNumber,
      CustomerId: data.customerId,
      WarehouseId: data.warehouseId,
      ShipToAddress: data.destinationAddress,
      ShipFromAddress: data.originAddress,
      Items: data.lineItems?.map((li) => ({
        SKU: li.sku,
        Quantity: li.quantity,
        Description: li.description,
        UnitPrice: li.unitAmount,
      })),
      Notes: data.notes,
      RequestedServiceCode: data.requestedServiceCode,
    })
    return transformOrder(raw)
  }

  async updateOrder(credentials: Credentials, id: string, data: Partial<Order>): Promise<Order> {
    const client = new DaVinciUnifiedClient(credentials)
    const raw = await client.put<DaVinciOrder>(`v1/orders/${encodeURIComponent(id)}`, {
      OrderNumber: data.orderNumber,
      Notes: data.notes,
      RequestedServiceCode: data.requestedServiceCode,
      ShipToAddress: data.destinationAddress,
    })
    return transformOrder(raw)
  }

  async cancelOrder(credentials: Credentials, id: string): Promise<void> {
    const client = new DaVinciUnifiedClient(credentials)
    await client.delete(`v1/orders/${encodeURIComponent(id)}`)
  }

  // ─── Carriers ──────────────────────────────────────────────────────────────

  async listCarriers(credentials: Credentials, params: QueryParams): Promise<Carrier[]> {
    const client = new DaVinciUnifiedClient(credentials)
    const res = await client.get<DaVinciListResponse<DaVinciCarrier> | DaVinciCarrier[]>(
      'v1/carriers',
      params as Record<string, unknown>,
    )
    return extractList(res).map(transformCarrier)
  }

  async getCarrier(credentials: Credentials, id: string): Promise<Carrier> {
    const client = new DaVinciUnifiedClient(credentials)
    const raw = await client.get<DaVinciCarrier>(`v1/carriers/${encodeURIComponent(id)}`)
    return transformCarrier(raw)
  }

  // ─── Warehouses ────────────────────────────────────────────────────────────

  async listWarehouses(credentials: Credentials, params: QueryParams): Promise<Warehouse[]> {
    const client = new DaVinciUnifiedClient(credentials)
    const res = await client.get<DaVinciListResponse<DaVinciWarehouse> | DaVinciWarehouse[]>(
      'v1/warehouses',
      params as Record<string, unknown>,
    )
    return extractList(res).map(transformWarehouse)
  }

  async getWarehouse(credentials: Credentials, id: string): Promise<Warehouse> {
    const client = new DaVinciUnifiedClient(credentials)
    const raw = await client.get<DaVinciWarehouse>(`v1/warehouses/${encodeURIComponent(id)}`)
    return transformWarehouse(raw)
  }

  // ─── Tracking Events ───────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new DaVinciUnifiedClient(credentials)
    const raw = await client.get<DaVinciTrackingResponse>(
      `v1/tracking/${encodeURIComponent(trackingNumber)}`,
    )
    return transformTracking(raw)
  }

  async listTrackingEvents(credentials: Credentials, params: QueryParams): Promise<TrackingEvent[]> {
    const client = new DaVinciUnifiedClient(credentials)
    const res = await client.get<DaVinciListResponse<DaVinciTrackingResponse> | DaVinciTrackingResponse[]>(
      'v1/tracking',
      params as Record<string, unknown>,
    )
    return extractList(res).flatMap(transformTracking)
  }
}
