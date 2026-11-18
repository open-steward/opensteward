// ── Resource coverage ──────────────────────────────────────────────
// Available:   order, shipment, trackingevent, warehouse
// Unverified:  carrier — no /carriers list endpoint found in any public VeraCore REST API docs;
//                        CarrierCode is a field on shipments only
// Unverified:  label — no /labels endpoint in public docs; LabelUrl is a field on shipments;
//                      label generation is delegated to third-party tools (e.g. ShipWise)
// Unverified:  manifest — no /manifests endpoint in public docs; manifesting is handled by
//                         third-party integration partners, not the native Public.Api
// Unverified:  rate — no /rates or rate-shopping endpoint in public docs; rate shopping is
//                     performed by third-party tools (e.g. ShipWise), not the native Public.Api

import type { LogisticsAdapter, Credentials } from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { Order } from '../../schema/order'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Warehouse } from '../../schema/warehouse'
import type { QueryParams } from '@opensteward/shared'

import { exchangeCredentials, refreshCredentials as doRefresh } from './auth'
import { VeraCoreClient } from './client'
import { toAddress, toISODate } from '../shared/transform'

import { transformOrder, type VeraCoreOrder, type VeraCoreOrderListResponse } from './transform/order'
import { transformShipment, type VeraCoreShipment, type VeraCoreShipmentListResponse } from './transform/shipment'
import { transformTracking, type VeraCoreTrackingResponse } from './transform/tracking'

interface VeraCoreAdapterConfig {
  /** No-op for api_key auth — reserved for future sandbox flag */
  sandbox?: boolean
}

interface VeraCoreWarehouseRaw {
  WarehouseID: string | number
  WarehouseName?: string | null
  WarehouseCode?: string | null
  Address?: Record<string, unknown> | null
  IsActive?: boolean | null
  Timezone?: string | null
  CutoffTime?: string | null
  CreatedDate?: string | null
  ModifiedDate?: string | null
  [key: string]: unknown
}

interface VeraCoreWarehouseListResponse {
  Warehouses?: VeraCoreWarehouseRaw[]
  [key: string]: unknown
}

function transformWarehouse(raw: VeraCoreWarehouseRaw): Warehouse {
  return {
    id: String(raw.WarehouseID),
    name: raw.WarehouseName ?? undefined,
    code: raw.WarehouseCode ?? undefined,
    address: toAddress(raw.Address),
    isActive: raw.IsActive ?? undefined,
    timezone: raw.Timezone ?? undefined,
    cutoffTime: (raw.CutoffTime as `${number}:${number}` | undefined) ?? undefined,
    createdAt: toISODate(raw.CreatedDate),
    updatedAt: toISODate(raw.ModifiedDate),
    metadata: raw as Record<string, unknown>,
  }
}

export class VeraCoreAdapter implements LogisticsAdapter {
  readonly platform = 'veracore'
  readonly version = '1'

  constructor(_config: VeraCoreAdapterConfig = {}) {}

  /**
   * VeraCore uses username/password/systemId/domain credentials — no OAuth
   * redirect URL needed. Returns a placeholder that UI can use as a label.
   */
  getAuthUrl(_state: string): string {
    return 'https://support.veracore.com'
  }

  /**
   * Exchange a raw credentials string (formatted as
   * "username:password:systemId:domain") by performing the VeraCore two-step
   * token exchange: POST /api/login → Bearer token stored in Credentials.
   */
  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // Parse "username:password:systemId:domain" — split on first three colons
    const parts = code.split(':')
    if (parts.length < 4) {
      throw new Error(
        'VeraCore credentials must be formatted as "username:password:systemId:domain"',
      )
    }
    const [username, password, systemId, ...domainParts] = parts
    const domain = domainParts.join(':')
    return exchangeCredentials({ username, password, systemId, domain })
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ─── Orders ─────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new VeraCoreClient(credentials)
    const raw = await client.get<VeraCoreOrderListResponse>('orders', params as Record<string, unknown>)
    const orders = raw.Orders ?? (Array.isArray(raw) ? (raw as VeraCoreOrder[]) : [])
    return orders.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new VeraCoreClient(credentials)
    const raw = await client.get<VeraCoreOrder>(`orders/${encodeURIComponent(id)}`)
    return transformOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new VeraCoreClient(credentials)
    const raw = await client.post<VeraCoreOrder>('orders', {
      OrderNumber: data.orderNumber,
      CustomerID: data.customerId,
      WarehouseID: data.warehouseId,
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
    const client = new VeraCoreClient(credentials)
    const raw = await client.put<VeraCoreOrder>(`orders/${encodeURIComponent(id)}`, {
      Status: data.status,
      Notes: data.notes,
      ShipToAddress: data.destinationAddress,
      RequestedServiceCode: data.requestedServiceCode,
    })
    return transformOrder(raw)
  }

  async cancelOrder(credentials: Credentials, id: string): Promise<void> {
    const client = new VeraCoreClient(credentials)
    await client.put<VeraCoreOrder>(`orders/${encodeURIComponent(id)}/cancel`, {})
  }

  // ─── Shipments ───────────────────────────────────────────────────────────────

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new VeraCoreClient(credentials)
    const raw = await client.get<VeraCoreShipmentListResponse>('shipments', params as Record<string, unknown>)
    const shipments = raw.Shipments ?? (Array.isArray(raw) ? (raw as VeraCoreShipment[]) : [])
    return shipments.map(transformShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new VeraCoreClient(credentials)
    const raw = await client.get<VeraCoreShipment>(`shipments/${encodeURIComponent(id)}`)
    return transformShipment(raw)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new VeraCoreClient(credentials)
    const raw = await client.post<VeraCoreShipment>('shipments', {
      ShipFromAddress: data.originAddress,
      ShipToAddress: data.destinationAddress,
      Weight: data.totalWeight?.value,
      WeightUnit: data.totalWeight?.unit,
      ServiceCode: data.serviceCode,
      Reference: data.reference,
      WarehouseID: data.warehouseId,
    })
    return transformShipment(raw)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new VeraCoreClient(credentials)
    await client.put<VeraCoreShipment>(`shipments/${encodeURIComponent(id)}/cancel`, {})
  }

  // ─── Tracking ────────────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new VeraCoreClient(credentials)
    const raw = await client.get<VeraCoreTrackingResponse>(
      `tracking/${encodeURIComponent(trackingNumber)}`,
    )
    return transformTracking(raw)
  }

  // ─── Warehouses ──────────────────────────────────────────────────────────────

  async listWarehouses(credentials: Credentials, params: QueryParams): Promise<Warehouse[]> {
    const client = new VeraCoreClient(credentials)
    const raw = await client.get<VeraCoreWarehouseListResponse>('warehouses', params as Record<string, unknown>)
    const warehouses = raw.Warehouses ?? (Array.isArray(raw) ? (raw as VeraCoreWarehouseRaw[]) : [])
    return warehouses.map(transformWarehouse)
  }

  async getWarehouse(credentials: Credentials, id: string): Promise<Warehouse> {
    const client = new VeraCoreClient(credentials)
    const raw = await client.get<VeraCoreWarehouseRaw>(`warehouses/${encodeURIComponent(id)}`)
    return transformWarehouse(raw)
  }
}
