// ── Resource coverage ──────────────────────────────────────────────────────
// Unavailable: carrier   — ShipTime API docs are behind authentication; no
//                          public /carriers endpoint confirmed.
// Unavailable: manifest  — No /manifests endpoint found in public docs or
//                          any accessible API surface.
// Unavailable: order     — ShipTime is a shipping-rate/label platform, not
//                          an order management system; no /orders endpoint
//                          found.
// Unavailable: warehouse — No /warehouses endpoint found in accessible docs.
// Derived:     label     — Labels are returned inline with shipments
//                          (label_url field); no dedicated /labels endpoint.
//                          Derived from POST /shipments response.
// ──────────────────────────────────────────────────────────────────────────

import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Label } from '../../schema/label'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { ShipTimeClient } from './client'

import { transformTracking, type ShipTimeTrackingResponse } from './transform/tracking'
import { transformShipment, type ShipTimeShipment } from './transform/shipment'
import { transformRate, type ShipTimeRate } from './transform/rate'
import { transformLabel } from './transform/label'

interface ShipTimeAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class ShipTimeAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'shiptime'
  readonly version = '1'

  constructor(_config: ShipTimeAdapterConfig = {}) {}

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
    const client = new ShipTimeClient(credentials)
    const raw = await client.get<ShipTimeTrackingResponse>(`tracking/${trackingNumber}`)
    return transformTracking(raw)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new ShipTimeClient(credentials)
    const raw = await client.post<ShipTimeShipment>('shipments', {
      sender: data.originAddress
        ? {
            name: data.originAddress.name,
            company: data.originAddress.company,
            address_line1: data.originAddress.street1,
            address_line2: data.originAddress.street2,
            city: data.originAddress.city,
            state: data.originAddress.state,
            postal_code: data.originAddress.postalCode,
            country: data.originAddress.country,
            phone: data.originAddress.phone,
            email: data.originAddress.email,
          }
        : undefined,
      recipient: data.destinationAddress
        ? {
            name: data.destinationAddress.name,
            company: data.destinationAddress.company,
            address_line1: data.destinationAddress.street1,
            address_line2: data.destinationAddress.street2,
            city: data.destinationAddress.city,
            state: data.destinationAddress.state,
            postal_code: data.destinationAddress.postalCode,
            country: data.destinationAddress.country,
            phone: data.destinationAddress.phone,
            email: data.destinationAddress.email,
          }
        : undefined,
      weight: data.totalWeight?.value,
      weight_unit: data.totalWeight?.unit ?? 'lb',
      service_code: data.serviceCode,
      reference: data.reference,
    })
    return transformShipment(raw)
  }

  // ── Rates ─────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new ShipTimeClient(credentials)
    const raw = await client.post<{ rates: ShipTimeRate[] }>('rates', {
      origin: params.originAddress,
      destination: params.destinationAddress,
      packages: params.packages,
      service_codes: params.serviceCodes,
    })
    return (raw.rates ?? []).map(transformRate)
  }

  // ── Labels (derived from shipments) ───────────────────────────────────────
  // ShipTime has no dedicated /labels endpoint.  A label is created as part
  // of POST /shipments and its URL lives in the shipment response (`label_url`).
  // getLabel fetches the parent shipment and derives a Label record from it.

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new ShipTimeClient(credentials)
    const raw = await client.get<ShipTimeShipment>(`shipments/${id}`)
    return transformLabel(raw)
  }
}
