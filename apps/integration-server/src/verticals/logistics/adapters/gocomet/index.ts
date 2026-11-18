// ── Resource coverage ──────────────────────────────────────────────
// Unverified: carrier   — GoComet public API (api.gocomet.com/v1) only exposes shipments and tracking; no carriers endpoint found — apidocs.gocomet.com requires login to access full spec
// Unverified: label     — GoComet public API (api.gocomet.com/v1) only exposes shipments and tracking; no labels endpoint found — apidocs.gocomet.com requires login to access full spec
// Unverified: manifest  — GoComet public API (api.gocomet.com/v1) only exposes shipments and tracking; no manifests endpoint found — apidocs.gocomet.com requires login to access full spec
// Unverified: order     — GoComet public API (api.gocomet.com/v1) only exposes shipments and tracking; no orders endpoint found — apidocs.gocomet.com requires login to access full spec
// Unverified: rate      — GoComet public API (api.gocomet.com/v1) only exposes shipments and tracking; no rates endpoint found — apidocs.gocomet.com requires login to access full spec
// Unverified: warehouse — GoComet public API (api.gocomet.com/v1) only exposes shipments and tracking; no warehouses endpoint found — apidocs.gocomet.com requires login to access full spec

import { simpleApiKey } from '@opensteward/shared'
import type { LogisticsAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { GoCometClient } from './client'
import { transformShipment, type GoCometContainer, type GoCometShipmentListResponse } from './transform/shipment'
import { transformTracking, type GoCometTrackingResponse } from './transform/tracking'

interface GoCometAdapterConfig {
  sandbox?: boolean
}

const SIMPLE_API_KEY_FORM = simpleApiKey()

export class GoCometAdapter implements LogisticsAdapter {
  // Connect Link support — single API-key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'gocomet'
  readonly version = '1'

  constructor(_config: GoCometAdapterConfig = {}) {}

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new GoCometClient(credentials)
    const raw = await client.get<GoCometShipmentListResponse>('shipments', params)
    const list: GoCometContainer[] = raw.data ?? raw.shipments ?? []
    return list.map((s) => transformShipment(s))
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new GoCometClient(credentials)
    const raw = await client.get<GoCometContainer>(`shipments/${id}`)
    return transformShipment(raw)
  }

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new GoCometClient(credentials)
    const raw = await client.get<GoCometTrackingResponse>(`tracking/${trackingNumber}`)
    return transformTracking(raw)
  }

  async listTrackingEvents(credentials: Credentials, params: QueryParams): Promise<TrackingEvent[]> {
    const client = new GoCometClient(credentials)
    const raw = await client.get<{ data?: GoCometTrackingResponse[]; tracking?: GoCometTrackingResponse[] }>(
      'tracking',
      params,
    )
    const list = raw.data ?? raw.tracking ?? []
    return list.flatMap((r) => transformTracking(r))
  }
}
