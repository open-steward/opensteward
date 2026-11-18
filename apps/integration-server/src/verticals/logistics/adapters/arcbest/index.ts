import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  RateRequestParams,
  QueryParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Carrier } from '../../schema/carrier'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { ArcbestClient } from './client'

import { transformShipment, type ArcbestShipment } from './transform/shipment'
import { transformTracking, type ArcbestTrackingResponse } from './transform/tracking'
import { transformRate, type ArcbestRateResponse } from './transform/rate'
import { getArcbestCarrier } from './transform/carrier'

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: label     — ArcBest has no label generation or retrieval endpoint in its public API
// Unavailable: manifest  — ArcBest has no manifest/end-of-day close-out concept in its API
// Unavailable: order     — ArcBest has no order management endpoints
// Unavailable: warehouse — ArcBest has no warehouse management endpoints
// Derived:     carrier   — ArcBest is itself a single LTL carrier (ABF Freight); no listing endpoint exists

interface ArcbestAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class ArcbestAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'arcbest'
  readonly version = '1'

  constructor(_config: ArcbestAdapterConfig = {}) {}

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Carriers ───────────────────────────────────────────────────────────────
  // ArcBest is itself a single LTL carrier (ABF Freight). No listing endpoint
  // exists; we derive a static record from the well-known platform identity.

  async listCarriers(_credentials: Credentials, _params: QueryParams): Promise<Carrier[]> {
    return [getArcbestCarrier()]
  }

  async getCarrier(_credentials: Credentials, id: string): Promise<Carrier> {
    const carrier = getArcbestCarrier()
    if (id !== carrier.id) {
      throw new Error(`ArcBest: carrier ${id} not found`)
    }
    return carrier
  }

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new ArcbestClient(credentials)
    const raw = await client.get<ArcbestTrackingResponse>(`tracking/${trackingNumber}`)
    return transformTracking(raw)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new ArcbestClient(credentials)
    const raw = await client.post<ArcbestShipment>('pickup-request', {
      shipper: data.originAddress
        ? {
            name: data.originAddress.name,
            company: data.originAddress.company,
            address1: data.originAddress.street1,
            address2: data.originAddress.street2,
            city: data.originAddress.city,
            state: data.originAddress.state,
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
            state: data.destinationAddress.state,
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
    const client = new ArcbestClient(credentials)
    const pkg = params.packages[0]
    const raw = await client.post<ArcbestRateResponse>('analytics/rate-quote', {
      origin: {
        city: params.originAddress.city,
        state: params.originAddress.state,
        postalCode: params.originAddress.postalCode,
        country: params.originAddress.country ?? 'US',
      },
      destination: {
        city: params.destinationAddress.city,
        state: params.destinationAddress.state,
        postalCode: params.destinationAddress.postalCode,
        country: params.destinationAddress.country ?? 'US',
      },
      commodity: {
        weight: pkg?.weight?.value,
        weightUnit: pkg?.weight?.unit ?? 'lb',
        pieces: params.packages.length,
      },
    })
    return (raw.quotes ?? []).map(transformRate)
  }
}
