// ── Resource coverage ──────────────────────────────────────────────
// Available:   shipment, trackingevent
// Unavailable: carrier     — ZIM is a single ocean-carrier line; no carrier-list endpoint in their API
// Unavailable: label       — ZIM does not issue parcel labels; no label endpoint exists
// Unavailable: manifest    — ZIM's public API is limited to container tracing; no manifest endpoint
// Unavailable: order       — Bookings are managed via web portal/EDI, not a REST orders endpoint
// Unavailable: rate        — No public spot-rate or freight-rate REST endpoint; pricing is offline/EDI
// Unavailable: warehouse   — ZIM is a shipping line, not a 3PL; no warehouse endpoint exists

import { simpleApiKey } from '@opensteward/shared'
import type { LogisticsAdapter, Credentials } from '../../adapter/interface'
import type { TrackingEvent } from '../../schema/trackingevent'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { ZimClient } from './client'
import { transformTracking, type ZimTrackingResponse } from './transform/tracking'

interface ZimAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class ZimAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'zim'
  readonly version = '1'

  constructor(_config: ZimAdapterConfig = {}) {}

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
    const client = new ZimClient(credentials)
    const raw = await client.get<ZimTrackingResponse>(`tracing/v1/containers/${trackingNumber}`)
    return transformTracking(raw)
  }
}
