// ── Resource coverage ──────────────────────────────────────────────
// Available:   rate, trackingevent
// Unavailable: carrier — Averitt REST API has no carrier profile endpoint
// Unavailable: label — Averitt REST API has no label generation or retrieval endpoint
// Unavailable: manifest — Averitt REST API has no manifest endpoint
// Unavailable: order — Averitt REST API has no order management endpoint; document request returns PDFs only
// Unavailable: shipment — Averitt REST API has no shipment management endpoint
// Unavailable: warehouse — Averitt REST API has no warehouse endpoint

import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  RateRequestParams,
} from '../../adapter/interface'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { AverittClient } from './client'

import { transformTracking, type AverittTrackingResponse } from './transform/tracking'
import { transformRate, type AverittRate } from './transform/rate'

interface AverittAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class AverittAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'averitt'
  readonly version = '1'

  constructor(_config: AverittAdapterConfig = {}) {}

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

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, proNumber: string): Promise<TrackingEvent[]> {
    const client = new AverittClient(credentials)
    const raw = await client.get<AverittTrackingResponse>(`tracking/${proNumber}`)
    return transformTracking(raw)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new AverittClient(credentials)
    const res = await client.post<{ quotes: AverittRate[] }>('rating/quotes', {
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
