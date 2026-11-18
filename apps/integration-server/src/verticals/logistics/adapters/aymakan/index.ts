// ── Resource coverage ──────────────────────────────────────────────
// Available:   shipment, trackingevent, label, warehouse
// Unavailable: carrier   — Aymakan is a single-carrier platform; no carrier list endpoint exists
// Unavailable: manifest  — no manifest concept or endpoint in Aymakan API v2
// Unavailable: order     — Aymakan manages shipments only, not orders
// Unavailable: rate      — no rate/quote endpoint in the Aymakan API (see getRates removal below)

import { pageLocally, simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Label } from '../../schema/label'
import type { Warehouse } from '../../schema/warehouse'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { AymakanClient } from './client'

import { transformTracking, type AymakanTrackingResponse } from './transform/tracking'
import { transformShipment, type AymakanShipmentRaw } from './transform/shipment'
import { transformLabel, type AymakanAwbLabelResponse } from './transform/label'
import { transformWarehouse, type AymakanDropoffLocationsResponse } from './transform/warehouse'

interface AymakanAdapterConfig { sandbox?: boolean }
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class AymakanAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'aymakan'
  readonly version = '1'

  constructor(config: AymakanAdapterConfig = {}) {

    void config
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
    const client = new AymakanClient(credentials)
    const raw = await client.get<AymakanTrackingResponse>(`tracking/${trackingNumber}`)
    return transformTracking({ ...raw, tracking_number: raw.tracking_number ?? trackingNumber })
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new AymakanClient(credentials)
    const raw = await client.post<AymakanShipmentRaw>('shipments', {
      reference: data.reference,
      service_code: data.serviceCode,
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
            state: data.destinationAddress.state,
            postal_code: data.destinationAddress.postalCode,
            country: data.destinationAddress.country,
            phone: data.destinationAddress.phone,
            email: data.destinationAddress.email,
          }
        : undefined,
      weight: data.totalWeight
        ? { value: data.totalWeight.value, unit: data.totalWeight.unit }
        : undefined,
    })
    return transformShipment(raw)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  async getLabel(credentials: Credentials, trackingNumber: string): Promise<Label> {
    const client = new AymakanClient(credentials)
    const raw = await client.get<AymakanAwbLabelResponse>(`shipping/awb/tracking/${trackingNumber}`)
    const data = raw.data ?? {}
    return transformLabel(data, trackingNumber)
  }

  // ── Warehouses (dropoff locations) ─────────────────────────────────────────

  // Not paginated: https://developer.aymakan.com.sa/docs/aymakan-v2/dropoff-locations
  // documents a bare GET ("This endpoint will return a list for AyMakan
  // Warehouses locations.") with no page/limit parameter and no next signal,
  // so one response is every location, paged locally to the caller's page.
  async listWarehouses(credentials: Credentials, params: QueryParams): Promise<Warehouse[]> {
    const client = new AymakanClient(credentials)
    const raw = await client.get<AymakanDropoffLocationsResponse>('dropoff_locations')
    const list = raw.data ?? []
    return pageLocally(list.map((loc) => transformWarehouse(loc)), params)
  }

  // --- Rates: NOT IMPLEMENTED, on purpose ---
  //
  // `getRates` used to POST to `rates`, a path invented rather than verified —
  // exactly the shape the metadata.ts entry above already flagged. Docs checked:
  //
  //   - https://github.com/aymakan/python-sdk (the vendor's own org) documents
  //     shipping, bulk shipping, reverse pickup, tracking, cancel, AWB label,
  //     pickup requests, addresses and webhooks. No rate/pricing/quote method.
  //   - https://github.com/aashahin/shipflow, a third-party unified MENA
  //     carrier SDK, carries an explicit feature matrix marking Aymakan's rate
  //     support "❌ Not supported" (Aramex, the other carrier it wraps, is ✅).
  //   - https://api.aymakan.com.sa/v2/documentation, the dashboard URL in
  //     constants.ts, is unreachable (Cloudflare 522) as of this check.
  //   - aymakan.com/price-calculator is a consumer marketing widget with no
  //     linked API or developer docs — not evidence of a merchant endpoint.
  //
  // Re-add only against a captured live response proving a rate endpoint
  // exists. No transform existed for this resource, so there is nothing to keep.
}
