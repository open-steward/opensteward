// ── Resource coverage ──────────────────────────────────────────────
// Available:  shipment, trackingevent, label
// Unavailable: carrier — DHL Parcel BNL is itself the carrier; no /carriers endpoint exists
// Unavailable: manifest — no manifest endpoint in the api-gw.dhlparcel.nl API (only DHL DE has one)
// Unavailable: order — no order management endpoint in the BNL API
// Unavailable: rate — /capabilities returns service availability only, not pricing/rates
// Unavailable: warehouse — DHL manages its own pickup infrastructure; no /warehouses endpoint

import { simpleApiKey } from '@opensteward/shared'
import type { LogisticsAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Label } from '../../schema/label'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { DhlParcelBnlClient } from './client'
import { transformTracking, type DhlParcelBnlTrackingResponse } from './transform/tracking'
import { transformShipment, type DhlParcelBnlShipment } from './transform/shipment'
import { transformLabel, type DhlParcelBnlLabel } from './transform/label'

interface DhlParcelBnlAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class DhlParcelBnlAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'dhl-parcel-bnl'
  readonly version = '1'

  constructor(_config: DhlParcelBnlAdapterConfig = {}) {}

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
    const client = new DhlParcelBnlClient(credentials)
    const raw = await client.get<DhlParcelBnlTrackingResponse>(`track-trace/${trackingNumber}`)
    return transformTracking(raw)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new DhlParcelBnlClient(credentials)
    const raw = await client.post<DhlParcelBnlShipment>('shipments', {
      sender: data.originAddress,
      recipient: data.destinationAddress,
      weight: data.totalWeight
        ? { value: data.totalWeight.value, unit: data.totalWeight.unit }
        : undefined,
      reference: data.reference,
      serviceCode: data.serviceCode,
    })
    return transformShipment(raw)
  }

  async listLabels(credentials: Credentials, _params: QueryParams): Promise<Label[]> {
    const client = new DhlParcelBnlClient(credentials)
    const raw = await client.get<DhlParcelBnlLabel[]>('labels')
    return raw.map(transformLabel)
  }

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new DhlParcelBnlClient(credentials)
    const raw = await client.get<DhlParcelBnlLabel>(`labels/${id}`)
    return transformLabel(raw)
  }
}
