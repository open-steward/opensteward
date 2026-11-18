// ── Resource coverage ──────────────────────────────────────────────
// Unverified:  carrier  — no public endpoint; API docs behind enterprise login at developer-link.blueyonder.com
// Unverified:  label    — no public endpoint; API docs behind enterprise login at developer-link.blueyonder.com
// Unverified:  manifest — no public endpoint; API docs behind enterprise login at developer-link.blueyonder.com
// Unverified:  rate     — no public endpoint; API docs behind enterprise login at developer-link.blueyonder.com

import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Order } from '../../schema/order'
import type { Warehouse } from '../../schema/warehouse'

import {
  buildAuthUrlWithClient,
  exchangeCode as doExchangeCode,
  refreshCredentials as doRefresh,
} from './auth'
import { BlueYonderClient } from './client'
import { transformTrackingEvents, type BlueYonderTrackingResponse } from './transform/tracking'
import { transformShipment, type BlueYonderShipmentResponse } from './transform/shipment'
import { transformOrder, type BlueYonderOrderResponse } from './transform/order'
import { transformWarehouse, type BlueYonderWarehouseResponse } from './transform/warehouse'

export interface BlueYonderAdapterConfig {
  clientId?: string
  clientSecret?: string
  redirectUri?: string
  scopes?: string
}

export class BlueYonderAdapter implements LogisticsAdapter {
  readonly platform = 'blue-yonder'
  readonly version = '1'

  private config: BlueYonderAdapterConfig

  constructor(config: BlueYonderAdapterConfig = {}) {
    this.config = config
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    const clientId = this.config.clientId ?? ''
    const redirectUri = this.config.redirectUri ?? ''
    return buildAuthUrlWithClient(state, clientId, redirectUri, overrideScopes?.join(' ') ?? this.config.scopes)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error('blue-yonder: clientId and clientSecret are required')
    }
    return doExchangeCode(code, redirectUri, {
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
    })
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new BlueYonderClient(credentials)
    const res = await client.get<{ shipments: BlueYonderShipmentResponse[] }>('/shipments', {
      page: params.page,
      limit: params.limit,
    })
    return (res.shipments ?? []).map(transformShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new BlueYonderClient(credentials)
    const res = await client.get<BlueYonderShipmentResponse>(`/shipments/${id}`)
    return transformShipment(res)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new BlueYonderClient(credentials)
    await client.delete(`/shipments/${id}`)
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new BlueYonderClient(credentials)
    const res = await client.get<{ orders: BlueYonderOrderResponse[] }>('/orders', {
      page: params.page,
      limit: params.limit,
    })
    return (res.orders ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new BlueYonderClient(credentials)
    const res = await client.get<BlueYonderOrderResponse>(`/orders/${id}`)
    return transformOrder(res)
  }

  // ── Warehouses ─────────────────────────────────────────────────────────────

  async listWarehouses(credentials: Credentials, params: QueryParams): Promise<Warehouse[]> {
    const client = new BlueYonderClient(credentials)
    const res = await client.get<{ warehouses: BlueYonderWarehouseResponse[] }>('/warehouses', {
      page: params.page,
      limit: params.limit,
    })
    return (res.warehouses ?? []).map(transformWarehouse)
  }

  async getWarehouse(credentials: Credentials, id: string): Promise<Warehouse> {
    const client = new BlueYonderClient(credentials)
    const res = await client.get<BlueYonderWarehouseResponse>(`/warehouses/${id}`)
    return transformWarehouse(res)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new BlueYonderClient(credentials)
    const res = await client.get<BlueYonderTrackingResponse>(
      `/tracking/${encodeURIComponent(trackingNumber)}`,
    )
    return transformTrackingEvents(res)
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(_payload: Buffer, _headers: Record<string, string>, _secret: string): boolean {
    return false
  }
}
