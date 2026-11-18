// ── Resource coverage ──────────────────────────────────────────────
// Available:    shipment, trackingevent
// Unavailable:  carrier    — SeaVantage API has no carrier management endpoint
// Unavailable:  label      — SeaVantage API has no label endpoint
// Unavailable:  manifest   — SeaVantage API has no manifest endpoint
// Unavailable:  order      — SeaVantage API has no order management endpoint
// Unavailable:  rate       — SeaVantage API has no rate quoting endpoint
// Unavailable:  warehouse  — SeaVantage API has no warehouse management endpoint

import { simpleApiKey } from '@opensteward/shared'
import type { LogisticsAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { SeaVantageClient } from './client'
import {
  transformShipment,
  type SeaVantageCargoListResponse,
  type SeaVantageCargoResponse,
} from './transform/shipment'
import {
  transformCargoTracking,
  transformVesselTracking,
  type SeaVantageFleetResponse,
} from './transform/tracking'

const SIMPLE_API_KEY_FORM = simpleApiKey({
  label: 'API key',
  helpText: 'Copy your API key from the SeaVantage developer portal (developer.seavantage.com).',
})

export class SeaVantageAdapter implements LogisticsAdapter {
  // Connect Link support — single API-key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'seavantage'
  readonly version = '1'

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new SeaVantageClient(credentials)
    const raw = await client.get<SeaVantageCargoListResponse>('cargo/search', params)
    const items: SeaVantageCargoResponse[] = raw.response ?? []
    return items.map(transformShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new SeaVantageClient(credentials)
    const raw = await client.get<SeaVantageCargoListResponse>('cargo/search', { shipmentId: id })
    const items: SeaVantageCargoResponse[] = raw.response ?? []
    if (items.length === 0) {
      return { id, mode: 'ocean', metadata: {} }
    }
    return transformShipment(items[0])
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  /**
   * Fetches milestones for a container/MBL/booking number.
   * The `trackingNumber` parameter is mapped heuristically:
   *  - 11-char alphanumeric → container number
   *  - otherwise → MBL number
   */
  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new SeaVantageClient(credentials)
    const isContainer = /^[A-Z]{4}\d{7}$/i.test(trackingNumber)
    const queryParam = isContainer ? { containerNo: trackingNumber } : { mblNo: trackingNumber }
    const raw = await client.get<SeaVantageCargoListResponse>('cargo/search', queryParam)
    const items: SeaVantageCargoResponse[] = raw.response ?? []
    return items.flatMap(transformCargoTracking)
  }

  async listTrackingEvents(credentials: Credentials, params: QueryParams): Promise<TrackingEvent[]> {
    const client = new SeaVantageClient(credentials)
    const raw = await client.get<SeaVantageCargoListResponse>('cargo/search', params)
    const items: SeaVantageCargoResponse[] = raw.response ?? []
    return items.flatMap(transformCargoTracking)
  }

  // ── Vessel (AIS) tracking ──────────────────────────────────────────────────

  /**
   * Fetches real-time AIS position for a vessel identified by IMO or MMSI.
   * Returns a single-element TrackingEvent array with the live position.
   */
  async getVesselPosition(credentials: Credentials, imoOrMmsi: string): Promise<TrackingEvent[]> {
    const client = new SeaVantageClient(credentials)
    const raw = await client.get<SeaVantageFleetResponse>('fleet/ship/info', {
      imo: imoOrMmsi,
    })
    const vessels = raw.response ?? []
    return vessels.map(transformVesselTracking)
  }
}
