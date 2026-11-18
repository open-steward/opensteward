// ── Resource coverage ──────────────────────────────────────────────
// Available:   carrier (shipping_lines), shipment (containers), trackingevent (transport events)
// Unavailable: label    — Terminal49 is an ocean visibility API and does not generate shipping labels
// Unavailable: manifest — Terminal49 does not support manifest creation
// Unavailable: order    — Terminal49 does not offer order management
// Unavailable: rate     — Terminal49 does not offer rate shopping or quoting
// Unavailable: warehouse — Terminal49 does not provide warehouse management

import { pageLocally, simpleApiKey } from '@opensteward/shared'
import type { LogisticsAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Carrier } from '../../schema/carrier'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { Terminal49Client } from './client'
import { transformTracking, type Terminal49TrackingResponse } from './transform/tracking'
import { transformCarrier, type Terminal49ShippingLinesResponse } from './transform/carrier'

interface Terminal49AdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class Terminal49Adapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'terminal49'
  readonly version = '1'

  constructor(_config: Terminal49AdapterConfig = {}) {}

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
    const client = new Terminal49Client(credentials)
    const raw = await client.get<Terminal49TrackingResponse>(`containers/${trackingNumber}`)
    return transformTracking(raw)
  }

  async listTrackingEvents(credentials: Credentials, params: QueryParams): Promise<TrackingEvent[]> {
    const client = new Terminal49Client(credentials)
    const raw = await client.get<{ data: Terminal49TrackingResponse[] }>('containers', params)
    const list = raw.data ?? []
    return list.flatMap((r) => transformTracking(r))
  }

  async listCarriers(credentials: Credentials, params: QueryParams): Promise<Carrier[]> {
    const client = new Terminal49Client(credentials)
    // GET /shipping_lines: "N.B. There is no pagination for this endpoint." It
    // answers the whole collection, so the caller's page is cut locally.
    const raw = await client.get<Terminal49ShippingLinesResponse>('shipping_lines')
    return pageLocally((raw.data ?? []).map(transformCarrier), params)
  }

  async getCarrier(credentials: Credentials, id: string): Promise<Carrier> {
    const client = new Terminal49Client(credentials)
    const raw = await client.get<{ data: Terminal49ShippingLinesResponse['data'][0] }>(`shipping_lines/${id}`)
    return transformCarrier(raw.data)
  }
}
