// ── Resource coverage ──────────────────────────────────────────────
// Unverified: carrier   — GoFreight API spec is behind a JS-rendered ReDoc SPA; no /carriers endpoint found in public docs
// Unverified: label     — Label printing is a UI-only feature (Tools menu in House AWB); no /labels API endpoint found in public docs
// Unverified: manifest  — GoFreight API spec is behind a JS-rendered ReDoc SPA; no /manifests endpoint found in public docs
// Unverified: rate      — GoFreight API spec is behind a JS-rendered ReDoc SPA; no /rates endpoint found in public docs
// Unverified: warehouse — GoFreight has no built-in WMS (integrates with third-party WMS); no /warehouses endpoint found in public docs

import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { Order } from '../../schema/order'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { WebhookEvent } from '../../schema/webhook'

import {
  buildAuthUrl,
  exchangeApiKey,
  refreshCredentials as doRefresh,
} from './auth'
import { GoFreightClient } from './client'
import {
  transformMasterBill,
  type GoFreightMasterBill,
  type GoFreightMasterBillListResponse,
} from './transform/shipment'
import {
  transformTrackingEvents,
  type GoFreightTrackingResponse,
} from './transform/tracking'
import {
  transformHouseBill,
  type GoFreightHouseBill,
  type GoFreightHouseBillListResponse,
} from './transform/order'
import { gofreightWebhook } from './webhook'

export interface GoFreightAdapterConfig {
  /** GoFreight API key (X-GATEWAY-TOKEN). Obtained from GoFreight support. */
  apiKey?: string
}

export class GoFreightAdapter implements LogisticsAdapter {
  readonly platform = 'gofreight'
  readonly version = '1'

  private config: GoFreightAdapterConfig

  constructor(config: GoFreightAdapterConfig = {}) {
    this.config = config
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    if (!this.config.apiKey) {
      throw new Error('gofreight: apiKey is required — obtain one from GoFreight staff')
    }
    return exchangeApiKey({ apiKey: this.config.apiKey })
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return gofreightWebhook.parseWebhookEvents(payload) as WebhookEvent[]
  }

  // ── Shipments (Ocean Master Bills) ─────────────────────────────────────────

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new GoFreightClient(credentials)
    const res = await client.get<GoFreightMasterBillListResponse>(
      '/api/v1/shipments/master-bills/',
      { page: params.page ?? 1, limit: params.limit ?? 100 },
    )
    return (res.results ?? []).map(transformMasterBill)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new GoFreightClient(credentials)
    const res = await client.get<GoFreightMasterBill>(`/api/v1/shipments/master-bills/${id}/`)
    return transformMasterBill(res)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new GoFreightClient(credentials)
    const body: Record<string, unknown> = {
      mbl_number: data.trackingNumber,
      vessel_name: data.ocean?.vesselName,
      voyage_number: data.ocean?.voyageNumber,
      shipping_line: data.ocean?.shippingLine,
      port_of_loading: data.ocean?.portOfLoading,
      port_of_discharge: data.ocean?.portOfDischarge,
      booking_number: data.ocean?.bookingNumber,
      mode: data.serviceCode,
    }
    const res = await client.post<GoFreightMasterBill>('/api/v1/shipments/ocean-import/mbl/', body)
    return transformMasterBill(res)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new GoFreightClient(credentials)
    await client.delete(`/api/v1/shipments/master-bills/${id}/`)
  }

  // ── Orders (Ocean House Bills) ─────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new GoFreightClient(credentials)
    const res = await client.get<GoFreightHouseBillListResponse>(
      '/api/v1/shipments/house-bills/',
      { page: params.page ?? 1, limit: params.limit ?? 100 },
    )
    return (res.results ?? []).map(transformHouseBill)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new GoFreightClient(credentials)
    const res = await client.get<GoFreightHouseBill>(`/api/v1/shipments/house-bills/${id}/`)
    return transformHouseBill(res)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new GoFreightClient(credentials)
    const body: Record<string, unknown> = {
      hbl_number: data.orderNumber,
      description_of_goods: data.notes,
    }
    const res = await client.post<GoFreightHouseBill>('/api/v1/shipments/house-bills/', body)
    return transformHouseBill(res)
  }

  async updateOrder(credentials: Credentials, id: string, data: Partial<Order>): Promise<Order> {
    const client = new GoFreightClient(credentials)
    const body: Record<string, unknown> = {
      hbl_number: data.orderNumber,
      description_of_goods: data.notes,
    }
    const res = await client.patch<GoFreightHouseBill>(
      `/api/v1/shipments/house-bills/${id}/`,
      body,
    )
    return transformHouseBill(res)
  }

  async cancelOrder(credentials: Credentials, id: string): Promise<void> {
    const client = new GoFreightClient(credentials)
    await client.delete(`/api/v1/shipments/house-bills/${id}/`)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(
    credentials: Credentials,
    trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    const client = new GoFreightClient(credentials)
    const res = await client.get<GoFreightTrackingResponse>(
      `/api/v1/shipments/containers/${trackingNumber}/`,
    )
    return transformTrackingEvents(res)
  }
}
