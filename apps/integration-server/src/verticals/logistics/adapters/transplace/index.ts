// ── Resource coverage ──────────────────────────────────────────────────────────
// Available:   order, shipment, trackingevent
// Unverified:  carrier    — Transplace/Uber Freight has no public API docs; cannot confirm /carriers endpoint
// Unverified:  label      — Enterprise freight TMS; parcel-style labels unlikely but unconfirmable without docs
// Unverified:  manifest   — No public API docs; cannot confirm manifest endpoint or schema compatibility
// Unverified:  rate       — Freight rate procurement is a known TMS feature but no public endpoint docs accessible
// Unverified:  warehouse  — No public API docs; cannot confirm /warehouses endpoint

import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Order } from '../../schema/order'

import { buildAuthUrl, exchangeCredentials, refreshCredentials as doRefresh } from './auth'
import { TransplaceClient } from './client'

import { transformTrackingEvents, type TransplaceTrackingResponse } from './transform/tracking'
import { transformShipment, type TransplaceShipmentResponse } from './transform/shipment'
import { transformOrder, type TransplaceOrderResponse } from './transform/order'

export interface TransplaceAdapterConfig {
  clientId?: string
  clientSecret?: string
}

export class TransplaceAdapter implements LogisticsAdapter {
  readonly platform = 'transplace'
  readonly version = '1'

  private config: TransplaceAdapterConfig

  constructor(config: TransplaceAdapterConfig = {}) {
    this.config = config
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error('transplace: clientId and clientSecret are required')
    }
    return exchangeCredentials({
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
    })
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new TransplaceClient(credentials)
    const res = await client.get<TransplaceTrackingResponse>(`/shipments/${trackingNumber}/tracking`)
    return transformTrackingEvents(res)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new TransplaceClient(credentials)

    const body = {
      serviceType: data.serviceCode,
      origin: {
        name: data.originAddress?.name,
        company: data.originAddress?.company,
        address: data.originAddress?.street1,
        city: data.originAddress?.city,
        state: data.originAddress?.state,
        zipCode: data.originAddress?.postalCode,
        country: data.originAddress?.country,
        phone: data.originAddress?.phone,
        email: data.originAddress?.email,
      },
      destination: {
        name: data.destinationAddress?.name,
        company: data.destinationAddress?.company,
        address: data.destinationAddress?.street1,
        city: data.destinationAddress?.city,
        state: data.destinationAddress?.state,
        zipCode: data.destinationAddress?.postalCode,
        country: data.destinationAddress?.country,
        phone: data.destinationAddress?.phone,
        email: data.destinationAddress?.email,
      },
      weight: data.totalWeight
        ? { value: data.totalWeight.value, unit: data.totalWeight.unit === 'kg' ? 'KG' : 'LBS' }
        : undefined,
    }

    const res = await client.post<TransplaceShipmentResponse>('/shipments', body)
    return transformShipment(res)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new TransplaceClient(credentials)
    await client.delete(`/shipments/${id}`)
  }

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new TransplaceClient(credentials)
    const res = await client.get<{ shipments: TransplaceShipmentResponse[] }>('/shipments', {
      page: params.page,
      limit: params.limit,
    })
    return (res.shipments ?? []).map(transformShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new TransplaceClient(credentials)
    const res = await client.get<TransplaceShipmentResponse>(`/shipments/${id}`)
    return transformShipment(res)
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  /**
   * List freight orders from Transplace TMS. Orders are the planning-layer
   * entities that drive shipment execution; each order maps to one or more
   * dispatched shipments.
   */
  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new TransplaceClient(credentials)
    const res = await client.get<{ orders?: TransplaceOrderResponse[] }>(
      '/orders',
      { page: params.page, limit: params.limit },
    )
    return (res.orders ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new TransplaceClient(credentials)
    const res = await client.get<TransplaceOrderResponse>(`/orders/${id}`)
    return transformOrder(res)
  }
}
