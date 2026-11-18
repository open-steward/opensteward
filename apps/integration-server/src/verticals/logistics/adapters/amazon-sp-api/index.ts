// ── Resource coverage ──────────────────────────────────────────────
// Available: shipment, trackingevent, rate, label, order, carrier, manifest, warehouse
//   carrier   — PUT shipping/v2/carrierAccounts (getCarrierAccounts → activeAccounts[]); list only,
//               the endpoint has no by-id form
//   manifest  — Shipping v2 collection forms: PUT collectionForms/history (list),
//               GET collectionForms/{id} (get), POST collectionForms (create)
//   warehouse — Supply Sources 2020-07-01: GET supplySources (list; pageSize/nextPageToken),
//               GET supplySources/{id} (get)

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
import type { Order } from '../../schema/order'
import type { Carrier } from '../../schema/carrier'
import type { Manifest } from '../../schema/manifest'
import type { Warehouse } from '../../schema/warehouse'

import {
  connectionScope,
  cursorPagerKey,
  DEFAULT_PAGE_LIMIT,
  pageByCursor,
  pageByRows,
  pageLocally,
  reportUpstreamPage,
} from '@opensteward/shared'
import {
  buildAuthUrl,
  exchangeCode as doExchange,
  refreshCredentials as doRefresh,
  ensureAuth,
  type AmazonSpApiAuthConfig,
} from './auth'
import { AmazonSpApiClient } from './client'
import {
  ORDERS_EARLIEST,
  ORDERS_MAX_RESULTS_PER_PAGE,
  ORDERS_PATH,
  SHIPPING_V2,
  SUPPLY_SOURCES_PATH,
} from './constants'
import { transformTracking, type SpApiTrackingResponse } from './transform/tracking'
import { transformShipment, type SpApiShipment } from './transform/shipment'
import { transformRate, type SpApiRate, type SpApiGetRatesResponse } from './transform/rate'
import { transformLabelSingle, type SpApiGetShipmentDocumentsResult } from './transform/label'
import {
  transformOrder,
  type SpApiGetOrderResponse,
  type SpApiGetOrdersResponse,
} from './transform/order'
import {
  transformCarrier,
  extractCarriers,
  type SpApiGetCarrierAccountsResponse,
} from './transform/carrier'
import {
  transformManifestFromDocument,
  transformManifestFromHistory,
  extractManifestHistory,
  type SpApiCollectionFormResponse,
  type SpApiGetCollectionFormHistoryResponse,
} from './transform/manifest'
import {
  transformWarehouse,
  type SpApiSupplySource,
  type SpApiGetSupplySourcesResponse,
} from './transform/warehouse'

/**
 * Pager scope for one connection. SP-API credentials carry no seller id, so
 * the scope is the platform plus the connection's token fingerprint.
 */
function pagerScope(credentials: Credentials): string {
  return connectionScope('amazon-sp-api', credentials)
}

/**
 * The connection's marketplaces, required by `getOrders` (`MarketplaceIds`,
 * `required: true`). SP-API's authorization returns none, so they are read
 * from the connection's `extra.marketplaceIds` (a string or string[]); the
 * call is refused, before any request, when the connection has none.
 */
