// ── Resource coverage ──────────────────────────────────────────────────────────
// Available:   rate, trackingevent, shipment, label
// Unavailable: carrier    — R+L Carriers is a single LTL carrier; the API exposes no /carrier listing endpoint
// Unavailable: manifest   — no manifest management endpoint in the R+L Carriers API
// Unavailable: order      — no order lifecycle concept in the R+L Carriers API; BOL/pickup is the closest
// Unavailable: warehouse  — Service Points API returns only City/State/ZIP; no warehouse management

import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  RateRequestParams,
} from '../../adapter/interface'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Shipment } from '../../schema/shipment'
import type { Label } from '../../schema/label'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { RplusLClient } from './client'

import { transformTracking, type RplusLTrackingResponse } from './transform/tracking'
import { transformRate, type RplusLRate } from './transform/rate'
import { transformShipment, type RplusLBOL } from './transform/shipment'
import { transformLabel, type RplusLLabelResponse } from './transform/label'

interface RplusLAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class RplusLAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'rplust'
  readonly version = '1'

  constructor(_config: RplusLAdapterConfig = {}) {}

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

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new RplusLClient(credentials)
    const raw = await client.get<RplusLTrackingResponse>(`tracking/${trackingNumber}`)
    return transformTracking(raw)
  }

  // ── Rates ─────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new RplusLClient(credentials)
    const raw = await client.post<{ quotes: RplusLRate[] }>('rating/quotes', {
      origin: params.originAddress,
      destination: params.destinationAddress,
      packages: params.packages,
      service_codes: params.serviceCodes,
    })
    return (raw.quotes ?? []).map(transformRate)
  }

  // ── Shipments ─────────────────────────────────────────────────────────────
  // Source: GET /BillOfLading?ProNumber={proNumber}

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new RplusLClient(credentials)
    const raw = await client.get<RplusLBOL>('BillOfLading', { ProNumber: id })
    return transformShipment(raw)
  }

  // ── Labels ────────────────────────────────────────────────────────────────
  // Source: GET /BillOfLading/PrintShippingLabels?ProNumber={proNumber}

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new RplusLClient(credentials)
    const raw = await client.get<RplusLLabelResponse>('BillOfLading/PrintShippingLabels', {
      ProNumber: id,
    })
    return transformLabel(raw)
  }
}
