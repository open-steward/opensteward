import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Order } from '../../schema/order'
import type { Label } from '../../schema/label'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { BostaClient } from './client'

import { transformTracking, type BostaTrackingResponse } from './transform/tracking'
import { transformShipment, type BostaShipmentRaw } from './transform/shipment'
import { transformOrder, type BostaDeliveryRaw, type BostaDeliveryListRaw } from './transform/order'
import { transformLabel, type BostaAWBRaw, type BostaAWBResponse } from './transform/label'

// ── Resource coverage ──────────────────────────────────────────────
// Available:   shipment, trackingevent, order, label
// Unavailable: carrier   — Bosta is a single carrier; no carrier listing endpoint exists
// Unavailable: manifest  — No manifest/bulk-shipment-close endpoint in the Bosta API
// Unavailable: warehouse — No warehouse concept; pickup-locations are scheduling-only
// Unavailable: rate      — no rate/quote endpoint in the Bosta API (see getRates removal below)

interface BostaAdapterConfig { sandbox?: boolean }
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class BostaAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'bosta'
  readonly version = '1'

  constructor(config: BostaAdapterConfig = {}) {

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
    const client = new BostaClient(credentials)
    const raw = await client.get<BostaTrackingResponse>(`tracking/${trackingNumber}`)
    return transformTracking({ ...raw, tracking_number: raw.tracking_number ?? trackingNumber })
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new BostaClient(credentials)
    const raw = await client.post<BostaShipmentRaw>('shipments', {
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

  // ── Orders ─────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, _params: QueryParams): Promise<Order[]> {
    const client = new BostaClient(credentials)
    const res = await client.get<BostaDeliveryListRaw>('deliveries')
    const deliveries = res.data?.deliveries ?? []
    return deliveries.map((d) => transformOrder(d))
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new BostaClient(credentials)
    const res = await client.get<{ data?: BostaDeliveryRaw; success?: boolean }>(`deliveries/${id}`)
    const raw: BostaDeliveryRaw = res.data ?? (res as unknown as BostaDeliveryRaw)
    return transformOrder(raw)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new BostaClient(credentials)
    const res = await client.get<BostaAWBResponse>(`deliveries/awb/${id}`)
    const raw: BostaAWBRaw = res.data ?? (res as unknown as BostaAWBRaw)
    return transformLabel(id, raw)
  }

  // --- Rates: NOT IMPLEMENTED, on purpose ---
  //
  // `getRates` used to POST to `rates`, a path invented rather than verified —
  // exactly what the metadata.ts entry above already flagged as UNVERIFIED.
  // Docs checked:
  //
  //   - https://docs.bosta.co — the site's own sitemap.xml lists every
  //     published page; the only API reference page in it is `get-delivery`.
  //     No pricing/rate/quote page exists anywhere in the docs.
  //   - https://github.com/bostaapp/bosta-nodejs, the official Node SDK
  //     (org `bostaapp`), only wraps `cities`, `deliveries`, `pickups`,
  //     `zones`. The `deliveries` module exposes createDelivery,
  //     getAllDeliveries, getDeliveryByTrakingNumber, trackDelivery,
  //     printDeliveryAWB, updateDelivery, terminateDelivery — no rate call.
  //
  // Re-add only against a captured live response proving a rate endpoint
  // exists. No transform existed for this resource, so there is nothing to keep.
}
