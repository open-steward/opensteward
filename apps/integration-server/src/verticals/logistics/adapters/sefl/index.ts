// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: carrier   — SEFL is a single LTL carrier; no carrier-listing endpoint exists.
// Unavailable: label     — No label-printing API; Document Retrieval returns existing BOL PDFs by PRO number only.
// Unavailable: manifest  — No manifest management API documented in WebConnect.
// Unavailable: order     — No order resource endpoint; only pickup scheduling and shipment creation are offered.
// Unavailable: warehouse — SEFL is a freight carrier, not a 3PL/WMS; no warehouse endpoints exist.

import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { SeflClient } from './client'

import { transformShipment, type SeflShipment } from './transform/shipment'
import { transformTracking, type SeflTrackingResponse } from './transform/tracking'
import { transformRate, type SeflRateResponse } from './transform/rate'

interface SeflAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class SeflAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'sefl'
  readonly version = '1'

  constructor(_config: SeflAdapterConfig = {}) {}

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new SeflClient(credentials)
    const raw = await client.get<SeflTrackingResponse>('TrackingService.svc/Track', {
      proNumber: trackingNumber,
    })
    return transformTracking(raw)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new SeflClient(credentials)
    const raw = await client.post<SeflShipment>('ShipmentService.svc/CreateShipment', {
      shipper: data.originAddress
        ? {
            name: data.originAddress.name,
            company: data.originAddress.company,
            address1: data.originAddress.street1,
            address2: data.originAddress.street2,
            city: data.originAddress.city,
            state: data.originAddress.state,
            zip: data.originAddress.postalCode,
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
            zip: data.destinationAddress.postalCode,
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
    const client = new SeflClient(credentials)
    const pkg = params.packages[0]
    const raw = await client.post<SeflRateResponse>('RatingService.svc/RateQuote', {
      origin: {
        city: params.originAddress.city,
        state: params.originAddress.state,
        zip: params.originAddress.postalCode,
        country: params.originAddress.country ?? 'US',
      },
      destination: {
        city: params.destinationAddress.city,
        state: params.destinationAddress.state,
        zip: params.destinationAddress.postalCode,
        country: params.destinationAddress.country ?? 'US',
      },
      commodity: {
        weight: pkg?.weight?.value,
        weightUnit: pkg?.weight?.unit ?? 'lb',
        pieces: params.packages.length,
      },
    })
    return raw.quote ? [transformRate(raw.quote)] : []
  }
}
