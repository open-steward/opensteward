import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { SicepatClient } from './client'

import { transformTracking, type SicepatTrackingResponse } from './transform/tracking'
import { transformShipment, type SicepatShipmentRaw } from './transform/shipment'

// ── Resource coverage ──────────────────────────────────────────────
// Available:   shipment, trackingevent, rate
// Unavailable: carrier    — SiCepat is a single Indonesian courier; no multi-carrier listing API exists
// Unavailable: label      — label URL is embedded in the shipment response (label_url field); no standalone label endpoint documented
// Unavailable: manifest   — no manifest management endpoint documented in the publicly accessible SiCepat API
// Unavailable: order      — SiCepat is a carrier, not an OMS; no order management API documented
// Unavailable: warehouse  — no warehouse management API documented for SiCepat

interface SicepatAdapterConfig { sandbox?: boolean }
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class SicepatAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'sicepat'
  readonly version = '1'

  constructor(config: SicepatAdapterConfig = {}) {

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
    const client = new SicepatClient(credentials)
    const raw = await client.get<SicepatTrackingResponse>(`tracking/${trackingNumber}`)
    return transformTracking({ ...raw, tracking_number: raw.tracking_number ?? trackingNumber })
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new SicepatClient(credentials)
    const raw = await client.post<SicepatShipmentRaw>('shipments', {
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
    const client = new SicepatClient(credentials)
    const pkg = params.packages[0]
    const res = await client.post<{ rates?: Array<Record<string, unknown>> }>('rates', {
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
    return list.map((r) => ({
      carrierId: 'sicepat',
      serviceCode: (r.service_code as string | undefined) ?? (r.code as string | undefined),
      serviceName: (r.service_name as string | undefined) ?? (r.name as string | undefined),
      currency: (r.currency as string | undefined) ?? 'USD',
      totalAmount: typeof r.total === 'number' ? r.total : typeof r.amount === 'number' ? r.amount : undefined,
      transitDays: typeof r.transit_days === 'number' ? r.transit_days : undefined,
      metadata: r as Record<string, unknown>,
    }))
  }
}
