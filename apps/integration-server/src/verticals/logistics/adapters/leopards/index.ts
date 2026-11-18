import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Label } from '../../schema/label'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { LeopardsClient } from './client'

import { transformTracking, type LeopardsTrackingResponse } from './transform/tracking'
import { transformShipment, type LeopardsShipmentRaw } from './transform/shipment'
import { transformLabel, type LeopardsLabelRaw } from './transform/label'

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: carrier    — Leopards Courier is itself the sole carrier; the official API has no /carriers endpoint
// Unavailable: manifest   — No manifest endpoint exists in the official Leopards API (bookPacket/trackBookedPacket/cancelBookedPackets/getAllCities only)
// Unavailable: order      — No order management endpoint; Leopards is a pure shipment-booking API
// Unavailable: warehouse  — No warehouse endpoint exists in the official Leopards API
// Unavailable: rate       — no rate/quote endpoint in the Leopards API (see getRates removal below)

interface LeopardsAdapterConfig { sandbox?: boolean }
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class LeopardsAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'leopards'
  readonly version = '1'

  constructor(config: LeopardsAdapterConfig = {}) {

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
    const client = new LeopardsClient(credentials)
    const raw = await client.get<LeopardsTrackingResponse>(`tracking/${trackingNumber}`)
    return transformTracking({ ...raw, tracking_number: raw.tracking_number ?? trackingNumber })
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new LeopardsClient(credentials)
    const raw = await client.post<LeopardsShipmentRaw>('shipments', {
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
  // Labels are derived from the bookPacket response (label_url field).
  // No dedicated label list/get/void endpoint exists in the Leopards API.

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    const client = new LeopardsClient(credentials)
    const raw = await client.post<LeopardsLabelRaw>('bookPacket/format/json', {
      reference: data.shipmentId,
      service_code: data.serviceCode,
    })
    return transformLabel(raw)
  }

  // --- Rates: NOT IMPLEMENTED, on purpose ---
  //
  // `getRates` used to POST to `rates`, a path invented rather than verified —
  // exactly what the metadata.ts entry above already flagged as UNVERIFIED.
  // Docs checked:
  //
  //   - https://github.com/developifynet/leopardscod-php, a community PHP
  //     wrapper hitting the real Leopards merchant API — the same
  //     `merchantapistaging.leopardscourier.com/api/` base this adapter's
  //     LEOPARDS_API_BASE uses. Its client only calls `getAllCities/format/
  //     json/`, `bookPacket/format/json/` and `trackBookedPacket/format/
  //     json/`. No rate/price endpoint.
  //   - https://www.leopardscourier.com/api and /business-solutions/
  //     api-integration both 404 — no public developer portal to check further.
  //
  // Re-add only against a captured live response proving a rate endpoint
  // exists. No transform existed for this resource, so there is nothing to keep.
}
