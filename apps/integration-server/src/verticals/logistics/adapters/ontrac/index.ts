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
// Unavailable: manifest  — EasyPost/OnTrac docs state manifests are not required by OnTrac
// Unavailable: order     — OnTrac is a carrier only; no order-management API exists
// Unavailable: warehouse — OnTrac has no warehouse/fulfillment-location resource in its API
// Unverified:  rate      — v2 REST API docs are private/gated; rate endpoint path and shape unconfirmed
// Unverified:  label     — v2 REST API docs are private/gated; label endpoint path and shape unconfirmed
// Derived:     carrier   — OnTrac is itself a single carrier; record is derived from known platform metadata

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { OnTracClient } from './client'

import { transformTracking, type OnTracTrackingResponse } from './transform/tracking'
import { transformShipment, type OnTracShipment } from './transform/shipment'
import { transformCarrier } from './transform/carrier'

interface OnTracAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class OnTracAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'ontrac'
  readonly version = '1'

  constructor(_config: OnTracAdapterConfig = {}) {}

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
    const client = new OnTracClient(credentials)
    const raw = await client.get<OnTracTrackingResponse>(`shipments/${trackingNumber}/tracking`)
    return transformTracking(raw)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new OnTracClient(credentials)
    const raw = await client.post<OnTracShipment>('shipments', {
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
          }
        : undefined,
      weight: data.totalWeight?.value,
      weight_unit: data.totalWeight?.unit ?? 'oz',
      service_code: data.serviceCode,
      reference: data.reference,
    })
    return transformShipment(raw)
  }

  // ── Carriers ───────────────────────────────────────────────────────────────
  // OnTrac is a single regional carrier.  We derive the carrier record from
  // platform metadata rather than calling an API endpoint.

  async listCarriers(_credentials: Credentials, _params: QueryParams): Promise<Carrier[]> {
    return [transformCarrier()]
  }

  async getCarrier(_credentials: Credentials, _id: string): Promise<Carrier> {
    return transformCarrier()
  }
}
