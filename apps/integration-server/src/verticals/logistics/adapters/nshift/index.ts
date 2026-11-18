import { connectionScope, cursorPagerKey, pageByRows } from '@opensteward/shared'
import type { LogisticsAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Label } from '../../schema/label'
import type { Manifest } from '../../schema/manifest'
import type { Carrier } from '../../schema/carrier'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { NShiftClient } from './client'

import { transformShipment, type NShiftShipment } from './transform/shipment'
import { transformTracking, type NShiftTrackingResponse } from './transform/tracking'
import { transformLabel, type NShiftLabel } from './transform/label'
import { transformManifest, type NShiftManifest } from './transform/manifest'
import { transformCarrier, type NShiftPartner } from './transform/carrier'
import {
  transformHistoryShipment,
  type NShiftHistoryPage,
  type NShiftHistoryShipment,
} from './transform/shipment-history'
import { NSHIFT_HISTORY_PAGE_SIZE } from './constants'

interface NShiftAdapterConfig {
  sandbox?: boolean
}

const RAML = 'https://api.unifaun.com/rs-extapi/v1/documentation/root-resource-v1.raml'

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

/**
 * One zero-based page of GET /shipments-history. The RAML documents the
 * query parameters `page` (required), `dateFrom`, `dateTo`, `dateType`,
 * `searchField`, `searchValue` and `status`, and a response carrying `page`,
 * `totalPages` and `shipments`. The page base is not stated on this resource;
 * its example answers `"page": 0, "totalPages": 1`, and every sibling paged
 * resource of the same API says "The page parameter starts on zero".
 */
async function historyPage(
  client: NShiftClient,
  page: number,
  filter: Record<string, string>,
): Promise<{ rows: NShiftHistoryShipment[]; next: number | undefined }> {
  const res = await client.get<NShiftHistoryPage>('shipments-history', { page, ...filter })
  const rows = res?.shipments ?? []
  // A page with no rows is past the end of the list whatever else it says.
  if (rows.length === 0) return { rows, next: undefined }
  // Otherwise only the documented `totalPages` says whether another page
  // follows; a full page of 50 may be the last one, so it is not guessed.
  if (typeof res.totalPages !== 'number') {
    throw new Error(`nShift GET /shipments-history page ${page} answered rows without totalPages`)
  }
  return { rows, next: page + 1 < res.totalPages ? page + 1 : undefined }
}

// ── Resource coverage ──────────────────────────────────────────────────────
// Unavailable: order     — nShift Delivery REST API has no orders resource; shipment creation is the entry point
// Unavailable: rate      — rate-shopping requires the separate nShift Checkout/DeliveryCheckout product
// Unavailable: warehouse — nShift Delivery REST API has no warehouses endpoint

/**
 * nShift (formerly Unifaun) logistics adapter.
 *
 * Product: nShift Delivery / APIConnect
 * Base URL: https://api.unifaun.com/rs-extapi/v1/
 * Auth: HTTP Basic — API key ID as username, Secret as password.
 *
 * Key capabilities:
 *   - Create stored shipments; list and read shipments from /shipments-history
 *   - Cancel stored shipments
 *   - Fetch tracking events per parcel number
 *   - Create labels (print a stored shipment); labels cannot be listed or read by id
 *   - Create manifests; manifests cannot be listed or read by id
 *   - List carriers via GET /meta/lists/partners
 *
 * Unavailable resources:
 *   - order:     No orders endpoint; shipment creation is the primary booking flow.
 *   - rate:      Rate-shopping requires the separate nShift Checkout/DeliveryCheckout product.
 *   - warehouse: No warehouses endpoint in the public Delivery REST API.
 */
export class NShiftAdapter implements LogisticsAdapter {
  readonly platform = 'nshift'
  readonly version = '1'
  /** Honours `params.search`; see AdapterCapabilities. Declared so the
   *  router can refuse the parameter on adapters that would drop it. */
  readonly capabilities = { search: true }

  constructor(_config: NShiftAdapterConfig = {}) {}

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

  // ── Shipments ──────────────────────────────────────────────────────────────

