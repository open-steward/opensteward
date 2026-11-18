// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: carrier — ShipMozo is a courier aggregator; the only carrier-related endpoint
//   is POST /create-shipper (registers a shipper account), with no list-carriers endpoint.
//
// Sources: the OpenAPI spec behind the Swagger UI the Shipmozo panel links as
// "API Documentation" (https://shipping-api.com/api/documentation, JSON at
// https://shipping-api.com/api/v1?api-docs-v1.json), and the API documentation
// PDF linked from the same dialog, which carries the response bodies.

import { customForm, pageByRows, connectionScope } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment, ShipmentStatus } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Order } from '../../schema/order'
import type { Label } from '../../schema/label'
import type { Manifest } from '../../schema/manifest'
import type { Warehouse } from '../../schema/warehouse'

import { buildAuthUrl, exchangeApiKeys, refreshCredentials as doRefresh } from './auth'
import { ShipMozoClient } from './client'
import { WAREHOUSE_PAGE_SIZE } from './constants'
import { transformShipment, type ShipMozoTrackData } from './transform/shipment'
import { transformLabel, type ShipMozoLabel } from './transform/label'
import { transformManifest, type ShipMozoManifest } from './transform/manifest'
import { transformWarehouse, type ShipMozoWarehouse } from './transform/warehouse'

interface ShipMozoAdapterConfig {
  sandbox?: boolean
}

/**
 * "public-key" ("Api Public Key") and "private-key" ("Api Private Key") on
 * every call (https://shipping-api.com/api/v1?api-docs-v1.json).
 */
const CREDENTIAL_FORM = customForm({
  fields: [
    {
      name: 'publicKey',
      label: 'Public key',
      type: 'text',
      required: true,
      helpText: 'In the Shipmozo panel, under your user profile or the API Documentation dialog.',
    },
    {
      name: 'privateKey',
      label: 'Private key',
      type: 'password',
      required: true,
      helpText: 'Shown beside the public key in the Shipmozo panel.',
    },
  ],
  exchange: async (fields: Record<string, string>): Promise<Credentials> => {
    const publicKey = (fields['publicKey'] ?? '').trim()
    const privateKey = (fields['privateKey'] ?? '').trim()
    if (!publicKey) throw new Error('Public key is required.')
    if (!privateKey) throw new Error('Private key is required.')
    return exchangeApiKeys(publicKey, privateKey)
  },
})

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

function notFound(what: string, id: string): Error {
  return Object.assign(new Error(`Shipmozo ${what} not found: ${id}`), {
    statusCode: 404,
    code: 'NOT_FOUND',
  })
}

// ── createShipment (write method, not rebuilt) ─────────────────────────────
// POST /shipments is not in the documented API (the documented order-creation
// call is POST /push-order). Left as it was; see the rebuild record.

