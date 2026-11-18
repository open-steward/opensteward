// ── Resource coverage ──────────────────────────────────────────────────────────
// Unavailable: label    — Kobo360 is a Pan-African truck-freight marketplace (B2B haulage brokerage) with no parcel label concept; no /labels endpoint exists in their API.
// Unavailable: manifest — Kobo360 is a Pan-African truck-freight marketplace (B2B haulage brokerage) with no parcel carrier manifest concept; no /manifests endpoint exists in their API.

import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { Order } from '../../schema/order'
import type { Carrier } from '../../schema/carrier'
import type { Warehouse } from '../../schema/warehouse'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'

import { buildCredentialsFromApiKey, refreshCredentials as doRefresh } from './auth'
import { Kobo360Client } from './client'

import { transformShipment, type Kobo360TripResponse } from './transform/shipment'
import { transformTrackingEvents, type Kobo360TrackingResponse } from './transform/tracking'
import { transformOrder, type Kobo360OrderResponse } from './transform/order'
import { transformRate, type Kobo360RatesResponse } from './transform/rate'

export interface Kobo360AdapterConfig {
  apiKey?: string
}

/**
 * Carrier / warehouse response shapes from Kobo360 carrier / hub endpoints.
 */
interface Kobo360CarrierRaw {
  id?: string
  name?: string
  code?: string
  is_active?: boolean
  tracking_url_template?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

interface Kobo360WarehouseRaw {
  id?: string
  name?: string
  code?: string
  address?: Record<string, unknown>
  is_active?: boolean
  timezone?: string
  cutoff_time?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

import { toAddress, toISODate } from '../shared/transform'

export class Kobo360Adapter implements LogisticsAdapter {
  readonly platform = 'kobo360'
  readonly version = '1'

  private config: Kobo360AdapterConfig

