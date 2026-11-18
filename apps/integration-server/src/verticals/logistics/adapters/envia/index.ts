import { connectionScope, pageByRows, reportUpstreamPage, simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { Order } from '../../schema/order'
import type { Carrier } from '../../schema/carrier'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Label } from '../../schema/label'
import type { Manifest } from '../../schema/manifest'
import type { WebhookEvent } from '../../schema/webhook'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { EnviaClient, EnviaQueriesClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import { transformShipment, type EnviaShipment } from './transform/shipment'
import { transformOrder, type EnviaOrder } from './transform/order'
import { transformRate, type EnviaRate } from './transform/rate'
import { transformLabel, type EnviaGuide } from './transform/label'
import { transformTrackingResponse, type EnviaTrackingResponse } from './transform/tracking'
import { transformTrackingEvent, type EnviaTrackingEventRaw } from './transform/trackingevent'
import { transformCarrier, type EnviaCarrier } from './transform/carrier'
import { transformManifest, type EnviaManifest } from './transform/manifest'
import type { EnviaAddress } from './transform/address'

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: warehouse — Warehouses exist only in the separate Envia Fulfillment API
//              (apifulfillment.envia.com), which requires distinct credentials and
//              is not part of the Shipping/Queries API used by this adapter.

interface EnviaAdapterConfig {
  // Reserved for future configuration options (e.g. custom base URLs for
  // white-labelled environments). Currently unused.
  _unused?: never
}

const SIMPLE_API_KEY_FORM = simpleApiKey()

export class EnviaAdapter implements LogisticsAdapter {
  // Connect Link support — single API-key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'envia'
  readonly version = '1'

  constructor(_config: EnviaAdapterConfig = {}) {}

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // For Envia the "code" is the Bearer token itself.
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────
  // Envia supports webhooks but does not publish a signing secret scheme in
  // its public documentation — verification is not possible without it.

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    // Envia webhook payload includes an "event" or "type" field and a "data"
    // object with the resource details.
    const rawType = String(payload['event'] ?? payload['type'] ?? '')
    const data = (payload['data'] ?? payload) as Record<string, unknown>
    const resourceId = String(data['trackingNumber'] ?? data['id'] ?? '')

    type CanonicalResource = WebhookEvent['resourceType']
    type CanonicalAction = WebhookEvent['action']

    let resourceType: CanonicalResource = 'shipment'
    let action: CanonicalAction = 'updated'

    const lower = rawType.toLowerCase()
    if (lower.includes('track')) {
      resourceType = 'tracking_event'
    } else if (lower.includes('manifest')) {
      resourceType = 'manifest'
    } else if (lower.includes('label') || lower.includes('generate')) {
      resourceType = 'label'
    } else {
      resourceType = 'shipment'
    }

    if (lower.includes('creat') || lower.includes('generat') || lower.includes('new')) {
      action = 'created'
    } else if (lower.includes('cancel')) {
      action = 'cancelled'
    } else if (lower.includes('delet') || lower.includes('remov')) {
      action = 'deleted'
    } else {
      action = 'updated'
    }

    return [
      {
        platform: 'envia',
        type: rawType || 'shipment.updated',
        resourceType,
        action,
        resourceId: resourceId || undefined,
        payload,
      },
    ]
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  /**
   * `GET /guide/{MM}/{YYYY}` (Queries API) is Envia's only shipment list:
   * "Retrieves all shipments created under your account for a specific
   * calendar month and year." It takes no page or size parameter, and the docs
   * name no retention limit, so the months are walked newest-first as the
   * upstream pages of `pageByRows`, back to the UTC month of `updatedAfter`.
   * Without `updatedAfter` there is no lower bound, so the call is refused.
   * https://docs.envia.com/reference/shipments-by-month-year.md
   */
  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const after = params.updatedAfter
    if (!(after instanceof Date) || Number.isNaN(after.getTime())) {
      throw notSupported(
        'Envia cannot list shipments without updatedAfter: its only shipment list, GET /guide/{MM}/{YYYY}, ' +
          '"Retrieves all shipments created under your account for a specific calendar month and year", ' +
          'and the docs name no retention limit to bound the months walked',
      )
    }
    const newest = utcMonthIndex(new Date())
    const oldest = utcMonthIndex(after)
    const client = new EnviaQueriesClient(credentials)
    const key = `${connectionScope('envia', credentials)}:shipments:${newest}:${oldest}`
    const { items } = await pageByRows<Shipment, number>(key, params, async (cursor) => {
      const month = cursor ?? newest
      const res = await client.get<{ data?: EnviaShipment[] | null }>(monthPath(month))
      return {
        items: (res.data ?? []).map(transformShipment),
        next: month > oldest ? month - 1 : null,
      }
    })
    return items
  }

  /**
   * `GET /guide/{tracking_number}` (Queries API) returns the shipment in `data`.
   * https://docs.envia.com/reference/shipment-by-tracking.md
   */
  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new EnviaQueriesClient(credentials)
    const res = await client.get<{ data?: EnviaShipment | null }>(`guide/${encodeURIComponent(id)}`)
    if (!res.data) throw notFound(`Envia shipment ${id} not found`)
    return transformShipment(res.data)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    // Creating a shipment on Envia means generating a label.
    const label = await this.createLabel(credentials, {
      carrierId: data.carrierId,
      serviceCode: data.serviceCode,
      metadata: {
        originAddress: data.originAddress,
        destinationAddress: data.destinationAddress,
        totalWeight: data.totalWeight,
        dimensions: data.dimensions,
        reference: data.reference,
      },
    })

    // Map the label back to a Shipment.
    return {
      id: label.trackingNumber,
      status: 'LABEL_CREATED',
      trackingNumber: label.trackingNumber,
      carrierId: label.carrierId,
      serviceCode: label.serviceCode,
      originAddress: data.originAddress,
      destinationAddress: data.destinationAddress,
      totalWeight: data.totalWeight,
      dimensions: data.dimensions,
      labelUrl: label.url,
      cost: label.cost,
      reference: data.reference,
      createdAt: label.createdAt,
      metadata: label.metadata,
    }
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    // Envia cancellation requires carrier + tracking number.
    // When id is "carrier/trackingNumber", split on '/'.
    const [carrier, trackingNumber] = id.includes('/') ? id.split('/') : ['', id]
    const client = new EnviaClient(credentials)
    await client.post<unknown>(`ship/cancel/${carrier}/${trackingNumber}`, {})
  }

  // ── Orders ────────────────────────────────────────────────────────────────
  // `GET /v4/orders` (Queries API) pages ecommerce orders with `page` (default 1)
  // and `limit` (default 20) and reports the match count in `totals`. The docs
  // state no maximum for `limit`. https://docs.envia.com/reference/get-orders.md
  // Known gap, left to the lead: "Without `sort_by`, the API automatically limits
  // results to the last 6 months relative to the account's most recent order", and
  // `sort_by` is documented only as "Field name" with no values, so none is sent.
  // A full walk therefore ends (hasMore false) at that 6-month horizon.

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new EnviaQueriesClient(credentials)
    const res = await client.get<EnviaOrdersResponse>('v4/orders', {
      page: params.page ?? 1,
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
    })
    if (typeof res.totals === 'number') reportUpstreamPage(params, { totalCount: res.totals })
    return (res.orders_info ?? []).map(transformOrder)
  }

  /** `GET /v4/orders?order_ids=` ("Up to 300 order IDs."): Envia documents no single-order read. */
  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new EnviaQueriesClient(credentials)
    const res = await client.get<EnviaOrdersResponse>('v4/orders', { order_ids: id })
    const raw = (res.orders_info ?? []).find((o) => o.id != null && String(o.id) === id)
    if (!raw) throw notFound(`Envia order ${id} not found`)
    return transformOrder(raw)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(
    credentials: Credentials,
    trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    const client = new EnviaClient(credentials)
    const raw = await client.post<EnviaTrackingResponse>('ship/track', {
      trackingNumber,
    })
    const events: EnviaTrackingEventRaw[] = raw.events ?? raw.tracking ?? []
    if (events.length > 0) {
      return events.map((evt) =>
        transformTrackingEvent(
          evt,
          raw.shipmentId ?? undefined,
          raw.trackingNumber ?? trackingNumber,
          raw.carrier ?? undefined,
        ),
      )
    }
    // Fall back to envelope-level transform when no individual events exist.
    return transformTrackingResponse(raw)
  }

  /**
   * Envia has no tracking-event collection. Its shipment list,
   * `GET /guide/{MM}/{YYYY}`, documents only `tracking_number`, `carrier`,
   * `status` and `created_at` per shipment: a current status, not an event
   * history. Events come only from `POST /ship/generaltrack/`, a lookup for
   * given `trackingNumbers`, not a collection.
   * https://docs.envia.com/reference/track-shipments.md
   */
  async listTrackingEvents(
    _credentials: Credentials,
    _params: QueryParams,
  ): Promise<TrackingEvent[]> {
    throw notSupported(
      'Envia cannot list tracking events: GET /guide/{MM}/{YYYY} returns only ' +
        '"`tracking_number`, `carrier`, `status`, and `created_at` for each shipment", ' +
        'and tracking history is only returned by POST /ship/generaltrack/ for given trackingNumbers',
    )
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new EnviaClient(credentials)

    const body = {
      origin: buildEnviaAddress(
        params.originAddress.name,
        params.originAddress.company,
        params.originAddress.phone,
        params.originAddress.email,
        params.originAddress.street1,
        params.originAddress.city,
        params.originAddress.state,
        params.originAddress.country,
        params.originAddress.postalCode,
      ),
      destination: buildEnviaAddress(
        params.destinationAddress.name,
        params.destinationAddress.company,
        params.destinationAddress.phone,
        params.destinationAddress.email,
        params.destinationAddress.street1,
        params.destinationAddress.city,
        params.destinationAddress.state,
        params.destinationAddress.country,
        params.destinationAddress.postalCode,
      ),
      packages: params.packages.map((pkg) => ({
        type: 'box',
        amount: 1,
        weight: pkg.weight?.value ?? 1,
        weightUnit: mapWeightUnit(pkg.weight?.unit),
        dimensions: pkg.dimensions
          ? {
              length: pkg.dimensions.length,
              width: pkg.dimensions.width,
              height: pkg.dimensions.height,
            }
          : undefined,
        lengthUnit: mapDimensionUnit(pkg.dimensions?.unit),
      })),
      shipment: {
        type: 1,
      },
    }

    const res = await client.post<{ data?: EnviaRate[] } | EnviaRate[]>('ship/rate', body)
    const items = Array.isArray(res) ? res : (res as { data?: EnviaRate[] }).data ?? []
    return items.map(transformRate)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    // Envia stores labels on shipments; retrieve via guide endpoint.
    const shipment = await this.getShipment(credentials, id)
    return {
      shipmentId: shipment.id,
      trackingNumber: shipment.trackingNumber,
      carrierId: shipment.carrierId,
      serviceCode: shipment.serviceCode,
      status: 'CREATED',
      url: shipment.labelUrl,
      cost: shipment.cost,
      createdAt: shipment.createdAt,
      metadata: shipment.metadata,
    }
  }

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    const client = new EnviaClient(credentials)

    // Extract address data from metadata if provided via createShipment()
    const meta = (data.metadata ?? {}) as Record<string, unknown>

    const originAddr = meta['originAddress'] as
      | { name?: string; company?: string; phone?: string; email?: string; street1?: string; city?: string; state?: string; country?: string; postalCode?: string }
      | undefined

    const destAddr = meta['destinationAddress'] as
      | { name?: string; company?: string; phone?: string; email?: string; street1?: string; city?: string; state?: string; country?: string; postalCode?: string }
      | undefined

    const weight = meta['totalWeight'] as { value?: number; unit?: string } | undefined
    const dims = meta['dimensions'] as { length?: number; width?: number; height?: number; unit?: string } | undefined

    const body = {
      origin: originAddr
        ? buildEnviaAddress(
            originAddr.name,
            originAddr.company,
            originAddr.phone,
            originAddr.email,
            originAddr.street1,
            originAddr.city,
            originAddr.state,
            originAddr.country,
            originAddr.postalCode,
          )
        : undefined,
      destination: destAddr
        ? buildEnviaAddress(
            destAddr.name,
            destAddr.company,
            destAddr.phone,
            destAddr.email,
            destAddr.street1,
            destAddr.city,
            destAddr.state,
            destAddr.country,
            destAddr.postalCode,
          )
        : undefined,
      packages: [
        {
          type: 'box',
          amount: 1,
          weight: weight?.value ?? 1,
          weightUnit: mapWeightUnit(weight?.unit as 'oz' | 'lb' | 'g' | 'kg' | undefined),
          dimensions: dims
            ? { length: dims.length, width: dims.width, height: dims.height }
            : undefined,
          lengthUnit: mapDimensionUnit(dims?.unit as 'in' | 'cm' | undefined),
        },
      ],
      shipment: {
        type: 1,
        carrier: data.carrierId ?? undefined,
        service: data.serviceCode ?? undefined,
      },
    }

    const res = await client.post<{ data?: EnviaGuide } | EnviaGuide>('ship/generate', body)
    const guide: EnviaGuide =
      (res as { data?: EnviaGuide }).data != null
        ? ((res as { data: EnviaGuide }).data)
        : (res as EnviaGuide)

    return transformLabel(guide)
  }

  async voidLabel(credentials: Credentials, id: string): Promise<void> {
    // Envia cancellation: POST /ship/cancel/{carrier}/{trackingNumber}
    // When id is a tracking number we don't know the carrier — pass as-is.
    const client = new EnviaClient(credentials)
    await client.post<unknown>(`ship/cancel//${id}`, {})
  }

  // ── Carriers ───────────────────────────────────────────────────────────────

  /**
   * Envia's carrier list, `GET /carrier`, takes `country_code` with
   * `"required": true`, and a connection stores no country to send.
   * https://docs.envia.com/reference/carriers-by-country.md
   */
  async listCarriers(_credentials: Credentials, _params: QueryParams): Promise<Carrier[]> {
    throw notSupported(
      'Envia cannot list carriers: GET /carrier requires `country_code` ("required": true), ' +
        'and an Envia connection stores no country',
    )
  }

  /**
   * `GET /carrier/{carrier_id}` (Queries API) returns the carrier in `data`.
   * https://docs.envia.com/reference/carrier-by-id.md
   */
  async getCarrier(credentials: Credentials, id: string): Promise<Carrier> {
    const client = new EnviaQueriesClient(credentials)
    const res = await client.get<{ data?: EnviaCarrier | null }>(
      `carrier/${encodeURIComponent(id)}`,
    )
    if (!res.data) throw notFound(`Envia carrier ${id} not found`)
    return transformCarrier(res.data)
  }

  // ── Manifests ──────────────────────────────────────────────────────────────

  async createManifest(
    credentials: Credentials,
    data: Partial<Manifest>,
  ): Promise<Manifest> {
    const client = new EnviaClient(credentials)
    const body = {
      carrier: data.carrierId ?? undefined,
      shipments: data.shipmentIds ?? [],
    }
    const res = await client.post<{ data?: EnviaManifest } | EnviaManifest>('ship/manifest', body)
    const raw: EnviaManifest =
      (res as { data?: EnviaManifest }).data != null
        ? ((res as { data: EnviaManifest }).data)
        : (res as EnviaManifest)
    return transformManifest(raw)
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildEnviaAddress(
  name?: string,
  company?: string,
  phone?: string,
  email?: string,
  street?: string,
  city?: string,
  state?: string,
  country?: string,
  postalCode?: string,
): EnviaAddress {
  return {
    name: name ?? undefined,
    company: company ?? undefined,
    phone: phone ?? undefined,
    email: email ?? undefined,
    street: street ?? undefined,
    city: city ?? undefined,
    state: state ?? undefined,
    country: country ?? undefined,
    postalCode: postalCode ?? undefined,
  }
}

function mapWeightUnit(unit: 'oz' | 'lb' | 'g' | 'kg' | undefined | string): string {
  if (!unit) return 'KG'
  switch (unit.toLowerCase()) {
    case 'oz': return 'OZ'
    case 'lb':
    case 'lbs': return 'LB'
    case 'g': return 'G'
    default: return 'KG'
  }
}

function mapDimensionUnit(unit: 'in' | 'cm' | undefined | string): string {
  if (!unit) return 'CM'
  return unit.toLowerCase() === 'in' ? 'IN' : 'CM'
}

/** Response of `GET /v4/orders`: `{ orders_info, countries, totals }`. */
interface EnviaOrdersResponse {
  orders_info?: EnviaOrder[] | null
  totals?: number | null
}

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

function notFound(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 404, code: 'NOT_FOUND' })
}

/** Months since year 0 in UTC, so every window is one calendar month. */
function utcMonthIndex(d: Date): number {
  return d.getUTCFullYear() * 12 + d.getUTCMonth()
}

/**
 * `guide/{MM}/{YYYY}`: "Month (`MM`) as a zero-padded two-digit string
 * (01-12)", "Year (`YYYY`) as a four-digit string".
 */
function monthPath(index: number): string {
  const year = Math.floor(index / 12)
  const month = (index % 12) + 1
  return `guide/${String(month).padStart(2, '0')}/${String(year).padStart(4, '0')}`
}
