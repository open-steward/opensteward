import { pageLocally, simpleApiKey } from '@opensteward/shared'
import type { LogisticsAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Label } from '../../schema/label'
import type { Carrier } from '../../schema/carrier'

import { buildAuthUrl, exchangeApiPassword, refreshCredentials as doRefresh } from './auth'
import { PacketaClient } from './client'

import { transformShipment, parsePacketXml } from './transform/shipment'
import { parseTrackingXml } from './transform/tracking'
import { parseLabelXml } from './transform/label'
import { transformCarrier, type PacketaCarrier } from './transform/carrier'

interface PacketaAdapterConfig {
  /** Label format to request when generating labels. Default: "A7 on A4" */
  labelFormat?: string
}

const SIMPLE_API_KEY_FORM = simpleApiKey()

// ── Resource coverage ──────────────────────────────────────────────────────────
// Unavailable: manifest  — Packeta API has no manifest creation or listing endpoint
// Unavailable: order     — Packeta API has no order management endpoint
// Unavailable: rate      — Packeta uses a fixed published tariff; no real-time rate quote API
// Unavailable: warehouse — Packeta API has no warehouse listing endpoint

/**
 * PacketaAdapter — OpenSteward LogisticsAdapter for Packeta (Zásilkovna).
 *
 * Packeta is a major Central/Eastern European parcel carrier operating its own
 * pickup-point network across 30+ countries. Their API uses a SOAP-style XML
 * protocol over HTTPS (POST to a single REST endpoint).
 *
 * Auth: API password (stored as accessToken). No OAuth2 flow.
 * Webhooks: Not supported — Packeta does not publish a webhook signing scheme.
 */
export class PacketaAdapter implements LogisticsAdapter {

  // Connect Link support — single API-key (password) form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'packeta'
  readonly version = '1'

  private readonly labelFormat: string

  constructor(config: PacketaAdapterConfig = {}) {
    this.labelFormat = config.labelFormat ?? 'A7 on A4'
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // For Packeta the "code" is the API password itself.
    return exchangeApiPassword(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  /**
   * createShipment — register a new packet with Packeta.
   *
   * Required fields on `data`:
   *   - destinationAddress (name/surname, email, phone, street/city/zip for home delivery
   *     OR addressId in metadata for pickup-point delivery)
   *   - reference (your order/eshop reference number)
   *   - totalWeight (kg)
   *
   * Optional fields:
   *   - cost (cod amount + currency)
   *   - notes
   */
  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new PacketaClient(credentials)

    const dest = data.destinationAddress
    const meta = (data.metadata ?? {}) as Record<string, unknown>

    // Split compound name into name/surname for Packeta
    const fullName = dest?.name ?? ''
    const nameParts = fullName.trim().split(/\s+/)
    const surname = nameParts.length > 1 ? nameParts.slice(1).join(' ') : nameParts[0] ?? ''
    const firstName = nameParts.length > 1 ? nameParts[0] : ''

    const attrs: Record<string, string | number | undefined> = {
      number: data.reference ?? undefined,
      name: firstName || undefined,
      surname: surname || undefined,
      company: dest?.company ?? undefined,
      email: dest?.email ?? undefined,
      phone: dest?.phone ?? undefined,
      // Home delivery address
      street: dest?.street1 ?? undefined,
      city: dest?.city ?? undefined,
      zip: dest?.postalCode ?? undefined,
      // Pickup point branch ID (if provided via metadata)
      addressId: meta['addressId'] as string | undefined,
      // Weight in kg
      weight: data.totalWeight ? String(data.totalWeight.value) : undefined,
      // Cash-on-delivery
      cod: data.cost ? String(data.cost.amount) : undefined,
      currency: data.cost?.currency ?? undefined,
      // Eshop reference (passed via metadata or platform slug)
      eshop: (meta['eshop'] as string | undefined) ?? undefined,
    }

    const xml = await client.createPacket(attrs)
    const packet = parsePacketXml(xml)
    return transformShipment(packet)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new PacketaClient(credentials)
    const xml = await client.packetStatus(id)
    const packet = parsePacketXml(xml)
    // Preserve the barcode as the ID if not returned in the status response
    if (!packet.barcode && !packet.id) {
      packet.barcode = id
    }
    return transformShipment(packet)
  }

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    // Packeta does not expose a list-all-packets endpoint.
    // This stub returns an empty array; callers should use getShipment by barcode.
    void credentials
    void params
    return []
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new PacketaClient(credentials)
    const xml = await client.packetTracking(trackingNumber)
    return parseTrackingXml(xml, trackingNumber)
  }

  async listTrackingEvents(credentials: Credentials, params: QueryParams): Promise<TrackingEvent[]> {
    // Packeta does not expose a paginated tracking-events feed.
    void credentials
    void params
    return []
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new PacketaClient(credentials)
    const xml = await client.packetLabelPdf(id, this.labelFormat)
    return parseLabelXml(xml, id, this.labelFormat)
  }

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    if (!data.shipmentId && !data.trackingNumber) {
      throw new Error('shipmentId or trackingNumber is required to generate a Packeta label')
    }
    const barcode = (data.shipmentId ?? data.trackingNumber)!
    const client = new PacketaClient(credentials)
    const xml = await client.packetLabelPdf(barcode, this.labelFormat)
    return parseLabelXml(xml, barcode, this.labelFormat)
  }

  async voidLabel(_credentials: Credentials, _id: string): Promise<void> {
    // Packeta does not support label voiding via API; labels become invalid when
    // a packet is cancelled. This is a no-op.
  }

  // ── Rates ──────────────────────────────────────────────────────────────────
  // getRates is intentionally omitted: Packeta uses a fixed published tariff, not
  // a real-time quote API — leaving it off makes the router answer 501
  // NOT_IMPLEMENTED instead of a false 200 with no rates.

  // ── Carriers ───────────────────────────────────────────────────────────────
  // Packeta's documented carrier list (https://docs.packeta.com/docs/home-delivery/carriers)
  // is one unpaginated JSON array, so a caller's page is cut locally from it.
  // Pickup points are a separate feed and are not carriers.

  async listCarriers(credentials: Credentials, params: QueryParams): Promise<Carrier[]> {
    const client = new PacketaClient(credentials)
    const rows = (await client.getCarriers()) as PacketaCarrier[]
    return pageLocally(rows.map(transformCarrier), params)
  }

  async getCarrier(credentials: Credentials, id: string): Promise<Carrier> {
    // The feed documents no by-id lookup; the whole list is searched.
    const client = new PacketaClient(credentials)
    const rows = (await client.getCarriers()) as PacketaCarrier[]
    const found = rows.find((row) => row.id !== undefined && String(row.id) === id)
    if (!found) {
      throw Object.assign(new Error(`Packeta carrier not found: ${id}`), {
        statusCode: 404,
        code: 'NOT_FOUND',
      })
    }
    return transformCarrier(found)
  }
}
