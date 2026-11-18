// ── Resource coverage ──────────────────────────────────────────────────────
// Unverified: carrier  — api.chronopost.fr has no documented carrier-list endpoint; only SOAP (ws.chronopost.fr) is public and has no carrier enumeration
// Unverified: label    — label_url is embedded in shipment creation; no dedicated REST label-list/get endpoint is publicly documented for api.chronopost.fr
// Unverified: manifest — no manifest/bordereau endpoint exists in any publicly documented Chronopost SOAP or REST API
// Unverified: order    — Chronopost is a shipping carrier only; no order management endpoint is documented in any public API
// Unverified: rate     — rate quoting exists via SOAP (quickcost-cxf) but no REST rate endpoint is documented for api.chronopost.fr
// Unverified: warehouse — PointRelais SOAP service lists customer pickup points only; no warehouse/fulfillment-center endpoint exists

import type {
  LogisticsAdapter,
  Credentials,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { ChronopostClient } from './client'

import { transformTracking, type ChronopostTracking } from './transform/tracking'
import { transformShipment, type ChronopostShipment } from './transform/shipment'

interface ChronopostAdapterConfig {
  sandbox?: boolean
}

export class ChronopostAdapter implements LogisticsAdapter {
  readonly platform = 'chronopost'
  readonly version = '1'

  constructor(_config: ChronopostAdapterConfig = {}) {}

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // For Chronopost the "code" is the "accountNumber:password" pair.
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new ChronopostClient(credentials)
    const raw = await client.get<ChronopostTracking>('trackSkybill', {
      skybillNumber: trackingNumber,
    })
    return transformTracking(raw, trackingNumber)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new ChronopostClient(credentials)
    const raw = await client.post<ChronopostShipment>('shipping/generateSkybill', {
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
