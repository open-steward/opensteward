/**
 * Vend POS (Lightspeed Retail X-Series) inventory adapter.
 *
 * Lightspeed acquired Vend in 2021 and rebranded the product as
 * "Lightspeed Retail X-Series". The API remains at retail.lightspeed.app
 * with the legacy Vend domain also in use.
 *
 * Auth: OAuth 2.0 authorization-code grant.
 *   Auth URL:    https://secure.retail.lightspeed.app/connect
 *   Token URL:   https://{domain_prefix}.retail.lightspeed.app/api/1.0/token
 *   API base:    https://{domain_prefix}.retail.lightspeed.app/api/2.0
 *
 * The `domain_prefix` is the retailer's store subdomain (e.g. "mystore" from
 * "mystore.vendhq.com") and must be stored in credentials.extra.domainPrefix
 * after the code exchange.
 *
 * Supported resources:
 *   - Products      (list + get)
 *   - StockLevels   (list only — inventory per product/outlet)
 *   - Locations     (outlets — list + get)
 *   - Suppliers     (list + get)
 *   - PurchaseOrders (consignments type=SUPPLIER — list + get)
 *   - StockTransfers (consignments type=OUTLET — list + get)
 *   - StockAdjustments (consignments type=STOCKTAKE — list + get)
 *
 * Note: Vend v2.0 does not expose a /stock-adjustments path. Inventory counts
 * (manual adjustments) are modelled as STOCKTAKE consignments in v2.0.
 *
 * Webhooks: HMAC-SHA256 via X-Signature header, key = client_secret.
 *
 * Schema-firewall: no product images, no supplier banking, no BOM.
 */
