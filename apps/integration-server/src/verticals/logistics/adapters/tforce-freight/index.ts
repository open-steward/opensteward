// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: carrier   — TForce Freight is a single LTL carrier; no carrier-listing endpoint exists in any published API
// Unavailable: manifest  — no manifest/end-of-day close-out endpoint in the TForce Freight API
// Unavailable: order     — TForce Freight is an LTL carrier, not an OMS; no order management API exists
// Unavailable: warehouse — no warehouse/service-centre listing endpoint in the TForce Freight API

import type {
  LogisticsAdapter,
  Credentials,
  RateRequestParams,
  QueryParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Label } from '../../schema/label'

import { buildAuthUrl, exchangeCode as doExchange, refreshCredentials as doRefresh } from './auth'
import { TforceFreightClient } from './client'

import { transformShipment, type TforceShipment } from './transform/shipment'
import { transformTracking, type TforceTrackingResponse } from './transform/tracking'
import { transformRate, type TforceRateResponse } from './transform/rate'
import { transformLabelsFromBolResponse, type TforceBolResponse } from './transform/label'

interface TforceFreightAdapterConfig {
  sandbox?: boolean
}

export class TforceFreightAdapter implements LogisticsAdapter {
  readonly platform = 'tforce-freight'
  readonly version = '1'

  constructor(_config: TforceFreightAdapterConfig = {}) {}

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return doExchange(code, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new TforceFreightClient(credentials)
    const raw = await client.get<TforceTrackingResponse>(
      `track/api/v1/shipments/${trackingNumber}`,
    )
    return transformTracking(raw)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new TforceFreightClient(credentials)
    const raw = await client.post<TforceShipment>('shipping/api/v1/shipments', {
      shipper: data.originAddress
        ? {
            name: data.originAddress.name,
            company: data.originAddress.company,
            address1: data.originAddress.street1,
            address2: data.originAddress.street2,
            city: data.originAddress.city,
            stateProvince: data.originAddress.state,
            postalCode: data.originAddress.postalCode,
            country: data.originAddress.country,
            phone: data.originAddress.phone,
            email: data.originAddress.email,
          }
        : undefined,
      consignee: data.destinationAddress
        ? {
            name: data.destinationAddress.name,
            company: data.destinationAddress.company,
            address1: data.destinationAddress.street1,
            address2: data.destinationAddress.street2,
            city: data.destinationAddress.city,
            stateProvince: data.destinationAddress.state,
            postalCode: data.destinationAddress.postalCode,
            country: data.destinationAddress.country,
            phone: data.destinationAddress.phone,
            email: data.destinationAddress.email,
          }
        : undefined,
      totalWeight: data.totalWeight?.value,
      weightUnit: data.totalWeight?.unit ?? 'lb',
      serviceLevel: data.serviceCode,
      reference: data.reference,
    })
    return transformShipment(raw)
  }

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new TforceFreightClient(credentials)
    const pkg = params.packages[0]
    const raw = await client.post<TforceRateResponse>('rating/getrate', {
      origin: {
        city: params.originAddress.city,
        stateProvince: params.originAddress.state,
        postalCode: params.originAddress.postalCode,
        country: params.originAddress.country ?? 'US',
      },
      destination: {
        city: params.destinationAddress.city,
        stateProvince: params.destinationAddress.state,
        postalCode: params.destinationAddress.postalCode,
        country: params.destinationAddress.country ?? 'US',
      },
      commodity: {
        weight: pkg?.weight?.value,
        weightUnit: pkg?.weight?.unit ?? 'lb',
        pieces: params.packages.length,
      },
    })
    return (raw.rateQuotes ?? []).map(transformRate)
  }

  // Label: derived from the POST /shipping/bol/create (shipping/api/v1/shipments) response.
  // The Shipping API returns BOL + label images in detail.documents.image[].
  // Reference: TForce Freight Shipping API User Manual (July 2025), §Document Details.
  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    const client = new TforceFreightClient(credentials)
    const raw = await client.post<TforceBolResponse>('shipping/api/v1/shipments', {
      requestOptions: {
        serviceCode: data.serviceCode,
      },
    })
    const labels = transformLabelsFromBolResponse(raw)
    if (labels.length === 0) {
      throw new Error('tforce-freight: no label documents returned in BOL response')
    }
    return labels[0]!
  }

  async listLabels(_credentials: Credentials, _params: QueryParams): Promise<Label[]> {
    // TForce Freight has no list-labels endpoint; labels are created with shipments.
    return []
  }
}
