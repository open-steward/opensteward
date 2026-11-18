// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: carrier   — Roadie is a single on-demand courier; no /v1/carriers endpoint exists
// Unavailable: manifest  — no manifest concept or endpoint in the Roadie API
// Unavailable: order     — Roadie has no separate order resource; shipments serve that role
// Unavailable: warehouse — Roadie is an on-demand delivery network, not a WMS; no warehouse endpoints

import { simpleApiKey } from '@opensteward/shared'
import type { LogisticsAdapter, Credentials, RateRequestParams } from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Label } from '../../schema/label'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { RoadieClient } from './client'
import { transformTracking, type RoadieShipmentResp } from './transform/tracking'
import { transformShipment, type RoadieShipment } from './transform/shipment'
import { transformRate, type RoadieEstimate } from './transform/rate'
import { transformLabel, type RoadieLabelShipment } from './transform/label'
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class RoadieAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'roadie'
  readonly version = '1'

  getAuthUrl(state: string): string { return buildAuthUrl(state) }
  async exchangeCode(code: string, _ru: string): Promise<Credentials> { return exchangeApiKey(code) }
  async refreshCredentials(c: Credentials): Promise<Credentials> { return doRefresh(c) }

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new RoadieClient(credentials)
    const raw = await client.get<RoadieShipmentResp>(`shipments/${trackingNumber}`)
    return transformTracking(raw)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new RoadieClient(credentials)
    const raw = await client.post<RoadieShipment>('shipments', {
      reference_id: data.reference,
      pickup_location: { address: data.originAddress },
      delivery_location: { address: data.destinationAddress },
    })
    return transformShipment(raw)
  }

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new RoadieClient(credentials)
    const raw = await client.post<RoadieEstimate>('estimates', {
      pickup_location: { address: params.originAddress },
      delivery_location: { address: params.destinationAddress },
    })
    return [transformRate(raw)]
  }

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new RoadieClient(credentials)
    const raw = await client.get<RoadieLabelShipment>(`shipments/${id}`)
    return transformLabel(raw)
  }
}
