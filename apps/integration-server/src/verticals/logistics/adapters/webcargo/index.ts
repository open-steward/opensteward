// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: label     — WebCargo is an air/ocean freight booking platform that generates eAWBs, not parcel shipping labels; no label resource exists
// Unavailable: warehouse — WebCargo is a freight rate and booking platform with no warehouse management concept; no warehouse resource documented anywhere
// Unverified:  carrier   — API docs require authentication at developers.freightos.com; no public /carriers endpoint confirmed
// Unverified:  manifest  — API docs require authentication at developers.freightos.com; no public /manifests endpoint confirmed
// Unverified:  order     — API docs require authentication at developers.freightos.com; no public /orders endpoint confirmed
// Unverified:  rate      — Rate quoting is a core WebCargo feature but endpoint path and response fields are behind authenticated developer portal

import { simpleApiKey } from '@opensteward/shared'
import type { LogisticsAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { TrackingEvent } from '../../schema/trackingevent'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { WebcargoClient } from './client'
import { transformTracking, type WebcargoTrackingResponse } from './transform/tracking'

interface WebcargoAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class WebcargoAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'webcargo'
  readonly version = '1'

  constructor(_config: WebcargoAdapterConfig = {}) {}

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
    const client = new WebcargoClient(credentials)
    const raw = await client.get<WebcargoTrackingResponse>(`tracking/awb/${trackingNumber}`)
    return transformTracking(raw)
  }

  async listTrackingEvents(credentials: Credentials, params: QueryParams): Promise<TrackingEvent[]> {
    const client = new WebcargoClient(credentials)
    const raw = await client.get<{ data: WebcargoTrackingResponse[] }>('tracking', params)
    const list = raw.data ?? []
    return list.flatMap((r) => transformTracking(r))
  }
}