import type { Credentials, QueryParams } from '@opensteward/shared'
import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { InventoryAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { StockLevel } from '../../schema/stock-level'
import type { Location } from '../../schema/location'
import type { Supplier } from '../../schema/supplier'
import type { PurchaseOrder } from '../../schema/purchase-order'
import type { StockTransfer } from '../../schema/stock-transfer'
import type { StockAdjustment } from '../../schema/stock-adjustment'
import type { WebhookEvent } from '../../schema/webhook'

import {getAuthUrl, exchangeCode, refreshAccessToken} from './auth'
import {VendPosClient, type VendListResponse, type VendSingleResponse} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'
import {verifyVendWebhook, parseVendWebhookEvents} from './webhook'

import {transformProduct, type RawVendProduct} from './transform/product'
import {transformStockLevel, type RawVendInventory} from './transform/stock-level'
import {transformLocation, type RawVendOutlet} from './transform/location'
import {transformSupplier, type RawVendSupplier} from './transform/supplier'
import {
  transformPurchaseOrder,
  type RawVendConsignment,
  type RawVendConsignmentProduct,
} from './transform/purchase-order'
import {transformStockTransfer, type RawVendOutletConsignment} from './transform/stock-transfer'
import {
  transformStockAdjustment,
  type RawVendStockAdjustment,
  type RawVendStockAdjustmentLine,
} from './transform/stock-adjustment'

export interface VendPosAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

export class VendPosAdapter implements InventoryAdapter {
  readonly platform = 'vend-pos'
  readonly version = '0.1.0'

  private readonly config: VendPosAdapterConfig

  constructor(config: VendPosAdapterConfig) {
    this.config = config
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return getAuthUrl(state, this.config.clientId, this.config.redirectUri, overrideScopes ?? this.config.scopes)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    // domain_prefix must be passed via a state/session lookup or pre-registration;
    // we read it from the redirectUri hostname as a fallback for simplicity.
    // In production callers supply it via credentials.extra.domainPrefix from their
    // OAuth callback handler.
    const domainPrefix = this.config.redirectUri
      ? new URL(this.config.redirectUri).hostname.split('.')[0]
      : 'unknown'
    return exchangeCode(
      code,
      redirectUri,
      this.config.clientId,
      this.config.clientSecret,
      domainPrefix,
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshAccessToken(credentials)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyVendWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseVendWebhookEvents(payload)
  }

  private client(credentials: Credentials): VendPosClient {
    return new VendPosClient(credentials)
  }

  /**
   * One caller page of a v2.0 collection, walked by its `version` keyset.
   *
   * API 2.0 has no offset: "The highest `version` number `x` from this
   * collection (the `max` attribute above) should be used to request the
   * next page like: /api/2.0/products?after=x ... This should be repeated
   * until an empty collection is returned."
   * (https://x-series-api.lightspeedhq.com/v1.0/docs/pagination.md). Page N
   * is reached by carrying `after` forward from page N-1, which the shared
   * cursor pager remembers per connection, path, page size and filter.
   *
   * `page_size` is the caller's limit: no 2.0 maximum is documented (the
   * "200 is the maximum" note is API 0.x). An EMPTY collection ends the walk.
   * A short page does not, because "The upper limit will probably be
   * different depending on the endpoint": the endpoint may serve fewer rows
   * than it was asked for. The one exception is a page whose versions cannot
   * move `after` forward (see {@link nextCursor}). The platform's end is
   * reported as `hasMore`.
   */
  private async listByVersion<R>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
    filters: Record<string, string> = {},
  ): Promise<R[]> {
    const client = this.client(credentials)
    const query = { page_size: params.limit ?? DEFAULT_PAGE_SIZE, ...filters }
    const domainPrefix = String(credentials.extra?.['domainPrefix'] ?? '')
    const page = await pageByCursor<R, VersionCursor>(
      cursorPagerKey(connectionScope(domainPrefix, credentials), path, query),
      params.page,
      async (cursor) => {
        if (cursor?.stuck) throw cannotPagePast(path, cursor.after)
        const body = await client.get<VendListResponse<R> | R[]>(path, {
          ...query,
          ...(cursor ? { after: cursor.after } : {}),
        })
        const rows = listRows(body)
        // No `after` is `after=0`: "For a request with no `after` parameter or
        // `after=0`, the first page of products will be returned".
        return { items: rows, next: nextCursor(body, rows, cursor?.after ?? 0, query.page_size) }
      },
    )
    reportUpstreamPage(params, { hasMore: page.hasMore })
    return page.items
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const rows = await this.listByVersion<RawVendProduct>(credentials, '/products', params)
    return rows.map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).get<VendSingleResponse<RawVendProduct>>(
      `/products/${id}`,
    )
    return transformProduct(res.data)
  }

  // ── Stock Levels (inventory per product/outlet) ───────────────────────────

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const rows = await this.listByVersion<RawVendInventory>(credentials, '/inventory', params)
    return rows.map(transformStockLevel)
  }

  /**
   * Vend inventory is scoped by (product_id, outlet_id).
   * The id parameter is expected in the form "productId:outletId".
   */
  async getStockLevel(credentials: Credentials, id: string): Promise<StockLevel> {
    const [productId] = id.split(':')
    const res = await this.client(credentials).get<VendListResponse<RawVendInventory>>(
      `/inventory/${productId}`,
    )
    const record = (res.data ?? [])[0]
    if (!record) throw new Error(`vend-pos inventory not found for product ${productId}`)
    return transformStockLevel(record)
  }

  // ── Locations (Outlets) ───────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const rows = await this.listByVersion<RawVendOutlet>(credentials, '/outlets', params)
    return rows.map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const res = await this.client(credentials).get<VendSingleResponse<RawVendOutlet>>(
      `/outlets/${id}`,
    )
    return transformLocation(res.data)
  }

  // ── Suppliers ─────────────────────────────────────────────────────────────

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const rows = await this.listByVersion<RawVendSupplier>(credentials, '/suppliers', params)
    return rows.map(transformSupplier)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const res = await this.client(credentials).get<VendSingleResponse<RawVendSupplier>>(
      `/suppliers/${id}`,
    )
    return transformSupplier(res.data)
  }

  // ── Purchase Orders (consignments type=SUPPLIER) ──────────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const rows = await this.listByVersion<RawVendConsignment>(credentials, '/consignments', params, {
      type: 'SUPPLIER',
    })
    return rows.map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const [consignment, linesRes] = await Promise.all([
      this.client(credentials).get<VendSingleResponse<RawVendConsignment>>(
        `/consignments/${id}`,
      ),
      this.client(credentials).get<VendListResponse<RawVendConsignmentProduct>>(
        `/consignments/${id}/products`,
        { page_size: DEFAULT_PAGE_SIZE },
      ),
    ])
    const raw: RawVendConsignment = {
      ...consignment.data,
      consignment_products: linesRes.data ?? [],
    }
    return transformPurchaseOrder(raw)
  }

  // ── Stock Transfers (consignments type=OUTLET) ────────────────────────────

  async listStockTransfers(credentials: Credentials, params: QueryParams): Promise<StockTransfer[]> {
    const rows = await this.listByVersion<RawVendOutletConsignment>(
      credentials,
      '/consignments',
      params,
      { type: 'OUTLET' },
    )
    return rows.map(transformStockTransfer)
  }

  async getStockTransfer(credentials: Credentials, id: string): Promise<StockTransfer> {
    const [consignment, linesRes] = await Promise.all([
      this.client(credentials).get<VendSingleResponse<RawVendOutletConsignment>>(
        `/consignments/${id}`,
      ),
      this.client(credentials).get<VendListResponse<RawVendConsignmentProduct>>(
        `/consignments/${id}/products`,
        { page_size: DEFAULT_PAGE_SIZE },
      ),
    ])
    const raw: RawVendOutletConsignment = {
      ...consignment.data,
      consignment_products: linesRes.data ?? [],
    }
    return transformStockTransfer(raw)
  }

  // ── Stock Adjustments (STOCKTAKE consignments) ────────────────────────────
  // Vend v2.0 does not have a /stock-adjustments endpoint.  Inventory counts
  // (manual stock adjustments) are modelled as consignments with type=STOCKTAKE.

  async listStockAdjustments(credentials: Credentials, params: QueryParams): Promise<StockAdjustment[]> {
    const rows = await this.listByVersion<RawVendStockAdjustment>(
      credentials,
      '/consignments',
      params,
      { type: 'STOCKTAKE' },
    )
    return rows.map(transformStockAdjustment)
  }

  async getStockAdjustment(credentials: Credentials, id: string): Promise<StockAdjustment> {
    const [consignment, linesRes] = await Promise.all([
      this.client(credentials).get<VendSingleResponse<RawVendStockAdjustment>>(
        `/consignments/${id}`,
      ),
      this.client(credentials).get<VendListResponse<RawVendStockAdjustmentLine>>(
        `/consignments/${id}/products`,
        { page_size: DEFAULT_PAGE_SIZE },
      ),
    ])
    const raw: RawVendStockAdjustment = {
      ...consignment.data,
      consignment_products: linesRes.data ?? [],
    }
    return transformStockAdjustment(raw)
  }
}

