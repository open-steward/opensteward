// ── Resource coverage ──────────────────────────────────────────────
// Available:   shipment, trackingevent
// Unavailable: carrier    — CMA CGM is itself an ocean carrier; no carrier-discovery endpoint exists
// Unavailable: label      — ocean carrier issues Bills of Lading, not parcel labels; no label REST API
// Unavailable: manifest   — manifests exchanged via EDI (EDIFACT IFTMCS) only; no REST manifest API
// Unavailable: order      — bookings placed/confirmed via EDI and inbound webhook push; no listable order REST API
// Unverified:  rate       — a pricing product exists in the portal but requires a paid subscription; endpoint paths unconfirmed
// Unavailable: warehouse  — CMA CGM is an ocean carrier, not a 3PL/WMS; no warehouse REST API exists

import { simpleApiKey } from '@opensteward/shared'
import type { LogisticsAdapter, Credentials } from '../../adapter/interface'
import type { TrackingEvent } from '../../schema/trackingevent'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { CmaCgmClient } from './client'
import { transformTracking, type CmaCgmTrackingResponse } from './transform/tracking'

interface CmaCgmAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class CmaCgmAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'cma-cgm'
  readonly version = '1'

  constructor(_config: CmaCgmAdapterConfig = {}) {}

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
    const client = new CmaCgmClient(credentials)
    const raw = await client.get<CmaCgmTrackingResponse>(`shipment-tracking/v1/containers/${trackingNumber}`)
    return transformTracking(raw)
  }
}