function marketplaceIdsOf(credentials: Credentials): string {
  const raw = credentials.extra?.['marketplaceIds']
  const ids = (Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : [])
    .map((v) => String(v).trim())
    .filter(Boolean)
  if (ids.length === 0) {
    throw Object.assign(
      new Error(
        'Amazon SP-API cannot list orders without marketplaces: getOrders requires MarketplaceIds, ' +
          'and this connection has no extra.marketplaceIds',
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }
  return ids.join(',')
}

interface AmazonSpApiAdapterConfig {
  clientId?: string
  clientSecret?: string
  sandbox?: boolean
}

/**
 * Amazon SP-API adapter — scoped to the logistics subset: Shipping v2
 * (shipments, rates, labels, tracking, carrier accounts, collection forms),
 * Orders v0 and Supply Sources 2020-07-01. Intentionally does NOT implement
 * the full SP-API surface (catalog, inventory, reports, etc.).
 */
export class AmazonSpApiAdapter implements LogisticsAdapter {
  readonly platform = 'amazon-sp-api'
  readonly version = '1'

  constructor(private config: AmazonSpApiAdapterConfig = {}) {}

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    const cfg: AmazonSpApiAuthConfig = {
      clientId: this.config.clientId ?? '',
      clientSecret: this.config.clientSecret ?? '',
      sandbox: this.config.sandbox,
    }
    return doExchange(code, redirectUri, cfg)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(
    credentials: Credentials,
    trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    const creds = await ensureAuth(credentials)
    const client = new AmazonSpApiClient(creds)
    const raw = await client.get<SpApiTrackingResponse>(
      `shipping/v2/tracking/${encodeURIComponent(trackingNumber)}`,
    )
    return transformTracking(raw)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const creds = await ensureAuth(credentials)
    const client = new AmazonSpApiClient(creds)
    const raw = await client.get<SpApiShipment>(`shipping/v2/shipments/${encodeURIComponent(id)}`)
    return transformShipment(raw)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const creds = await ensureAuth(credentials)
    const client = new AmazonSpApiClient(creds)
    const raw = await client.post<SpApiShipment>('shipping/v2/shipments', {
      shipFrom: data.originAddress
        ? {
            name: data.originAddress.name,
            addressLine1: data.originAddress.street1,
            addressLine2: data.originAddress.street2,
            city: data.originAddress.city,
            stateOrRegion: data.originAddress.state,
            postalCode: data.originAddress.postalCode,
            countryCode: data.originAddress.country,
            phoneNumber: data.originAddress.phone,
            email: data.originAddress.email,
          }
        : undefined,
      shipTo: data.destinationAddress
        ? {
            name: data.destinationAddress.name,
            addressLine1: data.destinationAddress.street1,
            addressLine2: data.destinationAddress.street2,
            city: data.destinationAddress.city,
            stateOrRegion: data.destinationAddress.state,
            postalCode: data.destinationAddress.postalCode,
            countryCode: data.destinationAddress.country,
            phoneNumber: data.destinationAddress.phone,
            email: data.destinationAddress.email,
          }
        : undefined,
      totalWeight: data.totalWeight
        ? { value: data.totalWeight.value, unit: data.totalWeight.unit }
        : undefined,
      serviceType: data.serviceCode,
      clientReferenceId: data.reference,
    })
    return transformShipment(raw)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const creds = await ensureAuth(credentials)
    const client = new AmazonSpApiClient(creds)
    const body = {
      shipFrom: params.originAddress
        ? {
            name: params.originAddress.name,
            addressLine1: params.originAddress.street1,
            addressLine2: params.originAddress.street2,
            city: params.originAddress.city,
            stateOrRegion: params.originAddress.state,
            postalCode: params.originAddress.postalCode,
            countryCode: params.originAddress.country,
            phoneNumber: params.originAddress.phone,
            email: params.originAddress.email,
          }
        : undefined,
      shipTo: params.destinationAddress
        ? {
            name: params.destinationAddress.name,
            addressLine1: params.destinationAddress.street1,
            addressLine2: params.destinationAddress.street2,
            city: params.destinationAddress.city,
            stateOrRegion: params.destinationAddress.state,
            postalCode: params.destinationAddress.postalCode,
            countryCode: params.destinationAddress.country,
            phoneNumber: params.destinationAddress.phone,
            email: params.destinationAddress.email,
          }
        : undefined,
      packages: params.packages.map((pkg) => ({
        packageClientReferenceId: pkg.id,
        weight: pkg.weight ? { value: pkg.weight.value, unit: pkg.weight.unit } : undefined,
        dimensions: pkg.dimensions
          ? {
              length: pkg.dimensions.length,
              width: pkg.dimensions.width,
              height: pkg.dimensions.height,
              unit: pkg.dimensions.unit,
            }
          : undefined,
      })),
    }
    const raw = await client.post<SpApiGetRatesResponse>('shipping/v2/shipments/rates', body)
    const rates: SpApiRate[] = raw.rates ?? []
    return rates.map(transformRate)
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  async getLabel(credentials: Credentials, shipmentId: string): Promise<Label> {
    const creds = await ensureAuth(credentials)
    const client = new AmazonSpApiClient(creds)
    const raw = await client.get<SpApiGetShipmentDocumentsResult>(
      `shipping/v2/shipments/${encodeURIComponent(shipmentId)}/documents`,
    )
    return transformLabelSingle(raw)
  }

  async listLabels(credentials: Credentials, _params: Record<string, unknown>): Promise<Label[]> {
    // SP-API has no bulk label list endpoint; labels are fetched per-shipment.
    // This implementation is intentionally empty — callers must use getLabel per shipmentId.
    void _params
    void credentials
    return []
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  /**
   * List orders with `getOrders` (`GET /orders/v0/orders`). The response
   * nests `Orders` and `NextToken` under `payload`.
   *
   * - `MarketplaceIds` is required upstream and comes from the connection
   *   only (`credentials.extra.marketplaceIds`); without it the call is
   *   refused before any request.
   * - "Either the `CreatedAfter` parameter or the `LastUpdatedAfter`
   *   parameter is required." `LastUpdatedAfter` is `params.updatedAfter`
   *   when the caller sends one, else the documented floor of what the API
   *   serves at all (`ORDERS_EARLIEST`), so an unfiltered call is the whole
   *   collection and its bound never moves between pages.
   * - `MaxResultsPerPage` "must be 1 - 100", so the caller's limit is clamped
   *   and a smaller size sent is reported. Page N walks the `NextToken` chain.
   */
  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const marketplaceIds = marketplaceIdsOf(credentials)
    const creds = await ensureAuth(credentials)
    const client = new AmazonSpApiClient(creds)
    const asked =
      typeof params.limit === 'number' && params.limit >= 1
        ? Math.floor(params.limit)
        : DEFAULT_PAGE_LIMIT
    const size = Math.min(asked, ORDERS_MAX_RESULTS_PER_PAGE)
    const lastUpdatedAfter =
      params.updatedAfter instanceof Date ? params.updatedAfter.toISOString() : ORDERS_EARLIEST
    const fetchPage = async (token: string | undefined) => {
      const raw = await client.get<SpApiGetOrdersResponse>(ORDERS_PATH, {
        MarketplaceIds: marketplaceIds,
        LastUpdatedAfter: lastUpdatedAfter,
        MaxResultsPerPage: size,
        NextToken: token,
      })
      return {
        items: (raw.payload?.Orders ?? []).map(transformOrder),
        next: raw.payload?.NextToken || null,
      }
    }
    const report = (hasMore: boolean) =>
      reportUpstreamPage(params, size < asked ? { hasMore, pageSize: size } : { hasMore })
    if (typeof params.cursor === 'string' && params.cursor) {
      const res = await fetchPage(params.cursor)
      report(res.next !== null)
      return res.items
    }
    const key = cursorPagerKey(pagerScope(credentials), 'orders', {
      marketplaceIds,
      lastUpdatedAfter,
      size,
    })
    const { items, hasMore } = await pageByCursor(key, params.page, fetchPage)
    report(hasMore)
    return items
  }

  /** Read one order with `getOrder` (`GET /orders/v0/orders/{orderId}`); the order is `payload`. */
  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const creds = await ensureAuth(credentials)
    const client = new AmazonSpApiClient(creds)
    const raw = await client.get<SpApiGetOrderResponse>(`${ORDERS_PATH}/${encodeURIComponent(id)}`)
    if (!raw.payload) throw new Error(`Amazon SP-API getOrder returned no payload for ${id}`)
    return transformOrder(raw.payload)
  }

  // ── Carriers ───────────────────────────────────────────────────────────────

  /**
   * List the carrier accounts linked to the seller.
   * Uses `getCarrierAccounts` (`PUT /shipping/v2/carrierAccounts`) — a read
   * the spec models as PUT-with-body; the body is optional filter detail, so
   * `{}` lists everything. No by-id form exists, hence no `getCarrier`.
   * The request has no paging field and the response is the whole
   * `activeAccounts` list, so the caller's page is sliced from it.
   */
  async listCarriers(credentials: Credentials, params: QueryParams): Promise<Carrier[]> {
    const creds = await ensureAuth(credentials)
    const client = new AmazonSpApiClient(creds)
    const raw = await client.put<SpApiGetCarrierAccountsResponse>(
      `${SHIPPING_V2}carrierAccounts`,
      {},
    )
    return pageLocally(extractCarriers(raw).map(transformCarrier), params)
  }

  // ── Manifests (collection forms) ───────────────────────────────────────────

  /**
   * List previously generated collection forms (manifests).
   * Uses `getCollectionFormHistory` (`PUT /shipping/v2/collectionForms/history`).
   * `maxResults` is the only paging control the spec offers — no cursor,
   * offset or page — so the history is read as growing windows from its
   * start: upstream page j asks for `maxResults = (j + 1) × limit` and keeps
   * the rows past `j × limit`. A window that comes back full may have more
   * behind it, so its end is the next position; a short one is the end.
   * `pageByRows` walks that chain and cuts the caller's page out of it, with
   * `hasMore` exact from its peek. This assumes Amazon returns the history
   * in the same order for every `maxResults`, which the spec does not state.
   */
  async listManifests(credentials: Credentials, params: QueryParams): Promise<Manifest[]> {
    const creds = await ensureAuth(credentials)
    const client = new AmazonSpApiClient(creds)
    const step =
      typeof params.limit === 'number' && params.limit >= 1
        ? Math.floor(params.limit)
        : DEFAULT_PAGE_LIMIT
    const key = cursorPagerKey(pagerScope(credentials), 'collectionFormHistory', { step })
    const { items } = await pageByRows<Manifest, number>(
      key,
      params,
      async (from = 0) => {
        const maxResults = from + step
        const raw = await client.put<SpApiGetCollectionFormHistoryResponse>(
          `${SHIPPING_V2}collectionForms/history`,
          { maxResults },
        )
        const rows = extractManifestHistory(raw)
        return {
          items: rows.slice(from).map(transformManifestFromHistory),
          // The true row count, not the ask: if Amazon ever returned more than
          // maxResults, the next window still starts where these rows ended.
          next: rows.length >= maxResults ? rows.length : undefined,
        }
      },
      { defaultLimit: DEFAULT_PAGE_LIMIT },
    )
    return items
  }

  /**
   * Retrieve a collection form (manifest) by id.
   * Uses `getCollectionForm` (`GET /shipping/v2/collectionForms/{collectionFormId}`).
   * The body is the PDF only, so the id comes from the request path.
   */
  async getManifest(credentials: Credentials, id: string): Promise<Manifest> {
    const creds = await ensureAuth(credentials)
    const client = new AmazonSpApiClient(creds)
    const raw = await client.get<SpApiCollectionFormResponse>(
      `${SHIPPING_V2}collectionForms/${encodeURIComponent(id)}`,
    )
    return transformManifestFromDocument(raw, id)
  }

  /**
   * Generate a new collection form (manifest) for one carrier account.
   * Uses `generateCollectionForm` (`POST /shipping/v2/collectionForms`).
   * `carrierId` is the request's one required field, so its absence is
   * reported here rather than as an opaque 400 from Amazon.
   */
  async createManifest(credentials: Credentials, data: Partial<Manifest>): Promise<Manifest> {
    if (!data.carrierId) {
      throw new Error(
        'amazon-sp-api createManifest requires carrierId (the linked carrier account)',
      )
    }
    const creds = await ensureAuth(credentials)
    const client = new AmazonSpApiClient(creds)
    const raw = await client.post<SpApiCollectionFormResponse>(`${SHIPPING_V2}collectionForms`, {
      carrierId: data.carrierId,
    })
    return transformManifestFromDocument(raw, undefined, data.carrierId)
  }

  // ── Warehouses (supply sources) ────────────────────────────────────────────

  /**
   * List the seller's supply sources — ship-from locations, SP-API's warehouse.
   * Uses `getSupplySources` (`GET /supplySources/2020-07-01/supplySources`).
   * Token-paged: `params.limit` → `pageSize`, and the caller's 1-based
   * `page` is walked along the response's `nextPageToken` chain by the
   * shared cursor pager. An explicit `params.cursor` is sent as
   * `nextPageToken` as-is.
   */
  async listWarehouses(credentials: Credentials, params: QueryParams): Promise<Warehouse[]> {
    const creds = await ensureAuth(credentials)
    const client = new AmazonSpApiClient(creds)
    const fetchPage = async (token: string | undefined) => {
      const raw = await client.get<SpApiGetSupplySourcesResponse>(SUPPLY_SOURCES_PATH, {
        pageSize: params.limit,
        nextPageToken: token,
      })
      return {
        items: (raw.supplySources ?? []).map(transformWarehouse),
        next: raw.nextPageToken || null,
      }
    }
    if (typeof params.cursor === 'string' && params.cursor) {
      const res = await fetchPage(params.cursor)
      reportUpstreamPage(params, { hasMore: res.next !== null })
      return res.items
    }
    const key = cursorPagerKey(pagerScope(credentials), 'supplySources', { limit: params.limit })
    const { items, hasMore } = await pageByCursor(key, params.page, fetchPage)
    reportUpstreamPage(params, { hasMore })
    return items
  }

  /**
   * Retrieve one supply source with its full configuration.
   * Uses `getSupplySource` (`GET /supplySources/2020-07-01/supplySources/{supplySourceId}`).
   */
  async getWarehouse(credentials: Credentials, id: string): Promise<Warehouse> {
    const creds = await ensureAuth(credentials)
    const client = new AmazonSpApiClient(creds)
    const raw = await client.get<SpApiSupplySource>(
      `${SUPPLY_SOURCES_PATH}/${encodeURIComponent(id)}`,
    )
    return transformWarehouse(raw)
  }
}
