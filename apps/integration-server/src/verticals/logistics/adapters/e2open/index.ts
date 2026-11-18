import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Order } from '../../schema/order'

import {
  buildAuthUrl as doBuildAuthUrl,
  exchangeCode as doExchangeCode,
  refreshCredentials as doRefresh,
} from './auth'
import { E2openClient } from './client'
import { DEFAULT_SCOPES } from './constants'
import {
  transformTrackingEvents,
  type E2openShipmentTrackingResponse,
} from './transform/tracking'
import { transformShipment, type E2openShipmentRaw } from './transform/shipment'
import { transformOrder, type E2openOrderRaw } from './transform/order'

export interface E2openAdapterConfig {
  clientId?: string
  clientSecret?: string
  redirectUri?: string
  scopes?: string[]
}

// ── Resource coverage ──────────────────────────────────────────────────────
// Available:   order, shipment, trackingevent
// Unavailable: carrier — no /carriers list endpoint; carriers are TMS-configured entities not exposed via api.e2open.com/v1
// Unavailable: warehouse — no warehouse management REST endpoint in any documented e2open public API
// Unverified:  label — exists in Global Parcel product (separate authenticated portal, different base URL); not confirmed on api.e2open.com/v1
// Unverified:  manifest — exists in Global Parcel product (separate authenticated portal, different base URL); not confirmed on api.e2open.com/v1
// Unverified:  rate — TMS Rating APIs exist but on different servers (TM-Shippers Rating API); not confirmed on api.e2open.com/v1

// ── Raw API response shapes ─────────────────────────────────────────────────

interface E2openShipmentListResponse {
  shipments?: E2openShipmentRaw[]
  totalCount?: number
  [key: string]: unknown
}

interface E2openOrderListResponse {
  orders?: E2openOrderRaw[]
  [key: string]: unknown
}

// ── Adapter ─────────────────────────────────────────────────────────────────

export class E2openAdapter implements LogisticsAdapter {
  readonly platform = 'e2open'
  readonly version = '1'

  private config: E2openAdapterConfig

  constructor(config: E2openAdapterConfig = {}) {
    this.config = config
  }

  // ── Auth ─────────────────────────────────────────────────────────────────

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return doBuildAuthUrl(state, {
      clientId: this.config.clientId ?? '',
      redirectUri: this.config.redirectUri,
      scopes: overrideScopes ?? this.config.scopes ?? DEFAULT_SCOPES,
    })
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error('e2open: clientId and clientSecret are required')
    }
    return doExchangeCode(code, {
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
      redirectUri: this.config.redirectUri ?? _redirectUri,
      scopes: this.config.scopes,
    })
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Shipments ────────────────────────────────────────────────────────────

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new E2openClient(credentials)
    const res = await client.get<E2openShipmentListResponse>('/shipments', {
      page: params.page,
      pageSize: params.limit,
      ...(params.since ? { updatedSince: (params.since as Date).toISOString() } : {}),
    })
    return (res.shipments ?? []).map(transformShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new E2openClient(credentials)
    const res = await client.get<E2openShipmentRaw>(`/shipments/${id}`)
    return transformShipment(res)
  }

  // ── Tracking Events ──────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new E2openClient(credentials)
    const res = await client.get<E2openShipmentTrackingResponse>(
      `/shipments/${trackingNumber}/tracking`,
    )
    return transformTrackingEvents(res)
  }

  async listTrackingEvents(credentials: Credentials, params: QueryParams): Promise<TrackingEvent[]> {
    const client = new E2openClient(credentials)
    const res = await client.get<{ events?: E2openShipmentTrackingResponse[] }>('/tracking/events', {
      page: params.page,
      pageSize: params.limit,
      ...(params.since ? { since: (params.since as Date).toISOString() } : {}),
    })
    return (res.events ?? []).flatMap((e) => transformTrackingEvents(e))
  }

  // ── Orders ───────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new E2openClient(credentials)
    const res = await client.get<E2openOrderListResponse>('/orders', {
      page: params.page,
      pageSize: params.limit,
    })
    return (res.orders ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new E2openClient(credentials)
    const res = await client.get<E2openOrderRaw>(`/orders/${id}`)
    return transformOrder(res)
  }

  // ── Webhooks ─────────────────────────────────────────────────────────────

  verifyWebhook(_payload: Buffer, _headers: Record<string, string>, _secret: string): boolean {
    return false
  }
}