  /**
   * List shipments from GET /shipments-history ("Fetch information about
   * shipments (max 6 months old)", "No more than 50 shipments are returned as
   * a result of a single page. All the results will be order by created date
   * in descending order."). Pages are a fixed 50 rows, so pageByRows cuts the
   * caller's page out of them and `totalPages` ends the walk.
   *
   * `params.search` goes to the documented `searchField=orderNo` +
   * `searchValue` pair (the order number the adapter always searched on).
   * GET /stored-shipments is not used: "Please note that a maxium of 50
   * stored shipments will be returned", with no page parameter.
   */
  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new NShiftClient(credentials)
    const filter: Record<string, string> = {}
    if (params.search) {
      filter['searchField'] = 'orderNo'
      filter['searchValue'] = params.search
    }
    const key = cursorPagerKey(connectionScope('nshift', credentials), 'shipments-history', {
      ...filter,
      page_size: NSHIFT_HISTORY_PAGE_SIZE,
    })
    const result = await pageByRows<Shipment, number>(key, params, async (cursor) => {
      const { rows, next } = await historyPage(client, cursor ?? 0, filter)
      return { items: rows.map(transformHistoryShipment), next }
    })
    return result.items
  }

  /**
   * Read one shipment back by the id listShipments returns. The API has no GET
   * /shipments/{shipmentId} (only DELETE), so it uses the documented lookup
   * on the same collection: GET /shipments-history with `searchField=shipmentId`
   * (enum `[ '', orderNo, reference, shipmentNo, shipmentId, parcelNo ]`).
   */
  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new NShiftClient(credentials)
    const { rows } = await historyPage(client, 0, { searchField: 'shipmentId', searchValue: id })
    const row = rows.find((r) => r.id === id)
    if (!row) {
      throw Object.assign(new Error(`nShift: shipment not found: ${id}`), {
        statusCode: 404,
        code: 'NOT_FOUND',
      })
    }
    return transformHistoryShipment(row)
  }

  /**
   * Create a shipment via the stored-shipments endpoint.
   * To book immediately (print label), use createLabel() after creating the shipment.
   */
  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new NShiftClient(credentials)

    const body: Record<string, unknown> = {
      orderNo: data.reference ?? undefined,
      senderReference: data.reference ?? undefined,
      shipDate: data.createdAt
        ? new Date(data.createdAt).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10),
    }

    if (data.serviceCode) {
      body['service'] = { id: data.serviceCode }
    }

    if (data.originAddress) {
      const o = data.originAddress
      body['sender'] = {
        name: o.name ?? undefined,
        address1: o.street1 ?? undefined,
        address2: o.street2 ?? undefined,
        zipcode: o.postalCode ?? undefined,
        city: o.city ?? undefined,
        country: o.country ?? undefined,
        phone: o.phone ?? undefined,
        email: o.email ?? undefined,
      }
    }

    if (data.destinationAddress) {
      const d = data.destinationAddress
      body['receiver'] = {
        name: d.name ?? undefined,
        address1: d.street1 ?? undefined,
        address2: d.street2 ?? undefined,
        zipcode: d.postalCode ?? undefined,
        city: d.city ?? undefined,
        country: d.country ?? undefined,
        phone: d.phone ?? undefined,
        email: d.email ?? undefined,
      }
    }

    if (data.totalWeight) {
      body['parcels'] = [
        {
          weight: data.totalWeight.value,
          copies: 1,
        },
      ]
    } else if (data.packages && data.packages.length > 0) {
      body['parcels'] = data.packages.map((pkg) => ({
        weight: pkg.weight?.value ?? undefined,
        copies: 1,
      }))
    }

    const raw = await client.post<NShiftShipment>('stored-shipments', body)
    return transformShipment(raw)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new NShiftClient(credentials)
    await client.delete(`stored-shipments/${encodeURIComponent(id)}`)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  /**
   * Retrieve tracking events by parcel number (barcode).
   * Uses the nShift ShipmentData API at api.nshiftportal.com.
   */
  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new NShiftClient(credentials)
    // The Delivery REST API exposes shipment history under /shipments/{id}/statuses
    const raw = await client.get<NShiftTrackingResponse>(
      `shipments/${encodeURIComponent(trackingNumber)}/statuses`,
    )
    return transformTracking(raw)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  /**
   * Refused. Labels are the PDF documents of ONE shipment (GET
   * /shipments/{shipmentId}/pdfs: "Fetch a list of all PDF documents for a
   * shipment."), and they expire ("Please note that generated PDF documents
   * are only available for 1 hour."). No documented collection lists labels
   * across shipments: GET /stored-shipments is capped at 50 with no paging,
   * and its rows carry no PDFs.
   */
  async listLabels(_credentials: Credentials, _params: QueryParams): Promise<Label[]> {
    throw notSupported(
      `nShift cannot list labels: labels are only the PDF documents of one shipment ` +
        `(GET /shipments/{shipmentId}/pdfs, "generated PDF documents are only available for 1 hour"); ${RAML}`,
    )
  }

  /**
   * Refused. It read `pdfs` off GET /stored-shipments/{storedId}, whose
   * documented response (schema `shipment`) has no PDFs, so it could only
   * ever answer a label with no document.
   */
  async getLabel(_credentials: Credentials, _id: string): Promise<Label> {
    throw notSupported(
      `nShift cannot read a label by id: GET /stored-shipments/{storedId} documents no PDFs, ` +
        `and a shipment's PDFs (GET /shipments/{shipmentId}/pdfs) expire after 1 hour; ${RAML}`,
    )
  }

  /**
   * Book (print) a stored shipment to generate a label.
   * Converts a stored shipment into a printed shipment, which triggers label generation.
   */
  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    const client = new NShiftClient(credentials)
    const storedId = data.shipmentId ?? data.id
    if (!storedId) throw new Error('nShift createLabel: shipmentId or id is required')

    // POST to stored-shipments/{id}/shipments converts stored → printed and returns PDFs
    const raw = await client.post<NShiftShipment>(
      `stored-shipments/${encodeURIComponent(storedId)}/shipments`,
      { returnFile: true },
    )

    const pdf = raw.pdfs?.[0] ?? {}
    return transformLabel({
      id: raw.id ?? undefined,
      shipmentId: raw.id ?? undefined,
      parcelNo: raw.parcels?.[0]?.parcelNo ?? undefined,
      serviceId: raw.service?.id ?? undefined,
      href: (pdf as Record<string, unknown>)['href'] as string | undefined,
      pdf: (pdf as Record<string, unknown>)['pdf'] as string | undefined,
      created: raw.created ?? undefined,
      updated: raw.updated ?? undefined,
    } as NShiftLabel)
  }

  async voidLabel(credentials: Credentials, id: string): Promise<void> {
    const client = new NShiftClient(credentials)
    await client.delete(`stored-shipments/${encodeURIComponent(id)}`)
  }

  // ── Manifests ──────────────────────────────────────────────────────────────

  /**
   * Refused. The RAML declares no GET on bare /shipment-manifests. The only
   * manifest list is GET /shipment-manifests/{manifestType}/manifests ("Get
   * filtered manifest list based on query params"), whose `manifestType` is a
   * required path parameter with no documented set of values (the examples
   * show SBTL and FREE; "Manifest type: APRTF is not supported."), and this
   * connection holds no manifest type to send.
   */
  async listManifests(_credentials: Credentials, _params: QueryParams): Promise<Manifest[]> {
    throw notSupported(
      `nShift cannot list manifests: GET /shipment-manifests/{manifestType}/manifests requires a ` +
        `manifestType, the API documents no list of manifest types, and this connection has none configured; ${RAML}`,
    )
  }

  /**
   * Refused. The RAML declares no GET /shipment-manifests/{manifestId}: only
   * /{manifestId}/prints (the manifest's PDF documents) and the type-scoped
   * list above.
   */
  async getManifest(_credentials: Credentials, _id: string): Promise<Manifest> {
    throw notSupported(
      `nShift cannot read a manifest by id: the API documents no GET /shipment-manifests/{manifestId}, ` +
        `only its PDF prints; ${RAML}`,
    )
  }

  async createManifest(credentials: Credentials, data: Partial<Manifest>): Promise<Manifest> {
    const client = new NShiftClient(credentials)
    const body: Record<string, unknown> = {
      shipmentIds: data.shipmentIds ?? [],
      carrierId: data.carrierId ?? undefined,
      warehouseId: data.warehouseId ?? undefined,
    }
    const raw = await client.post<NShiftManifest>('shipment-manifests', body)
    return transformManifest(raw)
  }

  // ── Carriers ───────────────────────────────────────────────────────────────

  /**
   * List carriers configured for the account via GET /meta/lists/partners.
   * Returns all partners (carriers) and their associated services.
   */
  async listCarriers(credentials: Credentials, _params: QueryParams): Promise<Carrier[]> {
    const client = new NShiftClient(credentials)
    const raw = await client.get<NShiftPartner[]>('meta/lists/partners')
    return (raw ?? []).map(transformCarrier)
  }

  async getCarrier(credentials: Credentials, id: string): Promise<Carrier> {
    const client = new NShiftClient(credentials)
    const raw = await client.get<NShiftPartner[]>('meta/lists/partners')
    const partner = (raw ?? []).find((p) => p.id === id)
    if (!partner) throw new Error(`nShift: carrier not found: ${id}`)
    return transformCarrier(partner)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────
  // getRates is intentionally omitted: no rate-shopping endpoint in the Delivery
  // REST API (see Resource coverage above) — leaving it off makes the router
  // answer 501 NOT_IMPLEMENTED instead of a false 200 with no rates.
}
