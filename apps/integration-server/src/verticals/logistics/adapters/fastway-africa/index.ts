// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: carrier   — Fastway Africa is a single-carrier platform; no carrier listing endpoint exists
// Unavailable: order     — No order concept in the API; consignments are embedded in the FastLabel workflow
// Unavailable: warehouse — No warehouse concept or endpoint in the Fastway Africa API
// Unverified:  manifest  — FastLabel manifest endpoints are documented for v2/v3 (api.fastway.org) but the v4 SA-specific API (api.fastway.co.za/v4/) paths are not publicly documented
// Unverified:  rate      — PSC lookup is documented for v2 but v4 SA-specific paths are undocumented

import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Label } from '../../schema/label'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { FastwayAfricaClient } from './client'

import { transformTracking, type FastwayAfricaTracking } from './transform/tracking'
import { transformShipment, type FastwayAfricaShipment } from './transform/shipment'
import { transformLabel } from './transform/label'

interface FastwayAfricaAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class FastwayAfricaAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'fastway-africa'
  readonly version = '1'

  constructor(_config: FastwayAfricaAdapterConfig = {}) {}

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
    const client = new FastwayAfricaClient(credentials)
    const raw = await client.get<FastwayAfricaTracking>(`tracktrace/${trackingNumber}`)
    return transformTracking(raw, trackingNumber)
  }

  // -- Shipments ------------------------------------------------------------

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new FastwayAfricaClient(credentials)
    const raw = await client.post<FastwayAfricaShipment>('shipments', {
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

  // -- Labels ---------------------------------------------------------------
  // Label is derived: Fastway Africa returns a label_url on the shipment
  // response.  createLabel creates a shipment and extracts the label fields.

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    const client = new FastwayAfricaClient(credentials)
    const raw = await client.post<FastwayAfricaShipment>('shipments', {
      weight: undefined,
      weight_unit: 'kg',
      service_code: data.serviceCode,
    })
    return transformLabel(raw)
  }
}
