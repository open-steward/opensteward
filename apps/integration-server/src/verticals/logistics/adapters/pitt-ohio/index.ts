import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  RateRequestParams,
  QueryParams,
} from '../../adapter/interface'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Carrier } from '../../schema/carrier'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { PittOhioClient } from './client'

import { transformTracking, type PittOhioTrackingResponse } from './transform/tracking'
import { transformRate, type PittOhioRate } from './transform/rate'
import { transformCarrier } from './transform/carrier'

// ── Resource coverage ──────────────────────────────────────────────────────
// Unavailable: manifest  — PITT OHIO LTL has no manifest management API; the BOL is the terminal shipping document
// Unavailable: order     — PITT OHIO is a carrier, not an order management system; no order concept exists
// Unavailable: warehouse — PITT OHIO is a carrier, not a WMS; no warehouse API exists
// Unverified:  shipment  — BOL/pickup API documented to exist but PDF docs are access-controlled; v1 endpoint path and response field names unconfirmed
// Unverified:  label     — label creation documented as part of the BOL API but field names unconfirmed; same access barrier

interface PittOhioAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class PittOhioAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'pitt-ohio'
  readonly version = '1'

  constructor(_config: PittOhioAdapterConfig = {}) {}

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Carriers (derived — PITT OHIO is itself a single LTL carrier) ─────────

  async listCarriers(_credentials: Credentials, _params: QueryParams): Promise<Carrier[]> {
    return [transformCarrier()]
  }

  async getCarrier(_credentials: Credentials, _id: string): Promise<Carrier> {
    return transformCarrier()
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, proNumber: string): Promise<TrackingEvent[]> {
    const client = new PittOhioClient(credentials)
    const raw = await client.get<PittOhioTrackingResponse>(`tracking/${proNumber}`)
    return transformTracking(raw)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new PittOhioClient(credentials)
    const res = await client.post<{ quotes: PittOhioRate[] }>('rating/quotes', {
      origin: {
        postal_code: params.originAddress.postalCode,
        city: params.originAddress.city,
        state: params.originAddress.state,
        country: params.originAddress.country,
      },
      destination: {
        postal_code: params.destinationAddress.postalCode,
        city: params.destinationAddress.city,
        state: params.destinationAddress.state,
        country: params.destinationAddress.country,
      },
      items: params.packages.map((pkg) => ({
        weight: pkg.weight?.value,
        weight_unit: pkg.weight?.unit ?? 'lb',
      })),
    })
    return (res.quotes ?? []).map(transformRate)
  }
}
