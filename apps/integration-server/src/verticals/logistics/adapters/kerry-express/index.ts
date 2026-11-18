import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Order } from '../../schema/order'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { KerryExpressClient } from './client'

import { transformTracking, type KerryExpressTrackingResponse } from './transform/tracking'
import { transformShipment, type KerryExpressShipment } from './transform/shipment'
import { transformRate, type KerryExpressRate } from './transform/rate'
import { transformOrder } from './transform/order'

// ── Resource coverage ──────────────────────────────────────────────────────
// Unavailable: carrier   — Kerry Express is a single-carrier network; no carrier-listing endpoint exists
// Unverified:  label     — API portal (api.kerryexpress.com/v2) is inaccessible; Smart-EDI docs require auth; no public JSON label record endpoint confirmed
// Unverified:  manifest  — API portal inaccessible; no manifest endpoint confirmed in any accessible documentation
// Unverified:  warehouse — API portal inaccessible; no warehouse endpoint confirmed in any accessible documentation

interface KerryExpressAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class KerryExpressAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'kerry-express'
  readonly version = '1'

  constructor(_config: KerryExpressAdapterConfig = {}) {}

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
    const client = new KerryExpressClient(credentials)
    const raw = await client.get<KerryExpressTrackingResponse>(`tracking/${trackingNumber}`)
    return transformTracking(raw)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new KerryExpressClient(credentials)
    const raw = await client.post<KerryExpressShipment>('shipments', {
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
      weight_unit: data.totalWeight?.unit ?? 'kg',
      service_code: data.serviceCode,
      reference: data.reference,
    })
    return transformShipment(raw)
  }

  // ── Orders ─────────────────────────────────────────────────────────────────
  // Derived from shipment creation (POST /shipments). Kerry Express has no
  // dedicated order-listing endpoint; orders are managed by shipment_id.

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new KerryExpressClient(credentials)
    const raw = await client.post<KerryExpressShipment>('shipments', {
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
      reference: data.orderNumber,
      service_code: data.requestedServiceCode,
    })
    return transformOrder(raw)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new KerryExpressClient(credentials)
    const res = await client.post<{ rates: KerryExpressRate[] }>('rates', {
      origin: {
        postal_code: params.originAddress.postalCode,
        city: params.originAddress.city,
        state: params.originAddress.state,
        country: params.originAddress.country,
      },
      destination: {
        postal_code: params.destinationAddress.postalCode,
        city: params.destinationAddress.city,
        state: params.destinationAddress.state,
        country: params.destinationAddress.country,
      },
      packages: params.packages.map((pkg) => ({
        weight: pkg.weight?.value,
        weight_unit: pkg.weight?.unit ?? 'kg',
      })),
    })
    return (res.rates ?? []).map(transformRate)
  }
}
