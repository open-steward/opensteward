import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Label } from '../../schema/label'

import { buildAuthUrl, exchangeCredentials, refreshCredentials as doRefresh } from './auth'
import { DhlAfricaClient } from './client'

import { transformTrackingEvents, type DhlAfricaTrackingResponse } from './transform/tracking'
import { transformShipment, type DhlAfricaShipmentResponse } from './transform/shipment'
import { transformRate, type DhlAfricaRatesResponse } from './transform/rate'
import { transformLabel, type DhlAfricaLabelSource } from './transform/label'

// ── Resource coverage ──────────────────────────────────────────────────────────
// Unavailable: carrier   — DHL Africa is itself the single carrier; no carrier-enumeration endpoint exists
// Unavailable: order     — DHL Africa is a carrier API and has no order-management concept or endpoint
// Unavailable: warehouse — DHL carrier API does not expose warehouse locations via any documented endpoint
// Unverified:  manifest  — no public docs confirm a manifest endpoint under api.dhl.com/africa/v1/

export interface DhlAfricaAdapterConfig {
  clientId?: string
  clientSecret?: string
}

export class DhlAfricaAdapter implements LogisticsAdapter {
  readonly platform = 'dhl-africa'
  readonly version = '1'

  private config: DhlAfricaAdapterConfig

  constructor(config: DhlAfricaAdapterConfig = {}) {
    this.config = config
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error('dhl-africa: clientId and clientSecret are required')
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
    const client = new DhlAfricaClient(credentials)

    const res = await client.get<DhlAfricaRatesResponse>('/rates', {
      originCountry: params.originAddress.country,
      originCity: params.originAddress.city,
      originPostalCode: params.originAddress.postalCode,
      destinationCountry: params.destinationAddress.country,
      destinationCity: params.destinationAddress.city,
      destinationPostalCode: params.destinationAddress.postalCode,
      weight: params.packages[0]?.weight?.value,
      weightUnit: params.packages[0]?.weight?.unit === 'kg' ? 'KG' : 'LBS',
    })
    return (res.rates ?? []).map(transformRate)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async listTrackingEvents(credentials: Credentials, params: QueryParams): Promise<TrackingEvent[]> {
    const trackingNumber =
      typeof params.trackingNumber === 'string'
        ? params.trackingNumber
        : undefined
    if (!trackingNumber) return []
    return this.getTrackingEvents(credentials, trackingNumber)
  }

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new DhlAfricaClient(credentials)
    const res = await client.get<DhlAfricaTrackingResponse>(`/shipments/${trackingNumber}/tracking`)
    return transformTrackingEvents(res)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new DhlAfricaClient(credentials)

    const body = {
      serviceType: data.serviceCode,
      origin: {
        name: data.originAddress?.name,
        company: data.originAddress?.company,
        address: data.originAddress?.street1,
        city: data.originAddress?.city,
        state: data.originAddress?.state,
        postalCode: data.originAddress?.postalCode,
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
        postalCode: data.destinationAddress?.postalCode,
        country: data.destinationAddress?.country,
        phone: data.destinationAddress?.phone,
        email: data.destinationAddress?.email,
      },
      weight: data.totalWeight
        ? { value: data.totalWeight.value, unit: data.totalWeight.unit === 'kg' ? 'KG' : 'LBS' }
        : undefined,
    }

    const res = await client.post<DhlAfricaShipmentResponse>('/shipments', body)
    return transformShipment(res)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────
  // Labels are derived from the shipment resource: POST /shipments returns
  // a labelUrl in the response body.  There is no dedicated /labels endpoint.

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new DhlAfricaClient(credentials)
    const res = await client.get<DhlAfricaLabelSource>(`/shipments/${id}`)
    return transformLabel(res)
  }

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    const client = new DhlAfricaClient(credentials)

    const body = {
      serviceType: data.serviceCode,
      weight: undefined,
    }

    const res = await client.post<DhlAfricaLabelSource>('/shipments', body)
    return transformLabel(res)
  }
}
