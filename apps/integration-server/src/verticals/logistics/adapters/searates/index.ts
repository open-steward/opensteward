// ── Resource coverage ──────────────────────────────────────────────
// Available:   shipment, trackingevent
// Unavailable: carrier  — RMS API (rates.searates.com) requires separate platform-token auth, incompatible with simpleApiKey
// Unavailable: label    — no parcel label generation API; SeaRates is an ocean-freight rate/tracking platform
// Unavailable: manifest — no manifest API documented across any SeaRates API surface
// Unavailable: order    — Booking System API (rates.searates.com) requires separate platform-token auth, incompatible with simpleApiKey
// Unavailable: rate     — RMS API (rates.searates.com) requires separate platform-token auth, incompatible with simpleApiKey
// Unavailable: warehouse — no warehouse management API documented across any SeaRates API surface

import { simpleApiKey } from '@opensteward/shared'
import type { LogisticsAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { TrackingEvent } from '../../schema/trackingevent'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { SearatesClient } from './client'
import { transformTracking, type SearatesTrackingResponse } from './transform/tracking'

interface SearatesAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class SearatesAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'searates'
  readonly version = '1'

  constructor(_config: SearatesAdapterConfig = {}) {}

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
    const client = new SearatesClient(credentials)
    const raw = await client.get<SearatesTrackingResponse>(`tracking/${trackingNumber}`)
    return transformTracking(raw)
  }

  async listTrackingEvents(credentials: Credentials, params: QueryParams): Promise<TrackingEvent[]> {
    const client = new SearatesClient(credentials)
    const raw = await client.get<{ data: SearatesTrackingResponse[] }>('tracking', params)
    const list = raw.data ?? []
    return list.flatMap((r) => transformTracking(r))
  }
}