  constructor(config: Kobo360AdapterConfig = {}) {
    this.config = config
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    return 'https://app.kobo360.com/settings/api'
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    if (!this.config.apiKey) {
      throw new Error('kobo360: apiKey is required')
    }
    return buildCredentialsFromApiKey(this.config.apiKey)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new Kobo360Client(credentials)

    const body = {
      origin: {
        address: params.originAddress.street1,
        city: params.originAddress.city,
        state: params.originAddress.state,
        country: params.originAddress.country,
      },
      destination: {
        address: params.destinationAddress.street1,
        city: params.destinationAddress.city,
        state: params.destinationAddress.state,
        country: params.destinationAddress.country,
      },
      weight_kg: params.packages[0]?.weight?.unit === 'kg'
        ? params.packages[0].weight.value
        : undefined,
      service_codes: params.serviceCodes,
    }

    const res = await client.post<Kobo360RatesResponse>('/quotes', body)
    return (res.quotes ?? []).map(transformRate)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new Kobo360Client(credentials)
    const res = await client.get<Kobo360TrackingResponse>(`/trips/${trackingNumber}/tracking`)
    return transformTrackingEvents(res)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new Kobo360Client(credentials)
    const res = await client.get<{ trips: Kobo360TripResponse[] }>('/trips', {
      page: params.page,
      limit: params.limit,
    })
    return (res.trips ?? []).map(transformShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new Kobo360Client(credentials)
    const res = await client.get<Kobo360TripResponse>(`/trips/${id}`)
    return transformShipment(res)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new Kobo360Client(credentials)

    const body = {
      service_type: data.serviceCode,
      origin: data.originAddress
        ? {
            address: data.originAddress.street1,
            city: data.originAddress.city,
            state: data.originAddress.state,
            country: data.originAddress.country,
            phone: data.originAddress.phone,
          }
        : undefined,
      destination: data.destinationAddress
        ? {
            address: data.destinationAddress.street1,
            city: data.destinationAddress.city,
            state: data.destinationAddress.state,
            country: data.destinationAddress.country,
            phone: data.destinationAddress.phone,
          }
        : undefined,
      weight_kg:
        data.totalWeight?.unit === 'kg' ? data.totalWeight.value : undefined,
      notes: data.notes,
      reference: data.reference,
    }

    const res = await client.post<Kobo360TripResponse>('/trips', body)
    return transformShipment(res)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new Kobo360Client(credentials)
    await client.put(`/trips/${id}/cancel`, {})
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new Kobo360Client(credentials)
    const res = await client.get<{ orders: Kobo360OrderResponse[] }>('/orders', {
      page: params.page,
      limit: params.limit,
    })
    return (res.orders ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new Kobo360Client(credentials)
    const res = await client.get<Kobo360OrderResponse>(`/orders/${id}`)
    return transformOrder(res)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new Kobo360Client(credentials)

    const body = {
      order_number: data.orderNumber,
      customer_id: data.customerId,
      service_code: data.requestedServiceCode,
      origin: data.originAddress
        ? {
            address: data.originAddress.street1,
            city: data.originAddress.city,
            state: data.originAddress.state,
            country: data.originAddress.country,
          }
        : undefined,
      destination: data.destinationAddress
        ? {
            address: data.destinationAddress.street1,
            city: data.destinationAddress.city,
            state: data.destinationAddress.state,
            country: data.destinationAddress.country,
          }
        : undefined,
      currency: data.currency,
      notes: data.notes,
    }

    const res = await client.post<Kobo360OrderResponse>('/orders', body)
    return transformOrder(res)
  }

  async updateOrder(credentials: Credentials, id: string, data: Partial<Order>): Promise<Order> {
    const client = new Kobo360Client(credentials)

    const body = {
      status: data.status,
      notes: data.notes,
    }

    const res = await client.put<Kobo360OrderResponse>(`/orders/${id}`, body)
    return transformOrder(res)
  }

  async cancelOrder(credentials: Credentials, id: string): Promise<void> {
    const client = new Kobo360Client(credentials)
    await client.put(`/orders/${id}/cancel`, {})
  }

  // ── Carriers ───────────────────────────────────────────────────────────────

  async listCarriers(credentials: Credentials, params: QueryParams): Promise<Carrier[]> {
    const client = new Kobo360Client(credentials)
    const res = await client.get<{ carriers: Kobo360CarrierRaw[] }>('/carriers', {
      page: params.page,
      limit: params.limit,
    })
    return (res.carriers ?? []).map((c) => ({
      id: c.id ? String(c.id) : undefined,
      name: c.name ?? undefined,
      code: c.code ?? undefined,
      trackingUrlTemplate: c.tracking_url_template ?? undefined,
      isActive: c.is_active ?? undefined,
      createdAt: toISODate(c.created_at),
      updatedAt: toISODate(c.updated_at),
      metadata: c as Record<string, unknown>,
    }))
  }

  async getCarrier(credentials: Credentials, id: string): Promise<Carrier> {
    const client = new Kobo360Client(credentials)
    const c = await client.get<Kobo360CarrierRaw>(`/carriers/${id}`)
    return {
      id: c.id ? String(c.id) : undefined,
      name: c.name ?? undefined,
      code: c.code ?? undefined,
      trackingUrlTemplate: c.tracking_url_template ?? undefined,
      isActive: c.is_active ?? undefined,
      createdAt: toISODate(c.created_at),
      updatedAt: toISODate(c.updated_at),
      metadata: c as Record<string, unknown>,
    }
  }

  // ── Warehouses ─────────────────────────────────────────────────────────────

  async listWarehouses(credentials: Credentials, params: QueryParams): Promise<Warehouse[]> {
    const client = new Kobo360Client(credentials)
    const res = await client.get<{ hubs: Kobo360WarehouseRaw[] }>('/hubs', {
      page: params.page,
      limit: params.limit,
    })
    return (res.hubs ?? []).map((w) => ({
      id: w.id ? String(w.id) : undefined,
      name: w.name ?? undefined,
      code: w.code ?? undefined,
      address: toAddress(w.address),
      isActive: w.is_active ?? undefined,
      timezone: w.timezone ?? undefined,
      cutoffTime: w.cutoff_time ?? undefined,
      createdAt: toISODate(w.created_at),
      updatedAt: toISODate(w.updated_at),
      metadata: w as Record<string, unknown>,
    }))
  }

  async getWarehouse(credentials: Credentials, id: string): Promise<Warehouse> {
    const client = new Kobo360Client(credentials)
    const w = await client.get<Kobo360WarehouseRaw>(`/hubs/${id}`)
    return {
      id: w.id ? String(w.id) : undefined,
      name: w.name ?? undefined,
      code: w.code ?? undefined,
      address: toAddress(w.address),
      isActive: w.is_active ?? undefined,
      timezone: w.timezone ?? undefined,
      cutoffTime: w.cutoff_time ?? undefined,
      createdAt: toISODate(w.created_at),
      updatedAt: toISODate(w.updated_at),
      metadata: w as Record<string, unknown>,
    }
  }
}
