// ── Resource coverage ──────────────────────────────────────────────
// Unverified: label    — MercuryGate REST API docs are behind a partner/login portal; mercurygate.com now redirects to infios.com after acquisition. No public evidence of a /labels endpoint was found.
// Unverified: manifest — MercuryGate REST API docs are behind a partner/login portal; mercurygate.com now redirects to infios.com after acquisition. No public evidence of a /manifests endpoint was found.
// Unverified: warehouse — MercuryGate REST API docs are behind a partner/login portal; mercurygate.com now redirects to infios.com after acquisition. No public evidence of a /warehouses endpoint was found.

import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Carrier } from '../../schema/carrier'
import type { Order } from '../../schema/order'

import { buildAuthUrl, exchangeCredentials, refreshCredentials as doRefresh } from './auth'
import { MercuryGateClient } from './client'

import { transformTrackingEvents, type MercuryGateTrackingResponse } from './transform/tracking'
import { transformShipment, type MercuryGateShipmentResponse } from './transform/shipment'
import { transformRate, type MercuryGateRatesResponse } from './transform/rate'
import { transformCarrier, type MercuryGateCarrierResponse } from './transform/carrier'
import { transformOrder, type MercuryGateOrderResponse } from './transform/order'

export interface MercuryGateAdapterConfig {
  clientId?: string
  clientSecret?: string
}

export class MercuryGateAdapter implements LogisticsAdapter {
  readonly platform = 'mercurygate'
  readonly version = '1'

  private config: MercuryGateAdapterConfig

  constructor(config: MercuryGateAdapterConfig = {}) {
    this.config = config
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error('mercurygate: clientId and clientSecret are required')
    }
    return exchangeCredentials({
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
    })
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new MercuryGateClient(credentials)

    const body = {
      origin: {
        address: params.originAddress.street1,
        city: params.originAddress.city,
        state: params.originAddress.state,
        zipCode: params.originAddress.postalCode,
        country: params.originAddress.country,
      },
      destination: {
        address: params.destinationAddress.street1,
        city: params.destinationAddress.city,
        state: params.destinationAddress.state,
        zipCode: params.destinationAddress.postalCode,
        country: params.destinationAddress.country,
      },
      weight: params.packages[0]?.weight
        ? { value: params.packages[0].weight.value, unit: params.packages[0].weight.unit === 'kg' ? 'KG' : 'LBS' }
        : undefined,
    }

    const res = await client.post<MercuryGateRatesResponse>('/rating', body)
    return (res.quotes ?? []).map(transformRate)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new MercuryGateClient(credentials)
    const res = await client.get<MercuryGateTrackingResponse>(`/shipments/${trackingNumber}/events`)
    return transformTrackingEvents(res)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new MercuryGateClient(credentials)

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

    const res = await client.post<MercuryGateShipmentResponse>('/shipments', body)
    return transformShipment(res)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new MercuryGateClient(credentials)
    await client.delete(`/shipments/${id}`)
  }

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new MercuryGateClient(credentials)
    const res = await client.get<{ shipments: MercuryGateShipmentResponse[] }>('/shipments', {
      page: params.page,
      limit: params.limit,
    })
    return (res.shipments ?? []).map(transformShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new MercuryGateClient(credentials)
    const res = await client.get<MercuryGateShipmentResponse>(`/shipments/${id}`)
    return transformShipment(res)
  }

  // ── Carriers ───────────────────────────────────────────────────────────────

  async listCarriers(credentials: Credentials, params: QueryParams): Promise<Carrier[]> {
    const client = new MercuryGateClient(credentials)
    const res = await client.get<{ carriers?: MercuryGateCarrierResponse[] }>('/carriers', {
      limit: params.limit,
    })
    return (res.carriers ?? []).map(transformCarrier)
  }

  async getCarrier(credentials: Credentials, id: string): Promise<Carrier> {
    const client = new MercuryGateClient(credentials)
    const res = await client.get<MercuryGateCarrierResponse>(`/carriers/${id}`)
    return transformCarrier(res)
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new MercuryGateClient(credentials)
    const res = await client.get<{ orders?: MercuryGateOrderResponse[] }>('/orders', {
      page: params.page,
      limit: params.limit,
    })
    return (res.orders ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new MercuryGateClient(credentials)
    const res = await client.get<MercuryGateOrderResponse>(`/orders/${id}`)
    return transformOrder(res)
  }
}
