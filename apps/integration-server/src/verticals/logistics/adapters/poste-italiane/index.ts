// ── Resource coverage ──────────────────────────────────────────────
// Unverified:  carrier   — api.poste.it/v1 docs require authenticated developer credentials; no public endpoint confirmed
// Unverified:  label     — api.poste.it/v1 docs require authenticated developer credentials; no public endpoint confirmed
// Unverified:  manifest  — api.poste.it/v1 docs require authenticated developer credentials; no public endpoint confirmed
// Unverified:  order     — api.poste.it/v1 docs require authenticated developer credentials; no public endpoint confirmed
// Unverified:  warehouse — api.poste.it/v1 docs require authenticated developer credentials; no public endpoint confirmed

import type {
  LogisticsAdapter,
  Credentials,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'

import { buildAuthUrl, exchangeCredentials, refreshCredentials as doRefresh } from './auth'
import { PosteItalianeClient } from './client'

import { transformTracking, type PosteItalianeTrackingResponse } from './transform/tracking'
import { transformShipment, type PosteItalianeShipmentResponse } from './transform/shipment'
import { transformRate, type PosteItalianeRate } from './transform/rate'

export interface PosteItalianeAdapterConfig {
  clientId?: string
  clientSecret?: string
}

export class PosteItalianeAdapter implements LogisticsAdapter {
  readonly platform = 'poste-italiane'
  readonly version = '1'

  private config: PosteItalianeAdapterConfig

  constructor(config: PosteItalianeAdapterConfig = {}) {
    this.config = config
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error('poste-italiane: clientId and clientSecret are required')
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
    const client = new PosteItalianeClient(credentials)
    const res = await client.get<PosteItalianeTrackingResponse>(`tracking/${trackingNumber}`)
    return transformTracking(res)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new PosteItalianeClient(credentials)

    const body = {
      serviceCode: data.serviceCode,
      sender: {
        name: data.originAddress?.name,
        company: data.originAddress?.company,
        addressLine1: data.originAddress?.street1,
        addressLine2: data.originAddress?.street2,
        city: data.originAddress?.city,
        postalCode: data.originAddress?.postalCode,
        countryCode: data.originAddress?.country,
        phone: data.originAddress?.phone,
        email: data.originAddress?.email,
      },
      receiver: {
        name: data.destinationAddress?.name,
        company: data.destinationAddress?.company,
        addressLine1: data.destinationAddress?.street1,
        addressLine2: data.destinationAddress?.street2,
        city: data.destinationAddress?.city,
        postalCode: data.destinationAddress?.postalCode,
        countryCode: data.destinationAddress?.country,
        phone: data.destinationAddress?.phone,
        email: data.destinationAddress?.email,
      },
      weight: data.totalWeight
        ? { value: data.totalWeight.value, unit: data.totalWeight.unit }
        : undefined,
    }

    const res = await client.post<PosteItalianeShipmentResponse>('shipments', body)
    return transformShipment(res)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new PosteItalianeClient(credentials)
    await client.delete(`shipments/${id}`)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new PosteItalianeClient(credentials)
    const res = await client.post<{ tariffe: PosteItalianeRate[] }>('tariffe', {
      origin: {
        postal_code: params.originAddress.postalCode,
        city: params.originAddress.city,
        country: params.originAddress.country,
      },
      destination: {
        postal_code: params.destinationAddress.postalCode,
        city: params.destinationAddress.city,
        country: params.destinationAddress.country,
      },
      packages: params.packages.map((pkg) => ({
        weight: pkg.weight?.value,
        weight_unit: pkg.weight?.unit ?? 'kg',
        length: pkg.dimensions?.length,
        width: pkg.dimensions?.width,
        height: pkg.dimensions?.height,
        dimension_unit: pkg.dimensions?.unit ?? 'cm',
      })),
      service_codes: params.serviceCodes,
    })
    return (res.tariffe ?? []).map(transformRate)
  }
}
