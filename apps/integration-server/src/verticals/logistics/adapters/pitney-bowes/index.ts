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
import { PitneyBowesClient } from './client'

import { transformRate, type PitneyBowesRateResponse } from './transform/rate'
import { transformTrackingEvents, type PitneyBowesTrackingResponse } from './transform/tracking'
import { transformShipment, type PitneyBowesShipmentResponse } from './transform/shipment'
import { transformLabel } from './transform/label'
import { transformManifest, type PitneyBowesManifestResponse } from './transform/manifest'

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: carrier  — No list/get carrier endpoint; the API only supports POST to add commercial carrier accounts (FedEx/UPS), with no programmatic retrieval of carriers.
// Unavailable: warehouse — Pitney Bowes Shipping API has no warehouse management concept; the carrier-facility endpoint (POST /v1/carrier-facility) returns Post Offices/drop-off locations, not merchant-owned warehouses.
// Unverified:  order    — The fulfillment sub-API (POST /shippingservices/fulfillment/v1/orders) is documented but all fulfillment doc pages return 404; response field names cannot be confirmed.

export interface PitneyBowesAdapterConfig {
  clientId?: string
  clientSecret?: string
  sandbox?: boolean
}

export class PitneyBowesAdapter implements LogisticsAdapter {
  readonly platform = 'pitney-bowes'
  readonly version = '1'

  private config: PitneyBowesAdapterConfig

  constructor(config: PitneyBowesAdapterConfig = {}) {
    this.config = config
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error('pitney-bowes: clientId and clientSecret are required')
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
    const client = new PitneyBowesClient(credentials)
    const firstPkg = params.packages[0]

    const body = {
      fromAddress: {
        postalCode: params.originAddress.postalCode,
        countryCode: params.originAddress.country,
        stateProvince: params.originAddress.state,
        cityTown: params.originAddress.city,
      },
      toAddress: {
        postalCode: params.destinationAddress.postalCode,
        countryCode: params.destinationAddress.country,
        stateProvince: params.destinationAddress.state,
        cityTown: params.destinationAddress.city,
      },
      parcel: {
        weight: firstPkg?.weight
          ? { weight: firstPkg.weight.value, unitOfMeasurement: firstPkg.weight.unit === 'kg' ? 'KG' : 'OZ' }
          : undefined,
        dimension: firstPkg?.dimensions
          ? {
              length: firstPkg.dimensions.length,
              width: firstPkg.dimensions.width,
              height: firstPkg.dimensions.height,
              unitOfMeasurement: firstPkg.dimensions.unit === 'cm' ? 'CM' : 'IN',
            }
          : undefined,
      },
    }

    const res = await client.post<PitneyBowesRateResponse>('/shippingservices/v1/rates', body)
    return (res.rates ?? []).map(transformRate)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new PitneyBowesClient(credentials)
    const res = await client.get<PitneyBowesTrackingResponse>(`/shippingservices/v1/tracking/${trackingNumber}`)
    return transformTrackingEvents(res)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new PitneyBowesClient(credentials)

    const body = {
      fromAddress: {
        addressLines: [data.originAddress?.street1, data.originAddress?.street2].filter(Boolean),
        cityTown: data.originAddress?.city,
        stateProvince: data.originAddress?.state,
        postalCode: data.originAddress?.postalCode,
        countryCode: data.originAddress?.country,
        name: data.originAddress?.name,
        company: data.originAddress?.company,
        phone: data.originAddress?.phone,
        email: data.originAddress?.email,
      },
      toAddress: {
        addressLines: [data.destinationAddress?.street1, data.destinationAddress?.street2].filter(Boolean),
        cityTown: data.destinationAddress?.city,
        stateProvince: data.destinationAddress?.state,
        postalCode: data.destinationAddress?.postalCode,
        countryCode: data.destinationAddress?.country,
        name: data.destinationAddress?.name,
        company: data.destinationAddress?.company,
        phone: data.destinationAddress?.phone,
        email: data.destinationAddress?.email,
      },
      parcel: {
        weight: data.totalWeight
          ? { weight: data.totalWeight.value, unitOfMeasurement: data.totalWeight.unit === 'kg' ? 'KG' : 'OZ' }
          : undefined,
      },
      rates: [
        {
          serviceId: data.serviceCode,
        },
      ],
      documents: [
        {
          type: 'SHIPPING_LABEL',
          contentType: 'URL',
          size: 'DOC_4X6',
          fileFormat: 'PDF',
        },
      ],
    }

    const res = await client.post<PitneyBowesShipmentResponse>('/shippingservices/v1/shipments', body)
    return transformShipment(res)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new PitneyBowesClient(credentials)
    await client.delete(`/shippingservices/v1/shipments/${id}`)
  }

  // ── Manifests ──────────────────────────────────────────────────────────────

  async getManifest(credentials: Credentials, id: string): Promise<Manifest> {
    const client = new PitneyBowesClient(credentials)
    const res = await client.get<PitneyBowesManifestResponse>(`/shippingservices/v1/manifests/${id}`)
    return transformManifest(res)
  }

  async createManifest(credentials: Credentials, data: Partial<Manifest>): Promise<Manifest> {
    const client = new PitneyBowesClient(credentials)

    const body = {
      carrier: 'USPS',
      submissionDate: data.submittedAt
        ? new Date(data.submittedAt).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10),
      fromAddress: {},
      parcelTrackingNumbers: data.shipmentIds ?? [],
      parameters: [{ name: 'MANIFEST_TYPE', value: 'PMOD' }],
    }

    const res = await client.post<PitneyBowesManifestResponse>('/shippingservices/v1/manifests', body)
    return transformManifest(res)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    const client = new PitneyBowesClient(credentials)

    const body = {
      fromAddress: {
        postalCode: (data.metadata as Record<string, unknown> | undefined)?.originPostalCode,
        countryCode: (data.metadata as Record<string, unknown> | undefined)?.originCountry,
      },
      toAddress: {
        postalCode: (data.metadata as Record<string, unknown> | undefined)?.destinationPostalCode,
        countryCode: (data.metadata as Record<string, unknown> | undefined)?.destinationCountry,
      },
      parcel: {},
      rates: [{ serviceId: data.serviceCode }],
      documents: [
        {
          type: 'SHIPPING_LABEL',
          contentType: 'BASE64',
          size: 'DOC_4X6',
          fileFormat: data.format ?? 'PDF',
        },
      ],
    }

    const res = await client.post<PitneyBowesShipmentResponse>('/shippingservices/v1/shipments', body)
    return transformLabel(res)
  }
}
