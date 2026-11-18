import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Carrier } from '../../schema/carrier'
import type { Label } from '../../schema/label'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { KoreaPostClient } from './client'

import { transformTracking, type KoreaPostTrackingResponse } from './transform/tracking'
import { transformShipment, type KoreaPostShipmentRaw } from './transform/shipment'
import { buildStaticCarrier, transformCarrier, type KoreaPostCarrierRaw } from './transform/carrier'
import { transformLabel, type KoreaPostLabelRaw } from './transform/label'

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: manifest — Korea Post has no manifest API concept in its public or business portal.
// Unavailable: order    — Korea Post has no order management endpoint; it is a carrier, not an OMS.
// Unavailable: warehouse — Korea Post has no warehouse API; post offices are found via a separate
//                          XML-only "Post Office Finder" API unrelated to the logistics interface.
// Unavailable: rate     — no confirmable rate/quote endpoint; see getRates removal below.

interface KoreaPostAdapterConfig { sandbox?: boolean }
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class KoreaPostAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'korea-post'
  readonly version = '1'

  constructor(config: KoreaPostAdapterConfig = {}) {

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
    const client = new KoreaPostClient(credentials)
    const raw = await client.get<KoreaPostTrackingResponse>(`tracking/${trackingNumber}`)
    return transformTracking({ ...raw, tracking_number: raw.tracking_number ?? trackingNumber })
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new KoreaPostClient(credentials)
    const raw = await client.post<KoreaPostShipmentRaw>('shipments', {
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

  // ── Carriers ───────────────────────────────────────────────────────────────
  // Derived: Korea Post is itself the sole carrier. No /carriers REST endpoint exists.
  // Returns a static carrier record representing Korea Post.

  async listCarriers(_credentials: Credentials, _params: QueryParams): Promise<Carrier[]> {
    return [buildStaticCarrier()]
  }

  async getCarrier(credentials: Credentials, id: string): Promise<Carrier> {
    // Try to fetch carrier details from the business API; fall back to static record.
    const client = new KoreaPostClient(credentials)
    try {
      const raw = await client.get<KoreaPostCarrierRaw>(`carriers/${id}`)
      return transformCarrier(raw)
    } catch {
      return buildStaticCarrier()
    }
  }

  // ── Labels ─────────────────────────────────────────────────────────────────
  // Derived: labels are embedded in Korea Post shipment responses (label_url field).
  // There is no standalone /labels endpoint; we project from the shipment response.

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    const client = new KoreaPostClient(credentials)
    const raw = await client.post<KoreaPostLabelRaw>('shipments', {
      reference: data.shipmentId,
      service_code: data.serviceCode,
    })
    return transformLabel(raw)
  }

  // --- Rates: NOT IMPLEMENTED, on purpose ---
  //
  // `getRates` used to POST to `rates`, a path invented rather than verified.
  // Docs checked:
  //
  //   - https://biz.epost.go.kr, the contract-customer portal named in
  //     constants.ts, renders a client-side "계약고객시스템" (Contract
  //     Customer System) shell with no publicly reachable API reference;
  //     /openapi returns 403 without a business login.
  //   - No official or community SDK for this portal turned up on GitHub
  //     (code/repo search for "epost 운임" and "biz.epost.go.kr" both empty).
  //
  // The response shape can't be confirmed from public documentation, so the
  // method is removed rather than kept unverified. Re-add only against a
  // captured live response from a real business account proving the shape.
  // The transform (transform/rate.ts) and its test are kept: they are a
  // reasonable inferred shape and cost nothing, and are ready to wire back in
  // if `getRates` is re-added.
}
