import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { JneClient } from './client'

import { transformTracking, type JneTrackingResponse } from './transform/tracking'
import { transformShipment, type JneShipmentRaw } from './transform/shipment'
import { transformTrackingEvent, type JneTrackingEventRaw } from './transform/trackingevent'
import { transformRate, type JneRateRaw } from './transform/rate'

// ── Resource coverage ──────────────────────────────────────────────
// Available:   shipment, trackingevent, rate
// Unavailable: carrier     — JNE is a single courier; no multi-carrier listing API exists
// Unavailable: label       — label URL is embedded in the shipment response; no standalone label endpoint documented
// Unavailable: manifest    — no manifest management endpoint documented in the JNE API
// Unavailable: order       — JNE is a carrier, not an OMS; no order management API documented
// Unavailable: warehouse   — no warehouse management API documented for JNE

interface JneAdapterConfig { sandbox?: boolean }
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class JneAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'jne'
  readonly version = '1'

  constructor(config: JneAdapterConfig = {}) {

    void config
  }

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
    const client = new JneClient(credentials)
    const raw = await client.get<JneTrackingResponse>(`tracking/${trackingNumber}`)
    return transformTracking({ ...raw, tracking_number: raw.tracking_number ?? trackingNumber })
  }

  async listTrackingEvents(credentials: Credentials, params: QueryParams): Promise<TrackingEvent[]> {
    const trackingNumber = String(params['trackingNumber'] ?? params['id'] ?? '')
    if (!trackingNumber) return []
    const client = new JneClient(credentials)
    const raw = await client.get<JneTrackingResponse>(`tracking/${trackingNumber}`)
    const events: JneTrackingEventRaw[] = raw.events ?? []
    const tn = raw.tracking_number ?? trackingNumber
    const sid = raw.shipment_id ?? undefined
    return events.map((evt) => transformTrackingEvent(evt, tn, sid))
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new JneClient(credentials)
    const raw = await client.post<JneShipmentRaw>('shipments', {
      reference: data.reference,
      service_code: data.serviceCode,
      sender: data.originAddress
        ? {
            name: data.originAddress.name,
            company: data.originAddress.company,
            street1: data.originAddress.street1,
            street2: data.originAddress.street2,
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
            street1: data.destinationAddress.street1,
            street2: data.destinationAddress.street2,
            city: data.destinationAddress.city,
            state: data.destinationAddress.state,
            postal_code: data.destinationAddress.postalCode,
            country: data.destinationAddress.country,
            phone: data.destinationAddress.phone,
            email: data.destinationAddress.email,
          }
        : undefined,
      weight: data.totalWeight
        ? { value: data.totalWeight.value, unit: data.totalWeight.unit }
        : undefined,
    })
    return transformShipment(raw)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new JneClient(credentials)
    const pkg = params.packages[0]
    const res = await client.post<{ rates?: JneRateRaw[] }>('rates', {
      origin: {
        city: params.originAddress.city,
        postal_code: params.originAddress.postalCode,
        country: params.originAddress.country,
      },
      destination: {
        city: params.destinationAddress.city,
        postal_code: params.destinationAddress.postalCode,
        country: params.destinationAddress.country,
      },
      weight: pkg?.weight?.value,
      weight_unit: pkg?.weight?.unit ?? 'kg',
    })
    const list = res.rates ?? []
    return list.map(transformRate)
  }
}
