// ── Resource coverage ──────────────────────────────────────────────────────
// Available:   shipment, trackingevent, label (derived from shipment response)
// Unavailable: carrier  — BRT is a single-carrier platform; no /carriers listing endpoint exists
// Unavailable: order    — BRT is a parcel/carrier API with no order-management concept
// Unavailable: warehouse — BRT's public API exposes no warehouse management endpoints
// Unverified:  rate     — developer portal (brt.it/developer) returned 403; no public rate endpoint confirmed
// Unverified:  manifest — developer portal returned 403; no public manifest endpoint confirmed

import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Label } from '../../schema/label'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { BrtClient } from './client'

import { transformTracking, type BrtTrackingResponse } from './transform/tracking'
import { transformShipment, type BrtShipment } from './transform/shipment'
import { transformLabel } from './transform/label'

interface BrtAdapterConfig {
  sandbox?: boolean
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class BrtAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'brt'
  readonly version = '1'

  constructor(_config: BrtAdapterConfig = {}) {}

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
    const client = new BrtClient(credentials)
    const raw = await client.get<BrtTrackingResponse>(`tracking/${trackingNumber}`)
    return transformTracking(raw)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new BrtClient(credentials)
    const raw = await client.post<BrtShipment>('shipments', {
      sender: data.originAddress
        ? {
            name: data.originAddress.name,
            company: data.originAddress.company,
            street1: data.originAddress.street1,
            street2: data.originAddress.street2,
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
            street1: data.destinationAddress.street1,
            street2: data.destinationAddress.street2,
            city: data.destinationAddress.city,
            postal_code: data.destinationAddress.postalCode,
            country: data.destinationAddress.country,
            phone: data.destinationAddress.phone,
            email: data.destinationAddress.email,
          }
        : undefined,
      weight: data.totalWeight
        ? { value: data.totalWeight.value, unit: data.totalWeight.unit }
        : undefined,
      reference: data.reference,
      service_code: data.serviceCode,
    })
    return transformShipment(raw)
  }

  // ── Labels (derived from shipment) ─────────────────────────────────────────
  // BRT has no dedicated /labels endpoint; label data is embedded in the
  // shipment response.  getLabel fetches a shipment by ID; createLabel
  // creates a shipment and extracts the embedded label.

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new BrtClient(credentials)
    const raw = await client.get<BrtShipment>(`shipments/${id}`)
    return transformLabel(raw)
  }

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    const client = new BrtClient(credentials)
    const raw = await client.post<BrtShipment>('shipments', {
      service_code: data.serviceCode,
    })
    return transformLabel(raw)
  }
}
