// ── Resource coverage ──────────────────────────────────────────────
// Unverified: carrier   — Bluejay/e2open API docs are behind an authenticated portal; no public endpoint confirmed
// Unverified: label     — Bluejay/e2open API docs are behind an authenticated portal; no public endpoint confirmed
// Unverified: manifest  — Bluejay/e2open API docs are behind an authenticated portal; no public endpoint confirmed
// Unverified: order     — Bluejay/e2open API docs are behind an authenticated portal; no public endpoint confirmed
// Unverified: rate      — Bluejay/e2open API docs are behind an authenticated portal; no public endpoint confirmed
// Unverified: warehouse — Bluejay/e2open API docs are behind an authenticated portal; no public endpoint confirmed

import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'

import { buildAuthUrl, exchangeCredentials, refreshCredentials as doRefresh } from './auth'
import { BluejayClient } from './client'

import { transformTrackingEvents, type BluejayTrackingResponse } from './transform/tracking'
import { transformShipment, type BluejayShipmentResponse } from './transform/shipment'

export interface BluejayAdapterConfig {
  clientId?: string
  clientSecret?: string
}

export class BluejayAdapter implements LogisticsAdapter {
  readonly platform = 'bluejay'
  readonly version = '1'

  private config: BluejayAdapterConfig

  constructor(config: BluejayAdapterConfig = {}) {
    this.config = config
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error('bluejay: clientId and clientSecret are required')
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
    const client = new BluejayClient(credentials)
    const res = await client.get<BluejayTrackingResponse>(`/shipments/${trackingNumber}/events`)
    return transformTrackingEvents(res)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new BluejayClient(credentials)

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

    const res = await client.post<BluejayShipmentResponse>('/shipments', body)
    return transformShipment(res)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new BluejayClient(credentials)
    await client.delete(`/shipments/${id}`)
  }

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new BluejayClient(credentials)
    const res = await client.get<{ shipments: BluejayShipmentResponse[] }>('/shipments', {
      page: params.page,
      limit: params.limit,
    })
    return (res.shipments ?? []).map(transformShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new BluejayClient(credentials)
    const res = await client.get<BluejayShipmentResponse>(`/shipments/${id}`)
    return transformShipment(res)
  }
}
