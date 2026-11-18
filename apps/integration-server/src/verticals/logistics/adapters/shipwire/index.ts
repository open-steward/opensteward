// ── Resource coverage ──────────────────────────────────────────────────────
// Unavailable: shipment  — no top-level /shipments endpoint; shipment data is
//              nested under orders (/orders/:id/trackings) and receivings
// Unavailable: label     — labels are generated per-order (/orders/:id/labels),
//              no independently listable/gettable label resource in the API
// Unavailable: manifest  — not documented in Shipwire's REST API; no endpoint
//              exists for carrier manifests

import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
  RateRequestParams,
} from '../../adapter/interface'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Order } from '../../schema/order'
import type { Warehouse } from '../../schema/warehouse'
import type { Carrier } from '../../schema/carrier'
import type { Rate } from '../../schema/rate'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { ShipwireClient } from './client'

import { transformTracking, type ShipwireTrackingResponse } from './transform/tracking'
import { transformOrder, type ShipwireOrder } from './transform/order'
import { transformWarehouse, type ShipwireWarehouse } from './transform/warehouse'
import { transformCarrier, type ShipwireCarrier } from './transform/carrier'
import { transformRate, type ShipwireRateResponse } from './transform/rate'

interface ShipwireAdapterConfig {
  sandbox?: boolean
}

export class ShipwireAdapter implements LogisticsAdapter {
  readonly platform = 'shipwire'
  readonly version = '1'

  constructor(_config: ShipwireAdapterConfig = {}) {}

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // For Shipwire the "code" is the "email:password" pair.
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new ShipwireClient(credentials)
    const raw = await client.get<ShipwireTrackingResponse>(`orders/${trackingNumber}/trackings`)
    return transformTracking(raw)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new ShipwireClient(credentials)
    const raw = await client.get<{ items: ShipwireOrder[] }>('orders', params as Record<string, unknown>)
    return (raw.items ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new ShipwireClient(credentials)
    const raw = await client.get<ShipwireOrder>(`orders/${id}`)
    return transformOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new ShipwireClient(credentials)
    const raw = await client.post<ShipwireOrder>('orders', {
      order_number: data.orderNumber,
      shipping_address: data.destinationAddress
        ? {
            name: data.destinationAddress.name,
            company: data.destinationAddress.company,
            address1: data.destinationAddress.street1,
            address2: data.destinationAddress.street2,
            city: data.destinationAddress.city,
            state: data.destinationAddress.state,
            postal_code: data.destinationAddress.postalCode,
            country: data.destinationAddress.country,
            phone: data.destinationAddress.phone,
            email: data.destinationAddress.email,
          }
        : undefined,
      items: data.lineItems?.map((item) => ({
        sku: item.sku,
        quantity: item.quantity,
      })),
      requested_service: data.requestedServiceCode,
      notes: data.notes,
    })
    return transformOrder(raw)
  }

  // ── Warehouses ────────────────────────────────────────────────────────────

  async listWarehouses(credentials: Credentials, params: QueryParams): Promise<Warehouse[]> {
    const client = new ShipwireClient(credentials)
    const raw = await client.get<{ items: ShipwireWarehouse[] }>('warehouses', params as Record<string, unknown>)
    return (raw.items ?? []).map(transformWarehouse)
  }

  async getWarehouse(credentials: Credentials, id: string): Promise<Warehouse> {
    const client = new ShipwireClient(credentials)
    const raw = await client.get<ShipwireWarehouse>(`warehouses/${id}`)
    return transformWarehouse(raw)
  }

  // ── Carriers ──────────────────────────────────────────────────────────────

  async listCarriers(credentials: Credentials, params: QueryParams): Promise<Carrier[]> {
    const client = new ShipwireClient(credentials)
    const raw = await client.get<{ items: ShipwireCarrier[] }>('carriers', params as Record<string, unknown>)
    return (raw.items ?? []).map(transformCarrier)
  }

  async getCarrier(credentials: Credentials, id: string): Promise<Carrier> {
    const client = new ShipwireClient(credentials)
    const raw = await client.get<ShipwireCarrier>(`carriers/${id}`)
    return transformCarrier(raw)
  }

  // ── Rates ─────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new ShipwireClient(credentials)
    const body = {
      ship_from: params.originAddress
        ? {
            address1: params.originAddress.street1,
            address2: params.originAddress.street2,
            city: params.originAddress.city,
            state: params.originAddress.state,
            postal_code: params.originAddress.postalCode,
            country: params.originAddress.country,
          }
        : undefined,
      ship_to: params.destinationAddress
        ? {
            address1: params.destinationAddress.street1,
            address2: params.destinationAddress.street2,
            city: params.destinationAddress.city,
            state: params.destinationAddress.state,
            postal_code: params.destinationAddress.postalCode,
            country: params.destinationAddress.country,
          }
        : undefined,
      packages: (params.packages ?? []).map((pkg) => ({
        weight: pkg.weight?.value,
        weight_unit: pkg.weight?.unit,
        length: pkg.dimensions?.length,
        width: pkg.dimensions?.width,
        height: pkg.dimensions?.height,
        dimension_unit: pkg.dimensions?.unit,
      })),
      carrier_codes: params.serviceCodes,
    }
    const raw = await client.post<ShipwireRateResponse>('rate', body)
    return (raw.items ?? []).map(transformRate)
  }
}
