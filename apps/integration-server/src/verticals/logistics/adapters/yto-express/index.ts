import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { YtoExpressClient } from './client'

import { transformTracking, type YtoExpressTrackingResponse } from './transform/tracking'
import { transformShipment, type YtoExpressOrder } from './transform/shipment'

// ── Resource coverage ──────────────────────────────────────────────
// Unverified: carrier   — open.yto.net.cn developer portal requires authenticated account; no publicly documented carrier-listing endpoint found
// Unverified: label     — open.yto.net.cn behind login; label_url is a field on the order response, but a standalone /labels endpoint with list/get/void operations is unconfirmed
// Unverified: manifest  — open.yto.net.cn behind login; no publicly documented manifest or end-of-day consolidation endpoint found
// Unverified: order     — open.yto.net.cn behind login; POST orders is the shipment-creation endpoint — a fulfillment-order listing endpoint is unconfirmed
// Unverified: rate      — open.yto.net.cn behind login; no publicly accessible rate-query endpoint URL or field names confirmed
// Unverified: warehouse — open.yto.net.cn behind login; no publicly documented warehouse management endpoint found

interface YtoExpressAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class YtoExpressAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'yto-express'
  readonly version = '1'

  constructor(_config: YtoExpressAdapterConfig = {}) {}

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
    const client = new YtoExpressClient(credentials)
    const raw = await client.get<YtoExpressTrackingResponse>(`tracking/${trackingNumber}`)
    return transformTracking(raw)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new YtoExpressClient(credentials)
    const raw = await client.post<YtoExpressOrder>('orders', {
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
