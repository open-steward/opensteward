import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Carrier } from '../../schema/carrier'

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: manifest  — Spee-Dee does not expose a manifest API; only FTP manifesting via direct carrier contact
// Unavailable: order     — Spee-Dee is a carrier only; no order-management API exists
// Unavailable: warehouse — Spee-Dee has no warehouse/fulfillment-location resource in its API
// Unverified:  label     — api.speedeedelivery.com has no public docs; label endpoint path and shape unconfirmed
// Unverified:  rate      — api.speedeedelivery.com has no public docs; rate endpoint path and shape unconfirmed
// Derived:     carrier   — Spee-Dee is itself a single regional Midwest carrier; record is derived from known platform metadata

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { SpeeDeeClient } from './client'

import { transformTracking, type SpeeDeeTrackingResponse } from './transform/tracking'
import { transformShipment, type SpeeDeeShipmentResponse } from './transform/shipment'
import { transformCarrier } from './transform/carrier'

interface SpeeDeeAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class SpeeDeeAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'spee-dee'
  readonly version = '1'

  constructor(_config: SpeeDeeAdapterConfig = {}) {}

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
    const client = new SpeeDeeClient(credentials)
    const raw = await client.get<SpeeDeeTrackingResponse>(`tracking/${trackingNumber}`)
    return transformTracking(raw)
  }

  // ── Carriers ───────────────────────────────────────────────────────────────
  // Spee-Dee is a single regional carrier.  We derive the carrier record from
  // platform metadata rather than calling an API endpoint.

  async listCarriers(_credentials: Credentials, _params: QueryParams): Promise<Carrier[]> {
    return [transformCarrier()]
  }

  async getCarrier(_credentials: Credentials, _id: string): Promise<Carrier> {
    return transformCarrier()
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new SpeeDeeClient(credentials)
    const raw = await client.post<SpeeDeeShipmentResponse>('shipments', {
      origin: data.originAddress
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
      destination: data.destinationAddress
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
      packages: (data.packages ?? []).map((pkg) => ({
        weight: pkg.weight?.value ?? data.totalWeight?.value ?? 1,
        length: pkg.dimensions?.length,
        width: pkg.dimensions?.width,
        height: pkg.dimensions?.height,
      })),
      serviceCode: data.serviceCode,
      reference: data.reference,
    })
    return transformShipment(raw)
  }
}