interface ShipMozoShipment {
  id?: string | number | null
  order_id?: string | null
  awb?: string | null
  status?: string | null
  carrier?: string | null
  service_code?: string | null
  reference?: string | null
  notes?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

function mapCreatedShipmentStatus(status: string | null | undefined): ShipmentStatus {
  if (!status) return 'UNKNOWN'
  const s = status.toLowerCase().trim()
  if (s === 'delivered') return 'DELIVERED'
  if (s.includes('out_for_delivery') || s.includes('out for delivery')) return 'OUT_FOR_DELIVERY'
  if (s.includes('in_transit') || s.includes('in transit') || s.includes('picked'))
    return 'IN_TRANSIT'
  if (s.includes('booked') || s.includes('pending') || s.includes('manifested')) return 'PENDING'
  if (s.includes('cancelled') || s.includes('canceled') || s.includes('rto')) return 'CANCELLED'
  return 'UNKNOWN'
}

function transformCreatedShipment(raw: ShipMozoShipment): Shipment {
  return {
    id: raw.id != null ? String(raw.id) : (raw.order_id ?? undefined),
    status: mapCreatedShipmentStatus(raw.status),
    trackingNumber: raw.awb ?? undefined,
    carrierId: raw.carrier ?? 'shipmozo',
    serviceCode: raw.service_code ?? undefined,
    reference: raw.reference ?? undefined,
    notes: raw.notes ?? undefined,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

interface ShipMozoRateOption {
  carrier?: string | null
  service_code?: string | null
  service_name?: string | null
  total_amount?: number | null
  currency?: string | null
  transit_days?: number | null
  [key: string]: unknown
}

export class ShipMozoAdapter implements LogisticsAdapter {
  credentialFields = CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  readonly platform = 'shipmozo'
  readonly version = '1'

  constructor(_config: ShipMozoAdapterConfig = {}) {}

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error(
      'Shipmozo connects with a public key and a private key; use the credential form.',
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(_payload: Buffer, _headers: Record<string, string>, _secret: string): boolean {
    return false
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  /**
   * The spec's 23 operations hold no shipment or order collection. The only
   * list-shaped order call is GET /get-ndr-all, "Get Ndr Orders" (non-delivery
   * reports only), so it is not a list of shipments.
   */
  async listShipments(_credentials: Credentials, _params: QueryParams): Promise<Shipment[]> {
    throw notSupported(
      'Shipmozo cannot list shipments: its API documents single-shipment reads only ' +
        '(GET /track-order?awb_number=, GET /get-order-detail/{order_id}); the one list-shaped ' +
        'order endpoint is GET /get-ndr-all, "Get Ndr Orders", which returns NDR orders only.',
    )
  }

  /**
   * `GET /track-order?awb_number=` — "Track Order Shipment Status"; "This API
   * is used to track the status of an order using the provided AWB (Air
   * Waybill) number." The id is the AWB number.
   */
  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new ShipMozoClient(credentials)
    const data = await client.get<ShipMozoTrackData>('/track-order', { awb_number: id })
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw notFound('shipment', id)
    return transformShipment(data)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new ShipMozoClient(credentials)
    const body: Record<string, unknown> = {
      reference: data.reference,
      service_code: data.serviceCode,
      notes: data.notes,
    }

    if (data.destinationAddress) {
      body.consignee = {
        name: data.destinationAddress.name,
        address: data.destinationAddress.street1,
        city: data.destinationAddress.city,
        state: data.destinationAddress.state,
        pincode: data.destinationAddress.postalCode,
        phone: data.destinationAddress.phone,
      }
    }

    if (data.originAddress) {
      body.shipper = {
        name: data.originAddress.name,
        address: data.originAddress.street1,
        city: data.originAddress.city,
        state: data.originAddress.state,
        pincode: data.originAddress.postalCode,
        phone: data.originAddress.phone,
      }
    }

    if (data.totalWeight) {
      body.weight = data.totalWeight.value
    }

    const res = await client.post<{ data?: ShipMozoShipment } | ShipMozoShipment>(
      '/shipments',
      body,
    )
    const raw =
      'data' in res && res.data ? (res.data as ShipMozoShipment) : (res as ShipMozoShipment)
    return transformCreatedShipment(raw)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  /**
   * `GET /track-order` returns `scan_detail`, but the docs' only example has
   * `"scan_detail": []` and name no fields for its entries, so no event can be
   * read from it. `current_status` is a current state, not an event history.
   */
  async getTrackingEvents(
    _credentials: Credentials,
    _trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    throw notSupported(
      'Shipmozo tracking events are not supported: GET /track-order documents "scan_detail": [] ' +
        'with no fields for its entries.',
    )
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  // POST /rates is not in the documented API (it documents POST /rate-calculator).
  // Write/quote method, not rebuilt; see the rebuild record.
  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new ShipMozoClient(credentials)
    const body: Record<string, unknown> = {
      origin_pincode: params.originAddress.postalCode,
      destination_pincode: params.destinationAddress.postalCode,
      weight: params.packages[0]?.weight?.value,
      cod: false,
    }

    const res = await client.post<{ data?: ShipMozoRateOption[]; rates?: ShipMozoRateOption[] }>(
      '/rates',
      body,
    )
    const items = res.data ?? res.rates ?? []
    return items.map((r) => ({
      carrierId: r.carrier ?? undefined,
      serviceCode: r.service_code ?? undefined,
      serviceName: r.service_name ?? undefined,
      totalAmount: r.total_amount ?? undefined,
      currency: r.currency ?? 'INR',
      transitDays: r.transit_days ?? undefined,
      metadata: r as Record<string, unknown>,
    }))
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  /**
   * GET /get-order-detail/{order_id} is documented ("This API retrieves the
   * details of a specific order using the order_id."), but neither the spec
   * ("Successful operation") nor the PDF documents its response, so no Order
   * field has a documented source.
   */
  async getOrder(_credentials: Credentials, _id: string): Promise<Order> {
    throw notSupported(
      'Shipmozo orders are not supported: GET /get-order-detail/{order_id} documents no response ' +
        'fields ("Successful operation" only).',
    )
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  /**
   * `GET /get-order-label/{awb_number}` — "The label is returned as a
   * base64-encoded PNG image." `data` is an array of {label, created_at}.
   * `type_of_label` ("Pass PDF, For PDF label type") is not sent: the PDF
   * variant's response is undocumented.
   */
  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new ShipMozoClient(credentials)
    const data = await client.get<ShipMozoLabel[]>(`/get-order-label/${encodeURIComponent(id)}`)
    const row = Array.isArray(data) ? data[0] : undefined
    if (!row) throw notFound('label', id)
    return transformLabel(id, row)
  }

  // ── Manifests ──────────────────────────────────────────────────────────────

  // GET /generate-manifest?awb_numbers= is documented ("AWB Number (comma
  // separated, max: 25)"), but its response is not. Write method, not rebuilt.
  async createManifest(credentials: Credentials, data: Partial<Manifest>): Promise<Manifest> {
    const client = new ShipMozoClient(credentials)
    const awbNumbers = (data.shipmentIds ?? []).join(',')
    const raw = await client.get<ShipMozoManifest>('/generate-manifest', {
      awb_numbers: awbNumbers,
    })
    if (!raw) throw new Error('Shipmozo /generate-manifest returned no data')
    return transformManifest(raw)
  }

  // ── Warehouses ─────────────────────────────────────────────────────────────

  /**
   * `GET /get-warehouses` — "Get all Warehouses", with `page`: "If you have
   * more than 25 records, pass page number (For next 25 records)". No size
   * parameter and no count, so upstream pages are a fixed 25 and a short page
   * ends the list. The first page is fetched without `page`; the next with 2.
   */
  async listWarehouses(credentials: Credentials, params: QueryParams): Promise<Warehouse[]> {
    const client = new ShipMozoClient(credentials)
    const key = `${connectionScope('shipmozo', credentials)}:warehouses:${WAREHOUSE_PAGE_SIZE}`
    const { items } = await pageByRows<Warehouse, number>(key, params, async (page) => {
      const data = await client.get<ShipMozoWarehouse[]>(
        '/get-warehouses',
        page === undefined ? undefined : { page },
      )
      if (!Array.isArray(data)) {
        // A result "1" body without the documented array is not an empty,
        // complete list: reading it as one would let the sync drop cached rows.
        throw Object.assign(new Error('Shipmozo /get-warehouses answered without a data array'), {
          statusCode: 502,
          code: 'UPSTREAM_ERROR',
        })
      }
      const rows: ShipMozoWarehouse[] = data
      return {
        items: rows.map(transformWarehouse),
        next: rows.length < WAREHOUSE_PAGE_SIZE ? undefined : (page ?? 1) + 1,
      }
    })
    return items
  }
}
