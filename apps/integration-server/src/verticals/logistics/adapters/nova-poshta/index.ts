// ── Resource coverage ──────────────────────────────────────────────
// Available: shipment, trackingevent, rate, label, warehouse, carrier, manifest, order
// carrier  — derived: Nova Poshta is itself the sole carrier; no GET /carriers endpoint exists.
//            A static record is synthesised from known metadata.
// manifest — built: POST /declaration-groups (create); no list endpoint in the API.
// order    — built: GET /fulfillment/{countrycode}/v1/orders/status (list),
//            GET /fulfillment/{countrycode}/v1/orders/{id}/details (get), under the
//            connection's credentials.extra.countryCode; POST /fulfillment/{countrycode}/orders
//            (create) is the pre-v2.0 route and unverified.

import {
  connectionScope,
  cursorPagerKey,
  pageByRows,
  reportUpstreamPage,
  simpleApiKey,
} from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Label } from '../../schema/label'
import type { Warehouse } from '../../schema/warehouse'
import type { Carrier } from '../../schema/carrier'
import type { Manifest } from '../../schema/manifest'
import type { Order } from '../../schema/order'

import {
  buildAuthUrl,
  exchangeApiKey,
  refreshCredentials as doRefresh,
} from './auth'
import { NovaPoshtaClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import {
  transformShipment,
  type NovaPoshtaShipment,
} from './transform/shipment'
import {
  transformTrackingResponse,
  type NovaPoshtaTrackingResponse,
} from './transform/tracking'
import { transformRate, type NovaPoshtaRate } from './transform/rate'
import { transformLabel, type NovaPoshtaLabel } from './transform/label'
import {
  transformWarehouse,
  type NovaPoshtaDivision,
} from './transform/warehouse'
import { transformCarrier } from './transform/carrier'
import { transformManifest, type NovaPoshtaDeclarationGroup } from './transform/manifest'
import {
  transformOrder,
  transformOrderDetails,
  transformOrderStatus,
  type NovaPoshtaFulfillmentOrder,
  type NovaPoshtaOrderDetails,
  type NovaPoshtaOrderStatusPage,
} from './transform/order'

const SIMPLE_API_KEY_FORM = simpleApiKey()

/**
 * The page-number envelope of GET /shipments and GET /divisions
 * (https://api-portal.novapost.com/methods/methods/shipments.md,
 * https://api-portal.novapost.com/methods/methods/dictionaries.md): query
 * `limit` ("Max number of items to return on page.") and `page` ("Number of
 * page to return."), answered with `current_page`, `last_page` ("Total pages
 * found."), `per_page` and `items`.
 */
interface NovaPoshtaPage<T> {
  current_page?: number | null
  last_page?: number | null
  per_page?: number | null
  total?: number | null
  items?: T[]
  data?: T[]
}

/** The page-number query for a caller's `{ page, limit }`, and the size it sends. */
function pageQuery(params: QueryParams): { page: number; limit: number } {
  return {
    page: params.page ?? 1,
    limit: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
  }
}

/** Whether a page-number response has a page after `page`, sent at `size`. */
function hasNextPage(res: NovaPoshtaPage<unknown>, page: number, size: number, n: number): boolean {
  if (typeof res.last_page === 'number') return (res.current_page ?? page) < res.last_page
  return n >= size
}

/**
 * Report a page-number response to the page sink. `per_page` is the size the
 * platform actually paged by; when it (or the size sent) is below the caller's
 * limit, it is reported so every short-page judgement uses it.
 */
function reportPage(
  params: QueryParams,
  res: NovaPoshtaPage<unknown>,
  sent: { page: number; limit: number },
  n: number,
): void {
  const size = typeof res.per_page === 'number' && res.per_page >= 1 ? res.per_page : sent.limit
  reportUpstreamPage(params, {
    hasMore: hasNextPage(res, sent.page, size, n),
    ...(typeof res.total === 'number' ? { totalCount: res.total } : {}),
    ...(params.limit !== undefined && size < params.limit ? { pageSize: size } : {}),
  })
}

/**
 * The Fulfillment API's country code for this connection. Every Fulfillment
 * path is /fulfillment/{countrycode}/v1/…, where `countrycode` is the
 * "Country code where inbound plans are registered." (Check Inbound Plan
 * Status, https://api-portal.novapost.com/methods/page-3.md). Nova Post
 * publishes no default and the API key does not imply one, so it comes from
 * the connection (`credentials.extra.countryCode`) or the call is refused
 * before any request.
 */
function fulfillmentCountry(credentials: Credentials, what: string): string {
  const cc = credentials.extra?.['countryCode']
  if (typeof cc === 'string' && cc.trim() !== '') return encodeURIComponent(cc.trim())
  throw Object.assign(
    new Error(
      `Nova Poshta cannot ${what}: every Fulfillment path is /fulfillment/{countrycode}/v1/…, ` +
        '"Country code where inbound plans are registered.", and this connection has no ' +
        'countryCode (credentials.extra.countryCode)',
    ),
    { statusCode: 501, code: 'NOT_SUPPORTED' },
  )
}

interface NovaPoshtaAdapterConfig {
  /**
   * Optionally override the base URL for local testing / staging.
   * Defaults to https://api.novapost.com/v.1.0/
   */
  baseUrl?: string
}

export class NovaPoshtaAdapter implements LogisticsAdapter {
  // Connect Link support — single API-key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'nova-poshta'
  readonly version = '1'

  constructor(_config: NovaPoshtaAdapterConfig = {}) {}

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // The "code" is the API key; exchange it for a JWT-bearing credentials object.
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new NovaPoshtaClient(credentials)
    const sent = pageQuery(params)
    const res = await client.get<NovaPoshtaPage<NovaPoshtaShipment>>('shipments', sent)
    const items = res.items ?? res.data ?? []
    reportPage(params, res, sent, items.length)
    return items.map(transformShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new NovaPoshtaClient(credentials)
    const raw = await client.get<NovaPoshtaShipment>(`shipments/${id}`)
    return transformShipment(raw)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new NovaPoshtaClient(credentials)
    const raw = await client.post<NovaPoshtaShipment>('shipments', {
      serviceCode: data.serviceCode,
      weight: data.totalWeight?.value,
      description: data.notes,
      declaredCost: data.cost?.amount,
      currency: data.cost?.currency,
      recipient: data.destinationAddress
        ? {
            fullName: data.destinationAddress.name,
            companyName: data.destinationAddress.company,
            phone: data.destinationAddress.phone,
            email: data.destinationAddress.email,
            city: data.destinationAddress.city,
            street: data.destinationAddress.street1,
            postalCode: data.destinationAddress.postalCode,
            countryCode: data.destinationAddress.country,
          }
        : undefined,
      sender: data.originAddress
        ? {
            fullName: data.originAddress.name,
            companyName: data.originAddress.company,
            phone: data.originAddress.phone,
            email: data.originAddress.email,
            city: data.originAddress.city,
            street: data.originAddress.street1,
            postalCode: data.originAddress.postalCode,
            countryCode: data.originAddress.country,
          }
        : undefined,
    })
    return transformShipment(raw)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new NovaPoshtaClient(credentials)
    await client.put<unknown>(`shipments/${id}`, { status: 'Cancelled' })
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(
    credentials: Credentials,
    trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    const client = new NovaPoshtaClient(credentials)
    // Nova Poshta tracking uses GET /shipments/tracking?numbers[]=<number>
    const raw = await client.get<NovaPoshtaTrackingResponse>('shipments/tracking', {
      'numbers[]': trackingNumber,
    })
    return transformTrackingResponse(raw)
  }

  async listTrackingEvents(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<TrackingEvent[]> {
    const client = new NovaPoshtaClient(credentials)
    // Events are flattened out of pages of shipments, so a caller page is cut
    // out of the page-number chain by rows. Upstream pages are always asked
    // for at one size, which the key therefore carries.
    const limit = MAX_PAGE_SIZE
    const key = cursorPagerKey(connectionScope('nova-poshta', credentials), 'shipment-events', {
      limit,
    })
    const { items } = await pageByRows<TrackingEvent, number>(key, params, async (cursor) => {
      const page = cursor ?? 1
      const res = await client.get<NovaPoshtaPage<NovaPoshtaShipment>>('shipments', { limit, page })
      const shipments = res.items ?? res.data ?? []
      // For each shipment, synthesise a single tracking event from its status.
      const events = shipments.map((s) =>
        transformTrackingResponse({
          id: s.id ?? undefined,
          number: s.number ?? undefined,
          status: s.status ?? undefined,
          createdAt: s.createdAt ?? undefined,
          ...(s as Record<string, unknown>),
        }),
      ).flat()
      const size = typeof res.per_page === 'number' && res.per_page >= 1 ? res.per_page : limit
      return { items: events, next: hasNextPage(res, page, size, shipments.length) ? page + 1 : null }
    })
    return items
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new NovaPoshtaClient(credentials)
    const pkg = params.packages[0]
    const res = await client.post<NovaPoshtaRate[] | { items?: NovaPoshtaRate[]; data?: NovaPoshtaRate[] }>(
      'shipments/calculate',
      {
        weight: pkg?.weight?.value,
        recipient: {
          city: params.destinationAddress.city,
          postalCode: params.destinationAddress.postalCode,
          countryCode: params.destinationAddress.country,
        },
        sender: {
          city: params.originAddress.city,
          postalCode: params.originAddress.postalCode,
          countryCode: params.originAddress.country,
        },
      },
    )

    // API may return an array or a wrapped object.
    const rates: NovaPoshtaRate[] = Array.isArray(res)
      ? res
      : (res as { items?: NovaPoshtaRate[]; data?: NovaPoshtaRate[] }).items ??
        (res as { items?: NovaPoshtaRate[]; data?: NovaPoshtaRate[] }).data ??
        []

    return rates.map(transformRate)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  async getLabel(credentials: Credentials, id: string): Promise<Label> {
    const client = new NovaPoshtaClient(credentials)
    // Labels are retrieved from the shipment endpoint.
    const raw = await client.get<NovaPoshtaLabel>(`shipments/${id}/label`)
    return transformLabel({ ...raw, shipmentId: id })
  }

  async createLabel(credentials: Credentials, data: Partial<Label>): Promise<Label> {
    if (!data.shipmentId) throw new Error('shipmentId is required to generate a label')
    const client = new NovaPoshtaClient(credentials)
    const raw = await client.post<NovaPoshtaLabel>(`shipments/${data.shipmentId}/label`, {})
    return transformLabel({ ...raw, shipmentId: data.shipmentId })
  }

  async voidLabel(credentials: Credentials, id: string): Promise<void> {
    // Nova Poshta label void = cancel the shipment.
    await this.cancelShipment(credentials, id)
  }

  // ── Warehouses ─────────────────────────────────────────────────────────────

  async listWarehouses(credentials: Credentials, params: QueryParams): Promise<Warehouse[]> {
    const client = new NovaPoshtaClient(credentials)
    const sent = pageQuery(params)
    const res = await client.get<NovaPoshtaDivision[] | NovaPoshtaPage<NovaPoshtaDivision>>(
      'divisions',
      sent,
    )
    const items: NovaPoshtaDivision[] = Array.isArray(res) ? res : (res.items ?? res.data ?? [])
    if (!Array.isArray(res)) reportPage(params, res, sent, items.length)
    return items.map(transformWarehouse)
  }

  async getWarehouse(credentials: Credentials, id: string): Promise<Warehouse> {
    const client = new NovaPoshtaClient(credentials)
    const raw = await client.get<NovaPoshtaDivision>(`divisions/${id}`)
    return transformWarehouse(raw)
  }

  // ── Carriers ───────────────────────────────────────────────────────────────
  // Nova Poshta has no GET /carriers endpoint — it is itself the sole carrier.
  // We synthesise the static record from known constants.

  async listCarriers(_credentials: Credentials, _params: QueryParams): Promise<Carrier[]> {
    return [transformCarrier({})]
  }

  async getCarrier(_credentials: Credentials, _id: string): Promise<Carrier> {
    return transformCarrier({})
  }

  // ── Manifests ──────────────────────────────────────────────────────────────

  async createManifest(credentials: Credentials, data: Partial<Manifest>): Promise<Manifest> {
    const client = new NovaPoshtaClient(credentials)
    const raw = await client.post<NovaPoshtaDeclarationGroup>('declaration-groups', {
      mainNumbers: data.shipmentIds,
    })
    return transformManifest(raw)
  }

  async getManifest(credentials: Credentials, id: string): Promise<Manifest> {
    // Nova Poshta has no GET /declaration-groups/:id endpoint.
    // The print endpoint returns a base64 PDF; we return a minimal manifest record.
    const client = new NovaPoshtaClient(credentials)
    const raw = await client.get<NovaPoshtaDeclarationGroup>('declaration-groups/prints', {
      'numbers[]': id,
    })
    return transformManifest({ ...raw, number: raw.number ?? id })
  }

  async listManifests(_credentials: Credentials, _params: QueryParams): Promise<Manifest[]> {
    // Nova Poshta does not expose a list endpoint for declaration-groups.
    return []
  }

  // ── Orders ─────────────────────────────────────────────────────────────────
  // Fulfilled via the Nova Poshta Fulfillment API. listOrders/getOrder take the
  // country code from the connection (fulfillmentCountry). createOrder and
  // cancelOrder (writes, not rebuilt) still use the pre-v2.0 routes and 'UA'.

  private static resolveCountryCode(params: QueryParams | Partial<Order>): string {
    const meta = (params as Record<string, unknown>)['metadata'] as Record<string, unknown> | undefined
    return typeof meta?.['countryCode'] === 'string' ? meta['countryCode'] : 'UA'
  }

  /**
   * GET /fulfillment/{countrycode}/v1/orders/status. Its only paging parameter
   * is `page` ("Pagination page number (up to 25 objects per page).") and it
   * takes no page size, so the caller's pages are cut out of the page-number
   * chain by rows. `meta` and `links` have no documented fields for this
   * endpoint, so the chain ends on the documented empty `data` ("if no
   * orders match the criteria, an empty array is returned"). The date filters
   * (`startDate`/`endDate`) are on CREATION date, so `updatedAfter` is not
   * sent: an older order whose status changed would be filtered out.
   */
  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const cc = fulfillmentCountry(credentials, 'list orders')
    const client = new NovaPoshtaClient(credentials)
    const key = cursorPagerKey(connectionScope('nova-poshta', credentials), 'fulfillment-orders', {
      countrycode: cc,
    })
    const { items } = await pageByRows<Order, number>(
      key,
      params,
      async (cursor) => {
        const page = cursor ?? 1
        const res = await client.get<NovaPoshtaOrderStatusPage>(
          `fulfillment/${cc}/v1/orders/status`,
          { page },
        )
        const rows = res.data
        // `data` is required ("List of orders."); a body without it is not an end.
        if (!Array.isArray(rows)) {
          throw new Error('Nova Poshta orders/status response has no `data` array')
        }
        return { items: rows.map(transformOrderStatus), next: rows.length > 0 ? page + 1 : null }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items
  }

  /** GET /fulfillment/{countrycode}/v1/orders/{id}/details. */
  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const cc = fulfillmentCountry(credentials, 'read an order')
    const client = new NovaPoshtaClient(credentials)
    const raw = await client.get<NovaPoshtaOrderDetails>(
      `fulfillment/${cc}/v1/orders/${encodeURIComponent(id)}/details`,
    )
    return transformOrderDetails(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new NovaPoshtaClient(credentials)
    const cc = NovaPoshtaAdapter.resolveCountryCode(data)
    const raw = await client.post<NovaPoshtaFulfillmentOrder>(`fulfillment/${cc}/orders`, {
      externalNumber: data.orderNumber,
      destWarehouse: data.warehouseId,
      deliveryType: data.requestedServiceCode,
      additionalInfo: data.notes,
      details: (data.lineItems ?? []).map((li) => ({
        sku: li.sku,
        quantity: li.quantity,
        price: li.unitAmount,
        sum: li.totalAmount,
      })),
    })
    return transformOrder(raw)
  }

  async cancelOrder(credentials: Credentials, id: string): Promise<void> {
    const client = new NovaPoshtaClient(credentials)
    await client.put<unknown>(`fulfillment/UA/orders/${id}/cancel`, {})
  }
}
