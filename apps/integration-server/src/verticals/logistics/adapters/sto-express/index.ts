import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { StoExpressClient } from './client'

import { transformTracking, type StoExpressTrackingResponse } from './transform/tracking'
import { transformShipment, type StoExpressOrder } from './transform/shipment'

// ── Resource coverage ──────────────────────────────────────────────
// Unverified: carrier   — STO Express open platform (open.sto.cn) requires authenticated login; no publicly documented carrier-listing endpoint found
// Unverified: label     — open.sto.cn behind login; waybill printing referenced in third-party sources but standalone label endpoint fields unconfirmed
// Unverified: manifest  — open.sto.cn behind login; no publicly documented manifest or end-of-day consolidation endpoint found
// Unverified: order     — open.sto.cn behind login; no fulfillment-order listing endpoint found (orders POST is shipping-order creation, not a fulfillment-order resource)
// Unverified: rate      — open.sto.cn behind login; stc.network.serviceability.check mentioned in third-party sources but URL/fields unconfirmed
// Unverified: warehouse — open.sto.cn behind login; no publicly documented warehouse management endpoint found

interface StoExpressAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class StoExpressAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'sto-express'
  readonly version = '1'

  constructor(_config: StoExpressAdapterConfig = {}) {}

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
    const client = new StoExpressClient(credentials)
    const raw = await client.get<StoExpressTrackingResponse>(`tracking/${trackingNumber}`)
    return transformTracking(raw)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new StoExpressClient(credentials)
    const raw = await client.post<StoExpressOrder>('orders', {
      sender: data.originAddress
        ? {
            name: data.originAddress.name,
            company: data.originAddress.company,
            address_line1: data.originAddress.street1,
            address_line2: data.originAddress.street2,
            city: data.originAddress.city,
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
}
