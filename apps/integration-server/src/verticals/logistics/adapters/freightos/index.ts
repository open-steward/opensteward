// ── Resource coverage ──────────────────────────────────────────────
// Available:   rate, shipment, trackingevent
// Unavailable: carrier — Freightos is a freight marketplace with no /carriers endpoint
// Unavailable: label   — Freightos is an international freight marketplace; label generation is handled by individual carriers/forwarders
// Unavailable: manifest — Manifest submission is a carrier-side concept; no manifest endpoints exist in the Freightos API
// Unavailable: order    — Freightos is not an OMS; no order management endpoints exist in the public API
// Unavailable: warehouse — Freightos is not a WMS; no warehouse endpoints exist in the public API

import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  RateRequestParams,
  QueryParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { FreightosClient } from './client'

import { transformTracking, type FreightosTrackingResponse } from './transform/tracking'
import { transformShipment, type FreightosShipment } from './transform/shipment'
import { transformRate, type FreightosRate } from './transform/rate'

interface FreightosAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class FreightosAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'freightos'
  readonly version = '1'

  constructor(_config: FreightosAdapterConfig = {}) {}

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
    const client = new FreightosClient(credentials)
    const raw = await client.get<FreightosTrackingResponse>(`shipments/${trackingNumber}/tracking`)
    return transformTracking(raw)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new FreightosClient(credentials)
    const raw = await client.get<{ shipments: FreightosShipment[] }>('shipments', params as Record<string, unknown>)
    return (raw.shipments ?? []).map(transformShipment)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new FreightosClient(credentials)
    const raw = await client.post<FreightosShipment>('bookings', {
      origin: data.originAddress
        ? {
            name: data.originAddress.name,
            company: data.originAddress.company,
            address1: data.originAddress.street1,
            address2: data.originAddress.street2,
            city: data.originAddress.city,
            state: data.originAddress.state,
            postal_code: data.originAddress.postalCode,
            country: data.originAddress.country,
            phone: data.originAddress.phone,
            email: data.originAddress.email,
          }
        : undefined,
      destination: data.destinationAddress
        ? {
            name: data.destinationAddress.name,
            company: data.destinationAddress.company,
            address1: data.destinationAddress.street1,
            address2: data.destinationAddress.street2,
            city: data.destinationAddress.city,
            state: data.destinationAddress.state,
            postal_code: data.destinationAddress.postalCode,
            country: data.destinationAddress.country,
            phone: data.destinationAddress.phone,
            email: data.destinationAddress.email,
          }
        : undefined,
      weight: data.totalWeight?.value,
      weight_unit: data.totalWeight?.unit ?? 'kg',
      service_code: data.serviceCode,
      reference: data.reference,
    })
    return transformShipment(raw)
  }

  // ── Rates ─────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new FreightosClient(credentials)
    const raw = await client.post<{ quotes: FreightosRate[] }>('quotes', {
      origin: params.originAddress,
      destination: params.destinationAddress,
      packages: params.packages,
      service_codes: params.serviceCodes,
    })
    return (raw.quotes ?? []).map(transformRate)
  }
}
