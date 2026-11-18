// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: carrier    — Nationex is a single carrier; no /carriers listing endpoint exists in the API
// Unavailable: label      — /Shipments/{id}/labels returns a binary PDF/PNG blob, not structured JSON
// Unavailable: manifest   — /Customers/{id}/driverManifests returns a binary PDF blob, not structured JSON
// Unavailable: order      — no order concept exists in the Nationex API
// Unavailable: warehouse  — no warehouse concept exists in the Nationex API

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
import { NationexClient } from './client'

import { transformTracking, type NationexTrackingResponse } from './transform/tracking'
import { transformShipment, type NationexShipment } from './transform/shipment'
import { transformRate, type NationexRatesDetail } from './transform/rate'

interface NationexAdapterConfig {
  customerId?: string
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class NationexAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'nationex'
  readonly version = '1'

  private customerId: string

  constructor(config: NationexAdapterConfig = {}) {
    this.customerId = config.customerId ?? ''
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
    const client = new NationexClient(credentials)
    const raw = await client.get<NationexTrackingResponse>(
      `customers/${encodeURIComponent(this.customerId)}/parcels/${encodeURIComponent(trackingNumber)}/tracking`,
    )
    return transformTracking(raw)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new NationexClient(credentials)
    const raw = await client.post<NationexShipment>(
      `customers/${encodeURIComponent(this.customerId)}/shipments`,
      {
        shipper: data.originAddress
          ? {
              name: data.originAddress.name,
              company: data.originAddress.company,
              street1: data.originAddress.street1,
              street2: data.originAddress.street2,
              city: data.originAddress.city,
              state: data.originAddress.state,
              postalCode: data.originAddress.postalCode,
              country: data.originAddress.country,
              phone: data.originAddress.phone,
              email: data.originAddress.email,
            }
          : undefined,
        consignee: data.destinationAddress
          ? {
              name: data.destinationAddress.name,
              company: data.destinationAddress.company,
              street1: data.destinationAddress.street1,
              street2: data.destinationAddress.street2,
              city: data.destinationAddress.city,
              state: data.destinationAddress.state,
              postalCode: data.destinationAddress.postalCode,
              country: data.destinationAddress.country,
              phone: data.destinationAddress.phone,
              email: data.destinationAddress.email,
            }
          : undefined,
        totalWeight: data.totalWeight?.value,
        weightUnit: data.totalWeight?.unit,
        customerReference: data.reference,
        serviceType: data.serviceCode,
      },
    )
    return transformShipment(raw)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new NationexClient(credentials)
    const raw = await client.post<NationexRatesDetail>(
      `Customers/${encodeURIComponent(this.customerId)}/rates`,
      {
        CustomerId: this.customerId,
        SourcePostalCode: params.originAddress?.postalCode,
        DestinationPostalCode: params.destinationAddress?.postalCode,
        TotalParcels: params.packages?.length ?? 1,
        TotalWeight: params.packages?.reduce(
          (sum, p) => sum + (p.weight?.value ?? 0),
          0,
        ),
      },
    )
    return [transformRate(raw)]
  }
}
