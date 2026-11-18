// ── Resource coverage ──────────────────────────────────────────────
// Available:   shipment, trackingevent
// Unavailable: carrier    — ONE LINE is the carrier itself; no carrier-registry REST endpoint exists.
// Unavailable: label      — Ocean freight carrier; no domestic shipping label (PDF/ZPL) endpoint.
// Unavailable: manifest   — Ocean manifests are handled via EDI, not a public REST endpoint.
// Unavailable: order      — Booking is handled via EDI and the ONE eCommerce portal, not a REST order API.
// Unavailable: rate       — Rate quotation is available only via the ONE QUOTE web portal, not a public REST endpoint.
// Unavailable: warehouse  — ONE LINE is an ocean carrier, not a 3PL/WMS; no warehouse API exists.

import { simpleApiKey } from '@opensteward/shared'
import type { LogisticsAdapter, Credentials } from '../../adapter/interface'
import type { TrackingEvent } from '../../schema/trackingevent'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { OneLineClient } from './client'
import { transformTracking, type OneLineTrackingResponse } from './transform/tracking'

interface OneLineAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class OneLineAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'one-line'
  readonly version = '1'

  constructor(_config: OneLineAdapterConfig = {}) {}

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
    const client = new OneLineClient(credentials)
    const raw = await client.get<OneLineTrackingResponse>(`tracking/v1/containers/${trackingNumber}`)
    return transformTracking(raw)
  }
}
