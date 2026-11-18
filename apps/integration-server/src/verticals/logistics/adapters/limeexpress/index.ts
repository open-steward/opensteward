// ── Resource coverage ──────────────────────────────────────────────
// Unverified: carrier   — API docs behind authentication; api.limeexpress.com not publicly reachable
// Unverified: label     — API docs behind authentication; api.limeexpress.com not publicly reachable
// Unverified: manifest  — API docs behind authentication; api.limeexpress.com not publicly reachable
// Unverified: order     — API docs behind authentication; api.limeexpress.com not publicly reachable
// Unverified: rate      — API docs behind authentication; api.limeexpress.com not publicly reachable
// Unverified: warehouse — API docs behind authentication; api.limeexpress.com not publicly reachable

import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { LimeExpressClient } from './client'

import { transformTracking, type LimeExpressTracking } from './transform/tracking'
import { transformShipment, type LimeExpressShipment } from './transform/shipment'

interface LimeExpressAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class LimeExpressAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'limeexpress'
  readonly version = '1'

  constructor(_config: LimeExpressAdapterConfig = {}) {}

  // -- Auth -----------------------------------------------------------------

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // -- Tracking Events ------------------------------------------------------

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new LimeExpressClient(credentials)
    const raw = await client.get<LimeExpressTracking>(`tracking/${trackingNumber}`)
    return transformTracking(raw, trackingNumber)
  }

  // -- Shipments ------------------------------------------------------------

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new LimeExpressClient(credentials)
    const raw = await client.post<LimeExpressShipment>('shipments', {
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
