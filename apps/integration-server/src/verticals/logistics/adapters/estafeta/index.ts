// ── Resource coverage ──────────────────────────────────────────────
// Unavailable:  manifest  — Manifesting is not supported or required for Estafeta (EasyPost official carrier guide)
// Unverified:   carrier   — REST API portal (Layer7) is login-gated; no public /carriers endpoint confirmed
// Unverified:   label     — Legacy SOAP label service exists but no confirmed REST endpoint at api.estafeta.com/v1/; portal login-gated
// Unverified:   order     — REST API portal is login-gated; no public /orders endpoint documented
// Unverified:   shipment  — REST API portal is login-gated; no public /shipments endpoint documented
// Unverified:   warehouse — REST API portal is login-gated; no public /warehouses endpoint documented

import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  RateRequestParams,
} from '../../adapter/interface'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { EstafetaClient } from './client'

import { transformTracking, type EstafetaTrackingResponse } from './transform/tracking'
import { transformRate, type EstafetaRate } from './transform/rate'

interface EstafetaAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class EstafetaAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'estafeta'
  readonly version = '1'

  constructor(_config: EstafetaAdapterConfig = {}) {}

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
    const client = new EstafetaClient(credentials)
    const raw = await client.get<EstafetaTrackingResponse>(`tracking/${trackingNumber}`)
    return transformTracking(raw)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new EstafetaClient(credentials)
    const res = await client.post<{ quotes: EstafetaRate[] }>('quotation', {
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
      packages: params.packages.map((pkg) => ({
        weight: pkg.weight?.value,
        weight_unit: pkg.weight?.unit ?? 'kg',
      })),
    })
    return (res.quotes ?? []).map(transformRate)
  }
}
