// ── Resource coverage ──────────────────────────────────────────────────────────
// Available:   rate, shipment, trackingevent
// Unavailable: carrier   — Ward REST API offers only rate-quote, pickup-request, and trace; no carrier endpoint.
// Unavailable: label     — Ward REST API offers only rate-quote, pickup-request, and trace; no label endpoint.
// Unavailable: manifest  — Ward REST API offers only rate-quote, pickup-request, and trace; no manifest endpoint.
// Unavailable: order     — Ward REST API offers only rate-quote, pickup-request, and trace; no order endpoint.
// Unavailable: warehouse — Ward REST API offers only rate-quote, pickup-request, and trace; no warehouse endpoint.

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
import { WardTruckingClient } from './client'

import { transformTracking, type WardTruckingTrackingResponse } from './transform/tracking'
import { transformShipment, type WardTruckingShipment } from './transform/shipment'
import { transformRate, type WardTruckingRate } from './transform/rate'

interface WardTruckingAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class WardTruckingAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'ward-trucking'
  readonly version = '1'

  constructor(_config: WardTruckingAdapterConfig = {}) {}

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
    const client = new WardTruckingClient(credentials)
    const raw = await client.get<WardTruckingTrackingResponse>(`tracking/${encodeURIComponent(trackingNumber)}`)
    return transformTracking(raw)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new WardTruckingClient(credentials)
    const raw = await client.post<WardTruckingShipment>('shipments', {
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
      reference: data.reference,
      service_code: data.serviceCode,
    })
    return transformShipment(raw)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new WardTruckingClient(credentials)
    const firstPkg = params.packages[0]
    const body = {
      from: {
        postal_code: params.originAddress.postalCode,
        country: params.originAddress.country,
      },
      to: {
        postal_code: params.destinationAddress.postalCode,
        country: params.destinationAddress.country,
      },
      weight: firstPkg?.weight?.value,
      weight_unit: firstPkg?.weight?.unit,
      length: firstPkg?.dimensions?.length,
      width: firstPkg?.dimensions?.width,
      height: firstPkg?.dimensions?.height,
      service_codes: params.serviceCodes,
    }
    const res = await client.post<{ rates: WardTruckingRate[] }>('rates', body)
    return (res.rates ?? []).map(transformRate)
  }
}
