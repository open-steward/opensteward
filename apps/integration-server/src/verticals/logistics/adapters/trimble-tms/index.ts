// ── Resource coverage ──────────────────────────────────────────────
// Unverified: carrier   — api.trimble.com/tms/v1 is in pre-release beta; no public docs confirm a /carriers endpoint
// Unverified: label     — api.trimble.com/tms/v1 is in pre-release beta; no public docs confirm a /labels endpoint
// Unverified: manifest  — api.trimble.com/tms/v1 is in pre-release beta; no public docs confirm a /manifests endpoint
// Unverified: order     — api.trimble.com/tms/v1 is in pre-release beta; Order module exists but endpoint paths/schema unconfirmed
// Unverified: warehouse — api.trimble.com/tms/v1 is in pre-release beta; no public docs confirm a /warehouses endpoint

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
import { TrimbleTmsClient } from './client'

import { transformTrackingEvents, type TrimbleTmsTrackingResponse } from './transform/tracking'
import { transformShipment, type TrimbleTmsShipmentResponse } from './transform/shipment'
import { transformRate, type TrimbleTmsRatesResponse } from './transform/rate'

export interface TrimbleTmsAdapterConfig {
  clientId?: string
  clientSecret?: string
}

export class TrimbleTmsAdapter implements LogisticsAdapter {
  readonly platform = 'trimble-tms'
  readonly version = '1'

  private config: TrimbleTmsAdapterConfig

  constructor(config: TrimbleTmsAdapterConfig = {}) {
    this.config = config
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error('trimble-tms: clientId and clientSecret are required')
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
    const client = new TrimbleTmsClient(credentials)

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

    const res = await client.post<TrimbleTmsRatesResponse>('/quotes', body)
    return (res.quotes ?? []).map(transformRate)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new TrimbleTmsClient(credentials)
    const res = await client.get<TrimbleTmsTrackingResponse>(`/shipments/${trackingNumber}/tracking`)
    return transformTrackingEvents(res)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new TrimbleTmsClient(credentials)

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

    const res = await client.post<TrimbleTmsShipmentResponse>('/shipments', body)
    return transformShipment(res)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new TrimbleTmsClient(credentials)
    await client.delete(`/shipments/${id}`)
  }

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new TrimbleTmsClient(credentials)
    const res = await client.get<{ shipments: TrimbleTmsShipmentResponse[] }>('/shipments', {
      page: params.page,
      limit: params.limit,
    })
    return (res.shipments ?? []).map(transformShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new TrimbleTmsClient(credentials)
    const res = await client.get<TrimbleTmsShipmentResponse>(`/shipments/${id}`)
    return transformShipment(res)
  }
}
