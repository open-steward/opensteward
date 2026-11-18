// ── Resource coverage ──────────────────────────────────────────────────────────
// Available:   rate, trackingevent
// Unavailable: carrier    — Correios is the sole carrier; no carrier-listing endpoint exists in the public REST API
// Unavailable: order      — Correios is a carrier, not an order management system; no order API exists
// Unavailable: warehouse  — Correios has no warehouse concept; agencia/v1/unidades returns branch offices, not warehouses
// Unverified:  label      — prepostagem/v1 label endpoint confirmed to exist but full spec is behind CWS authenticated contract portal
// Unverified:  manifest   — PPN manifest/PLP REST endpoint referenced but full spec is behind CWS authenticated contract portal
// Unverified:  shipment   — prepostagem/v1 shipment creation endpoint confirmed to exist but full spec is behind CWS authenticated contract portal

import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  RateRequestParams,
} from '../../adapter/interface'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { CorreiosClient } from './client'

import { transformTracking, type CorreiosTrackingResponse } from './transform/tracking'
import { transformRate, type CorreiosRateResponse } from './transform/rate'

interface CorreiosAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class CorreiosAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'correios'
  readonly version = '1'

  constructor(_config: CorreiosAdapterConfig = {}) {}

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
    const client = new CorreiosClient(credentials)
    const raw = await client.get<CorreiosTrackingResponse>(`srorastro/v1/objetos/${trackingNumber}`)
    return transformTracking(raw, trackingNumber)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new CorreiosClient(credentials)
    const pkg = params.packages[0]
    const raw = await client.post<CorreiosRateResponse>('preco/v1/nacional', {
      cepOrigem: params.originAddress.postalCode,
      cepDestino: params.destinationAddress.postalCode,
      peso: pkg?.weight?.value,
      comprimento: pkg?.dimensions?.length,
      largura: pkg?.dimensions?.width,
      altura: pkg?.dimensions?.height,
      servicos: params.serviceCodes,
    })
    return (raw.precos ?? []).map(transformRate)
  }
}
