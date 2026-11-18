import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'

import { buildAuthUrl, exchangeCredentials, refreshCredentials as doRefresh } from './auth'
import { ConvoyClient } from './client'

import { transformTrackingEvents, type ConvoyTrackingResponse } from './transform/tracking'
import { transformShipment, type ConvoyShipmentResponse } from './transform/shipment'
import { transformRate, type ConvoyRatesResponse } from './transform/rate'

// ── Resource coverage ──────────────────────────────────────────────────────────
// Available:   rate, shipment, trackingevent
// Unavailable: label     — Convoy is an FTL freight brokerage; no parcel label API exists
// Unavailable: manifest  — Convoy is an FTL freight brokerage; no parcel manifest concept
// Unavailable: order     — no separate order resource; loads map directly to shipments
// Unavailable: warehouse — freight-matching platform; no warehouse management API
// Unverified:  carrier   — a carrier-list endpoint may exist behind authentication
//                          but could not be confirmed from public documentation

export interface ConvoyAdapterConfig {
  clientId?: string
  clientSecret?: string
}

export class ConvoyAdapter implements LogisticsAdapter {
  readonly platform = 'convoy'
  readonly version = '1'

  private config: ConvoyAdapterConfig

  constructor(config: ConvoyAdapterConfig = {}) {
    this.config = config
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error('convoy: clientId and clientSecret are required')
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
    const client = new ConvoyClient(credentials)

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

    const res = await client.post<ConvoyRatesResponse>('/quotes', body)
    return (res.quotes ?? []).map(transformRate)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new ConvoyClient(credentials)
    const res = await client.get<ConvoyTrackingResponse>(`/shipments/${trackingNumber}/tracking`)
    return transformTrackingEvents(res)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new ConvoyClient(credentials)

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

    const res = await client.post<ConvoyShipmentResponse>('/shipments', body)
    return transformShipment(res)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new ConvoyClient(credentials)
    await client.delete(`/shipments/${id}`)
  }

  // ── Shipment Listing ──────────────────────────────────────────────────────

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new ConvoyClient(credentials)
    const res = await client.get<{ shipments: ConvoyShipmentResponse[] }>('/shipments', {
      page: params.page,
      limit: params.limit,
    })
    return (res.shipments ?? []).map(transformShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new ConvoyClient(credentials)
    const res = await client.get<ConvoyShipmentResponse>(`/shipments/${id}`)
    return transformShipment(res)
  }
}
