import { customForm, pageLocally } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Label } from '../../schema/label'
import type { Manifest } from '../../schema/manifest'
import type { Warehouse } from '../../schema/warehouse'

import { exchangeCredentials, refreshCredentials as doRefresh } from './auth'
import { VenipakClient } from './client'
import {
  ENDPOINT_SEND_SHIPMENT,
  ENDPOINT_TRACKING,
  ENDPOINT_PRINT_LABEL,
  ENDPOINT_PRINT_LIST,
  ENDPOINT_PICKUP_POINTS,
  TRACKING_TYPE_ALL,
  DEFAULT_PAGE_SIZE,
} from './constants'

import {
  transformShipment,
  buildShipmentXml,
  type VenipakShipment,
} from './transform/shipment'
import { transformTrackingEvents, type VenipakTrackingResponse } from './transform/tracking'
import { transformLabel, type VenipakLabelResponse } from './transform/label'
import { transformManifest, type VenipakManifestResponse } from './transform/manifest'
import { transformWarehouse, type VenipakPickupPoint } from './transform/warehouse'

// ── Resource coverage ──────────────────────────────────────────────────────────
// Unavailable: carrier   — Venipak is itself the single carrier; no carrier-list endpoint exists in the API
// Unavailable: order     — Venipak has no order management concept or endpoint; API is shipment/label only
// Unavailable: rate      — ws/get_route returns delivery zone routing, not price quotes; no pricing endpoint
// ──────────────────────────────────────────────────────────────────────────────

// Venipak uses username + password — two credential fields.
const CREDENTIAL_FORM = customForm({
  fields: [
    {
      name: 'username',
      label: 'Venipak username',
      type: 'text',
      required: true,
      placeholder: 'your@venipak.username',
      helpText: 'Provided by Venipak on contract signing.',
    },
    {
      name: 'password',
      label: 'Venipak password',
      type: 'password',
      required: true,
      helpText: 'API password assigned by Venipak.',
    },
  ],
  exchange: exchangeCredentials,
})

/**
 * VenipakAdapter — LogisticsAdapter implementation for Venipak
 * (https://venipak.com).
 *
 * Venipak is a Baltic-region parcel carrier operating in Lithuania, Latvia,
 * Estonia, Poland, and Finland. The API is XML-over-HTTP with Basic auth
 * (user/pass POST params).
 *
 * Supported operations:
 *   - createShipment  — POST XML to import/send.php
 *   - getShipment     — GET from ws/tracking (by tracking number)
 *   - getTrackingEvents / listTrackingEvents — ws/tracking
 *   - getLabel / createLabel — ws/print_label
 */
export class VenipakAdapter implements LogisticsAdapter {
  readonly platform = 'venipak'
  readonly version = '1'

