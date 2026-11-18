// ── Resource coverage ──────────────────────────────────────────────
// Available:   rate, trackingevent
// Unavailable: carrier — Colissimo (La Poste) is itself the single carrier; no carrier list endpoint exists in the Okapi Suivi v2 API.
// Unavailable: label — label generation requires the separate SLS API (ws.colissimo.fr) with contractNumber/password auth, incompatible with this adapter's X-Okapi-Key scheme.
// Unavailable: manifest — manifest/bordereau generation requires the separate SLS API (ws.colissimo.fr) with contractNumber/password auth, incompatible with this adapter's X-Okapi-Key scheme.
// Unavailable: order — Colissimo has no order management concept; the Okapi Suivi v2 API is a shipping-label and tracking service only.
// Unavailable: shipment — the Okapi Suivi v2 API has no shipment list or get endpoint; only per-tracking-number lookup is supported.
// Unavailable: warehouse — Colissimo has no warehouse management concept in any of its public APIs.

import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  RateRequestParams,
} from '../../adapter/interface'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { ColissimoClient } from './client'

import { transformTracking, type ColissimoTrackingResponse } from './transform/tracking'
import { transformRate, type ColissimoRate } from './transform/rate'

interface ColissimoAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class ColissimoAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'colissimo'
  readonly version = '1'

  constructor(_config: ColissimoAdapterConfig = {}) {}

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

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new ColissimoClient(credentials)
    const raw = await client.get<ColissimoTrackingResponse>(`idships/${trackingNumber}`)
    return transformTracking(raw)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new ColissimoClient(credentials)
    const res = await client.post<{ rates: ColissimoRate[] }>('tarification', {
      from: {
        postal_code: params.originAddress.postalCode,
        country: params.originAddress.country,
      },
      to: {
        postal_code: params.destinationAddress.postalCode,
        country: params.destinationAddress.country,
      },
      weight: params.packages[0]?.weight?.value,
    })
    return (res.rates ?? []).map(transformRate)
  }
}
