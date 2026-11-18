import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  RateRequestParams,
  QueryParams,
} from '../../adapter/interface'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Carrier } from '../../schema/carrier'
import type { Shipment } from '../../schema/shipment'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { SaiaClient } from './client'

import { transformTracking, type SaiaTrackingResponse } from './transform/tracking'
import { transformRate, type SaiaRate } from './transform/rate'
import { getSaiaCarrier } from './transform/carrier'
import { transformShipment, type SaiaBolShipment } from './transform/shipment'

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: label     — SAIA is LTL; BOL documents are freight records, not parcel labels; no dedicated label endpoint
// Unavailable: manifest  — SAIA has no manifest/end-of-day close-out endpoint in its public API
// Unavailable: order     — SAIA has no order management endpoints
// Unavailable: warehouse — SAIA has no warehouse management endpoints
// Derived:     carrier   — SAIA is itself a single LTL carrier (SCAC: SAIA); no listing endpoint exists

interface SaiaAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class SaiaAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'saia'
  readonly version = '1'

  constructor(_config: SaiaAdapterConfig = {}) {}

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

  // ── Carriers ───────────────────────────────────────────────────────────────
  // SAIA is itself a single LTL carrier. No listing endpoint exists;
  // we derive a static record from the well-known platform identity (SCAC: SAIA).

  async listCarriers(_credentials: Credentials, _params: QueryParams): Promise<Carrier[]> {
    return [getSaiaCarrier()]
  }

  async getCarrier(_credentials: Credentials, id: string): Promise<Carrier> {
    const carrier = getSaiaCarrier()
    if (id !== carrier.id) {
      throw new Error(`Saia: carrier ${id} not found`)
    }
    return carrier
  }

  // ── Shipments ──────────────────────────────────────────────────────────────
  // A SAIA BOL (Bill of Lading) is the canonical LTL shipment record.
  // The BOL API response includes ProNumber (tracking), shipper/consignee
  // addresses, and a PDF label URL.

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new SaiaClient(credentials)
    const raw = await client.post<SaiaBolShipment>('bol', {
      ShipmentDate: data.createdAt?.toISOString().slice(0, 10),
      BillingTerms: 'PP',
      Shipper: data.originAddress
        ? {
            ContactName: data.originAddress.name,
            Address1: data.originAddress.street1,
            Address2: data.originAddress.street2,
            City: data.originAddress.city,
            State: data.originAddress.state,
            Zipcode: data.originAddress.postalCode,
          }
        : undefined,
      Consignee: data.destinationAddress
        ? {
            ContactName: data.destinationAddress.name,
            Address1: data.destinationAddress.street1,
            Address2: data.destinationAddress.street2,
            City: data.destinationAddress.city,
            State: data.destinationAddress.state,
            Zipcode: data.destinationAddress.postalCode,
          }
        : undefined,
      ServiceLevel: data.serviceCode,
      BLNumber: data.reference,
    })
    return transformShipment(raw)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, proNumber: string): Promise<TrackingEvent[]> {
    const client = new SaiaClient(credentials)
    const raw = await client.get<SaiaTrackingResponse>(`tracking/${proNumber}`)
    return transformTracking(raw)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new SaiaClient(credentials)
    const res = await client.post<{ quotes: SaiaRate[] }>('rating/quotes', {
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
      items: params.packages.map((pkg) => ({
        weight: pkg.weight?.value,
        weight_unit: pkg.weight?.unit ?? 'lb',
      })),
    })
    return (res.quotes ?? []).map(transformRate)
  }
}