/**
 * The rows of a v2.0 list body: the `{ data, version }` envelope, or the bare
 * array the legacy /consignments reference documents as its 200 schema.
 */
function listRows<R>(body: VendListResponse<R> | R[] | null | undefined): R[] {
  if (Array.isArray(body)) return body
  return body?.data ?? []
}

/**
 * Where the page after this one starts: past version `after`. A `stuck`
 * cursor marks a full page the keyset could not move past, so the rows after
 * it cannot be asked for (see {@link nextCursor}).
 */
interface VersionCursor {
  after: number
  stuck?: true
}

/**
 * The cursor that starts the page following `rows`, or `undefined` at the
 * end of the collection. `after` is the version this page was asked for
 * rows above, with page 1 at 0.
 *
 * An empty collection is the documented end. Otherwise the next `after` is
 * the envelope's `version.max`, or the highest row `version` where there is
 * no envelope (the bare consignments array).
 *
 * A version that does not move past `after` cannot be sent: the same request
 * would return these rows again. The date-versioned supplier reference shows
 * exactly that, every row at "version": 0 under a { max: 0, min: 0 }
 * envelope. A short page like that is all the keyset can reach, so it ends
 * the walk. A full page may have rows after it that no `after` can reach.
 * Ending there would report a truncated collection as complete, so the page
 * is served with more to come and the next one refuses.
 */
function nextCursor<R>(
  body: VendListResponse<R> | R[] | null | undefined,
  rows: readonly R[],
  after: number,
  pageSize: number,
): VersionCursor | undefined {
  if (rows.length === 0) return undefined
  const envelopeMax = Array.isArray(body) ? undefined : body?.version?.max
  const next = isVersion(envelopeMax) ? envelopeMax : maxRowVersion(rows)
  if (next !== undefined && next > after) return { after: next }
  return rows.length < pageSize ? undefined : { after, stuck: true }
}

/**
 * Thrown before any request, as a refusal: nothing reached the platform, so
 * the circuit breaker is not charged, and the API answers 501 rather than
 * serving a page again or an end that is not one.
 */
function cannotPagePast(path: string, after: number): Error {
  return Object.assign(
    new Error(
      `vend-pos cannot page GET ${path} past version ${after}: the previous page was full ` +
        `and no row on it had a version above ${after}, and API 2.0 moves forward only by ` +
        '`after`, a version.',
    ),
    { statusCode: 501, code: 'NOT_SUPPORTED' },
  )
}

function maxRowVersion(rows: readonly unknown[]): number | undefined {
  let max: number | undefined
  for (const row of rows) {
    const v = (row as { version?: unknown } | null)?.version
    if (isVersion(v) && (max === undefined || v > max)) max = v
  }
  return max
}

function isVersion(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}
