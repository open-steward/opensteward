// ── Resource coverage ──────────────────────────────────────────────
// Unverified:  carrier  — no public endpoint; API docs behind enterprise login at dev-jdapiportal.jdadelivers.com
// Unverified:  label    — no public endpoint; API docs behind enterprise login at dev-jdapiportal.jdadelivers.com
// Unverified:  manifest — no public endpoint; API docs behind enterprise login at dev-jdapiportal.jdadelivers.com
// Unverified:  rate     — no public endpoint; API docs behind enterprise login at dev-jdapiportal.jdadelivers.com

import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Order } from '../../schema/order'
import type { Warehouse } from '../../schema/warehouse'

import { buildAuthUrl, exchangeCredentials, refreshCredentials as doRefresh } from './auth'
import { JdaClient } from './client'

import { transformTrackingEvents, type JdaTrackingResponse } from './transform/tracking'
import { transformShipment, type JdaShipmentResponse } from './transform/shipment'
import { transformOrder, type JdaOrderResponse } from './transform/order'
import { transformWarehouse, type JdaWarehouseResponse } from './transform/warehouse'

export interface JdaAdapterConfig {
  clientId?: string
  clientSecret?: string
}

export class JdaAdapter implements LogisticsAdapter {
  readonly platform = 'jda'
  readonly version = '1'

  private config: JdaAdapterConfig

  constructor(config: JdaAdapterConfig = {}) {
    this.config = config
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error('jda: clientId and clientSecret are required')
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

  async getTrackingEvents(credentials: Credentials, loadId: string): Promise<TrackingEvent[]> {
    const client = new JdaClient(credentials)
    const res = await client.get<JdaTrackingResponse>(`/loads/${loadId}/tracking`)
    return transformTrackingEvents(res)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new JdaClient(credentials)

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

    const res = await client.post<JdaShipmentResponse>('/loads', body)
    return transformShipment(res)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new JdaClient(credentials)
    await client.delete(`/loads/${id}`)
  }

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new JdaClient(credentials)
    const res = await client.get<{ loads: JdaShipmentResponse[] }>('/loads', {
      page: params.page,
      limit: params.limit,
    })
    return (res.loads ?? []).map(transformShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new JdaClient(credentials)
    const res = await client.get<JdaShipmentResponse>(`/loads/${id}`)
    return transformShipment(res)
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  /**
   * List transportation orders (loads) from JDA TMS. The `/orders` endpoint
   * is the planning-layer wrapper around `/loads` and includes customer,
   * commodity, and route-stop details.
   */
  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new JdaClient(credentials)
    const res = await client.get<{ orders?: JdaOrderResponse[]; loads?: JdaOrderResponse[] }>(
      '/orders',
      { page: params.page, limit: params.limit },
    )
    const items = res.orders ?? res.loads ?? []
    return items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new JdaClient(credentials)
    const res = await client.get<JdaOrderResponse>(`/orders/${id}`)
    return transformOrder(res)
  }

  // ── Warehouses ─────────────────────────────────────────────────────────────

  async listWarehouses(credentials: Credentials, params: QueryParams): Promise<Warehouse[]> {
    const client = new JdaClient(credentials)
    const res = await client.get<{ warehouses?: JdaWarehouseResponse[] }>(
      '/warehouses',
      { page: params.page, limit: params.limit },
    )
    return (res.warehouses ?? []).map(transformWarehouse)
  }

  async getWarehouse(credentials: Credentials, id: string): Promise<Warehouse> {
    const client = new JdaClient(credentials)
    const res = await client.get<JdaWarehouseResponse>(`/warehouses/${id}`)
    return transformWarehouse(res)
  }
}
