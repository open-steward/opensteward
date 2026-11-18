// ── Resource coverage ──────────────────────────────────────────────
// Available:   label, rate, shipment, trackingevent, manifest
// Unavailable: carrier   — Shipping API v3 has no carrier list endpoint; Royal Mail is itself the sole carrier
// Unavailable: order     — Shipping API v3 has no order concept; orders live in a separate Click & Drop API (api.parcel.royalmail.com) with a different auth scheme
// Unavailable: warehouse — Neither Shipping API v3 nor Click & Drop API exposes a warehouse/posting-location resource

import type {
  LogisticsAdapter,
  Credentials,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Label } from '../../schema/label'
import type { Manifest } from '../../schema/manifest'

import { buildAuthUrl, exchangeCredentials, refreshCredentials as doRefresh } from './auth'
import { RoyalMailClient } from './client'

import { transformRate, type RoyalMailRatesResponse } from './transform/rate'
import { transformTrackingEvents, type RoyalMailTrackingResponse } from './transform/tracking'
import { transformShipment, type RoyalMailShipmentResponse } from './transform/shipment'
import { transformLabel } from './transform/label'
import { transformManifest, type RoyalMailManifestResponse } from './transform/manifest'

export interface RoyalMailAdapterConfig {
  clientId?: string
  clientSecret?: string
  sandbox?: boolean
}

export class RoyalMailAdapter implements LogisticsAdapter {
  readonly platform = 'royalmail'
  readonly version = '1'

  private config: RoyalMailAdapterConfig

  constructor(config: RoyalMailAdapterConfig = {}) {
    this.config = config
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error('royalmail: clientId and clientSecret are required')
    }
    return exchangeCredentials({
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
      sandbox: this.config.sandbox,
    })
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new RoyalMailClient(credentials)
    const res = await client.get<RoyalMailRatesResponse>('/rates', {
      originPostalCode: params.originAddress.postalCode,
      destinationPostalCode: params.destinationAddress.postalCode,
      destinationCountry: params.destinationAddress.country,
      weight: params.packages[0]?.weight?.value,
      weightUnit: params.packages[0]?.weight?.unit,
    })
    return (res.rates ?? []).map(transformRate)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new RoyalMailClient(credentials)
    const res = await client.get<RoyalMailTrackingResponse>(`/tracking/${trackingNumber}`)
    return transformTrackingEvents(res)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new RoyalMailClient(credentials)

    const body = {
      serviceCode: data.serviceCode,
      shipper: {
        name: data.originAddress?.name,
        company: data.originAddress?.company,
        addressLine1: data.originAddress?.street1,
        addressLine2: data.originAddress?.street2,
        city: data.originAddress?.city,
        county: data.originAddress?.state,
        postCode: data.originAddress?.postalCode,
        countryCode: data.originAddress?.country,
        phone: data.originAddress?.phone,
        email: data.originAddress?.email,
      },
      recipient: {
        name: data.destinationAddress?.name,
        company: data.destinationAddress?.company,
        addressLine1: data.destinationAddress?.street1,
        addressLine2: data.destinationAddress?.street2,
        city: data.destinationAddress?.city,
        county: data.destinationAddress?.state,
        postCode: data.destinationAddress?.postalCode,
        countryCode: data.destinationAddress?.country,
        phone: data.destinationAddress?.phone,
        email: data.destinationAddress?.email,
      },
      weight: data.totalWeight
        ? { value: data.totalWeight.value, unit: data.totalWeight.unit }
        : undefined,
    }

    const res = await client.post<RoyalMailShipmentResponse>('/shipments', body)
    return transformShipment(res)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new RoyalMailClient(credentials)
    await client.delete(`/shipments/${id}`)
  }

  // ── Manifests ──────────────────────────────────────────────────────────────

  async createManifest(credentials: Credentials, _data: Partial<Manifest>): Promise<Manifest> {
    const client = new RoyalMailClient(credentials)
    const res = await client.post<RoyalMailManifestResponse>('/manifests', {})
    const first = (res.manifests ?? [])[0] ?? {}
    return transformManifest(first)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    const client = new RoyalMailClient(credentials)

    const body = {
      serviceCode: data.serviceCode,
      shipper: {
        postCode: (data.metadata as Record<string, unknown> | undefined)?.originPostalCode,
        countryCode: (data.metadata as Record<string, unknown> | undefined)?.originCountry,
      },
      recipient: {
        postCode: (data.metadata as Record<string, unknown> | undefined)?.destinationPostalCode,
        countryCode: (data.metadata as Record<string, unknown> | undefined)?.destinationCountry,
      },
    }

    const res = await client.post<RoyalMailShipmentResponse>('/shipments', body)
    return transformLabel(res)
  }
}