  // Connect Link credential form
  credentialFields = CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // No OAuth redirect — return a placeholder so the interface is satisfied.
    return 'https://venipak.com'
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // Not used — credential form flow via exchangeCredentials above.
    return { accessToken: code }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new VenipakClient(credentials)
    // Venipak has no bulk shipment list endpoint; use tracking with a cursor
    // from params.cursor if available, else return an empty list with a note.
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 100)
    const trackingCode = typeof params['cursor'] === 'string' ? params['cursor'] : undefined
    if (!trackingCode) return []

    const raw = await client.get<VenipakTrackingResponse | VenipakTrackingResponse[]>(
      ENDPOINT_TRACKING,
      {
        code: trackingCode,
        type: TRACKING_TYPE_ALL,
        limit,
      },
    )
    const items = Array.isArray(raw) ? raw : [raw]
    return items.map((item) => {
      const shipment: VenipakShipment = {
        tracking_no: item.tracking_no ?? item.pack_no,
        status: item.status,
        created_at: item.event_time,
      }
      return transformShipment(shipment)
    })
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new VenipakClient(credentials)
    const raw = await client.get<VenipakTrackingResponse>(ENDPOINT_TRACKING, {
      code: id,
      type: TRACKING_TYPE_ALL,
    })
    const shipment: VenipakShipment = {
      id,
      tracking_no: raw.tracking_no ?? raw.pack_no ?? id,
      status: raw.status,
      created_at: raw.event_time,
    }
    return transformShipment(shipment)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new VenipakClient(credentials)
    const xml = buildShipmentXml(data)
    const response = await client.postXml<VenipakShipment | { shipment: VenipakShipment }>(
      ENDPOINT_SEND_SHIPMENT,
      xml,
    )
    // Response may be nested under a `shipment` key depending on Venipak version
    const raw = (response as { shipment?: VenipakShipment }).shipment ?? (response as VenipakShipment)
    return transformShipment({
      ...raw,
      reference: data.reference,
      consignee: data.destinationAddress
        ? {
            name: data.destinationAddress.name,
            company_name: data.destinationAddress.company,
            address: data.destinationAddress.street1,
            city: data.destinationAddress.city,
            postcode: data.destinationAddress.postalCode,
            country: data.destinationAddress.country,
            phone: data.destinationAddress.phone,
            email: data.destinationAddress.email,
          }
        : undefined,
      sender: data.originAddress
        ? {
            name: data.originAddress.name,
            company_name: data.originAddress.company,
            address: data.originAddress.street1,
            city: data.originAddress.city,
            postcode: data.originAddress.postalCode,
            country: data.originAddress.country,
            phone: data.originAddress.phone,
          }
        : undefined,
    })
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new VenipakClient(credentials)
    const raw = await client.get<VenipakTrackingResponse>(ENDPOINT_TRACKING, {
      code: trackingNumber,
      type: TRACKING_TYPE_ALL,
    })
    return transformTrackingEvents(raw)
  }

  async listTrackingEvents(credentials: Credentials, params: QueryParams): Promise<TrackingEvent[]> {
    const cursor = typeof params['cursor'] === 'string' ? params['cursor'] : undefined
    if (!cursor) return []
    return this.getTrackingEvents(credentials, cursor)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new VenipakClient(credentials)
    const raw = await client.postForm<VenipakLabelResponse>(ENDPOINT_PRINT_LABEL, {
      format: 'a4',
      'pack_no[]': id,
    })
    return transformLabel(raw, id)
  }

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    if (!data.trackingNumber && !data.shipmentId) {
      throw new Error('trackingNumber or shipmentId is required to generate a Venipak label.')
    }
    const packNo = data.trackingNumber ?? data.shipmentId ?? ''
    const client = new VenipakClient(credentials)
    const raw = await client.postForm<VenipakLabelResponse>(ENDPOINT_PRINT_LABEL, {
      format: 'a4',
      'pack_no[]': packNo,
    })
    return transformLabel(raw, data.shipmentId)
  }

  // ── Manifests ──────────────────────────────────────────────────────────────
  // ws/print_list — POST with `code` (manifest_id) returns manifest metadata or PDF.

  async listManifests(_credentials: Credentials, _params: QueryParams): Promise<Manifest[]> {
    // Venipak has no manifest list endpoint; individual manifests are fetched by code.
    return []
  }

  async getManifest(credentials: Credentials, id: string): Promise<Manifest> {
    const client = new VenipakClient(credentials)
    const raw = await client.postForm<VenipakManifestResponse>(ENDPOINT_PRINT_LIST, {
      code: id,
    })
    return transformManifest(raw, id)
  }

  async createManifest(credentials: Credentials, data: Partial<Manifest>): Promise<Manifest> {
    // Manifests in Venipak are identified by the manifest_id sent in the XML during
    // shipment creation. Calling ws/print_list with that id retrieves/closes the manifest.
    const code = data.manifestNumber ?? data.id ?? ''
    const client = new VenipakClient(credentials)
    const raw = await client.postForm<VenipakManifestResponse>(ENDPOINT_PRINT_LIST, {
      code,
    })
    return transformManifest(raw, code || undefined)
  }

  // ── Warehouses (Pickup Points / Terminals) ─────────────────────────────────
  // ws/get_pickup_points — GET returns JSON array of Venipak terminals and lockers.
  // The endpoint takes filters only (country, postcode, city, pickup_enabled) and
  // returns every matching row with no page, offset or cursor, so the caller's
  // page is sliced locally from the whole collection.

  async listWarehouses(credentials: Credentials, params: QueryParams): Promise<Warehouse[]> {
    const client = new VenipakClient(credentials)
    const queryParams: Record<string, unknown> = {}
    if (typeof params['country'] === 'string') queryParams['country'] = params['country']
    if (typeof params['city'] === 'string') queryParams['city'] = params['city']
    const raw = await client.get<VenipakPickupPoint | VenipakPickupPoint[]>(
      ENDPOINT_PICKUP_POINTS,
      queryParams,
    )
    const items = Array.isArray(raw) ? raw : [raw]
    return pageLocally(items.map((item) => transformWarehouse(item)), params)
  }

  async getWarehouse(credentials: Credentials, id: string): Promise<Warehouse> {
    // Fetch all pickup points and find by id or code.
    const all = await this.listWarehouses(credentials, {})
    const found = all.find((w) => w.id === id || w.code === id)
    if (!found) throw new Error(`Venipak pickup point not found: ${id}`)
    return found
  }
}
