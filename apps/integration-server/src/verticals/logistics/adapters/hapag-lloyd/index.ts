// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: carrier  — Hapag-Lloyd is a single ocean carrier; no API to list carriers exists.
// Unavailable: label    — Ocean carriers do not issue parcel labels; Bills of Lading are exchanged via EDI.
// Unavailable: manifest — No manifest management REST API; cargo manifests are exchanged via EDI.
// Unavailable: order    — No order management REST API; freight booking is via EDI or web portal.
// Unverified:  rate     — Quick Quotes API is confirmed to exist but endpoint paths require authenticated portal access.
// Unavailable: warehouse — Hapag-Lloyd is an ocean carrier, not a 3PL; no warehouse concept or API.

import { simpleApiKey } from '@opensteward/shared'
import type { LogisticsAdapter, Credentials } from '../../adapter/interface'
import type { TrackingEvent } from '../../schema/trackingevent'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { HapagLloydClient } from './client'
import { transformTracking, type HapagLloydTrackingResponse } from './transform/tracking'

interface HapagLloydAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class HapagLloydAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'hapag-lloyd'
  readonly version = '1'

  constructor(_config: HapagLloydAdapterConfig = {}) {}

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
    const client = new HapagLloydClient(credentials)
    const raw = await client.get<HapagLloydTrackingResponse>(`tracing/v1/containers/${trackingNumber}`)
    return transformTracking(raw)
  }
}
