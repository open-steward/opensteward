// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: carrier   — Fetchr is itself the single carrier; no carrier-management API endpoint is documented
// Unverified:  rate      — docs.fetchr.us is unreachable; no rate-quote endpoint found in any public source
// Unverified:  manifest  — docs.fetchr.us is unreachable; no manifest endpoint found in any public source
// Unverified:  warehouse — docs.fetchr.us is unreachable; no warehouse endpoint found in any public source

import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Order } from '../../schema/order'
import type { Label } from '../../schema/label'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { FetchrClient } from './client'

import { transformTracking, type FetchrTracking } from './transform/tracking'
import { transformShipment, type FetchrShipment } from './transform/shipment'
import { transformOrder } from './transform/order'
import { transformLabel } from './transform/label'

interface FetchrAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class FetchrAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'fetchr'
  readonly version = '1'

  constructor(_config: FetchrAdapterConfig = {}) {}

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
    const client = new FetchrClient(credentials)
    const raw = await client.get<FetchrTracking>(`orders/${trackingNumber}/tracking`)
    return transformTracking(raw, trackingNumber)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new FetchrClient(credentials)
    const raw = await client.post<FetchrShipment>('orders', {
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

  // ── Orders ─────────────────────────────────────────────────────────────────
  // Derived: Fetchr's "order" is the same object as a shipment (POST /orders).

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new FetchrClient(credentials)
    const raw = await client.post<FetchrShipment>('orders', {
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
      service_code: data.requestedServiceCode,
      reference: data.orderNumber,
    })
    return transformOrder(raw)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────
  // Derived: label data (label_url, tracking ID) is embedded in the POST /orders
  // response.  createLabel issues a new order and extracts the label fields.

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    const client = new FetchrClient(credentials)
    const raw = await client.post<FetchrShipment>('orders', {
      service_code: data.serviceCode,
    })
    return transformLabel(raw)
  }
}
