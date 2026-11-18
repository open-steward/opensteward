// ── Resource coverage ──────────────────────────────────────────────
// Unavailable:  carrier  — UNVERIFIED: CargoWise REST API docs are behind a customer-purchase gate; no public endpoint confirmed
// Unavailable:  label    — UNVERIFIED: CargoWise REST API docs are behind a customer-purchase gate; no public endpoint confirmed
// Unavailable:  manifest — UNVERIFIED: CargoWise REST API docs are behind a customer-purchase gate; no public endpoint confirmed
// Unavailable:  rate     — UNVERIFIED: CargoWise REST API docs are behind a customer-purchase gate; no public endpoint confirmed
// Unavailable:  warehouse — UNVERIFIED: CargoWise REST API docs are behind a customer-purchase gate; no public endpoint confirmed

import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { Order } from '../../schema/order'
import type { TrackingEvent } from '../../schema/trackingevent'

import {
  buildAuthUrl,
  exchangeCode as doExchangeCode,
  refreshCredentials as doRefresh,
} from './auth'
import { CargowiseClient } from './client'
import {
  transformTrackingEvents,
  type CargowiseShipmentTrackingResponse,
} from './transform/tracking'
import {
  transformShipment,
  type CargowiseShipmentResponse,
  type CargowiseShipmentsListResponse,
} from './transform/shipment'
import {
  transformOrder,
  type CargowiseOrderResponse,
  type CargowiseOrdersListResponse,
} from './transform/order'

export interface CargowiseAdapterConfig {
  clientId?: string
  clientSecret?: string
  redirectUri?: string
  scopes?: string[]
}

export class CargowiseAdapter implements LogisticsAdapter {
  readonly platform = 'cargowise'
  readonly version = '1'

  private config: CargowiseAdapterConfig

  constructor(config: CargowiseAdapterConfig = {}) {
    this.config = config
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(state, {
      clientId: this.config.clientId ?? '',
      redirectUri: this.config.redirectUri ?? '',
      scopes: overrideScopes ?? this.config.scopes,
    })
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error('cargowise: clientId and clientSecret are required')
    }
    return doExchangeCode(code, {
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
      redirectUri,
      scopes: this.config.scopes,
    })
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new CargowiseClient(credentials)
    const res = await client.get<CargowiseShipmentsListResponse>('/shipments', {
      page: params.page,
      limit: params.limit,
    })
    return (res.shipments ?? []).map(transformShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new CargowiseClient(credentials)
    const res = await client.get<CargowiseShipmentResponse>(`/shipments/${id}`)
    return transformShipment(res)
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new CargowiseClient(credentials)
    const res = await client.get<CargowiseOrdersListResponse>('/orders', {
      page: params.page,
      limit: params.limit,
    })
    return (res.orders ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new CargowiseClient(credentials)
    const res = await client.get<CargowiseOrderResponse>(`/orders/${id}`)
    return transformOrder(res)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new CargowiseClient(credentials)
    const res = await client.get<CargowiseShipmentTrackingResponse>(
      `/shipments/${trackingNumber}/milestones`,
    )
    return transformTrackingEvents(res)
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(_payload: Buffer, _headers: Record<string, string>, _secret: string): boolean {
    // CargoWise does not expose a publicly documented webhook signature scheme.
    // Return false until a real HMAC or similar verification can be implemented.
    return false
  }
}
