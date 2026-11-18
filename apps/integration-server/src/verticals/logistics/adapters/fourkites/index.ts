// ── Resource coverage ──────────────────────────────────────────────────────
// Available:   shipment, trackingevent
// Unavailable: label    — FourKites is a visibility platform, not a label-printing service; no label API exists
// Unavailable: manifest — FourKites is a visibility platform, not a parcel carrier; no manifest API exists
// Unavailable: rate     — FourKites is a visibility platform, not a rating engine; no rate API exists
// Unverified:  carrier  — developer portal behind auth; no public carrier-list endpoint confirmed
// Unverified:  order    — Order Intelligence is a UI product; no public REST order endpoint confirmed
// Unverified:  warehouse — Dynamic Yard product may expose facilities but API is behind auth; not confirmed

import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { FourKitesClient } from './client'

import { transformTracking, type FourKitesTracking } from './transform/tracking'
import { transformShipment, type FourKitesLoad, type FourKitesLoadsResponse } from './transform/shipment'

interface FourKitesAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class FourKitesAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'fourkites'
  readonly version = '1'

  constructor(_config: FourKitesAdapterConfig = {}) {}

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

  async getTrackingEvents(credentials: Credentials, loadId: string): Promise<TrackingEvent[]> {
    const client = new FourKitesClient(credentials)
    const raw = await client.get<FourKitesTracking>(`loads/${loadId}/tracking`)
    return transformTracking(raw)
  }

  // ── Shipments (FourKites "loads" map to canonical Shipments) ──────────────

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new FourKitesClient(credentials)
    const res = await client.get<FourKitesLoadsResponse>('loads', {
      page: params.page,
      limit: params.limit,
    })
    return (res.loads ?? []).map(transformShipment)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new FourKitesClient(credentials)
    const raw = await client.post<FourKitesLoad>('loads', {
      trackingNumber: data.trackingNumber,
      carrierName: data.carrierId,
      mode: data.serviceCode,
      origin: {
        city: data.originAddress?.city,
        state: data.originAddress?.state,
        country: data.originAddress?.country,
      },
      destination: {
        city: data.destinationAddress?.city,
        state: data.destinationAddress?.state,
        country: data.destinationAddress?.country,
      },
    })
    return transformShipment(raw)
  }
}
