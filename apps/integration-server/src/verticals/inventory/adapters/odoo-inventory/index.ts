/**
 * Odoo Inventory adapter, on the shared Odoo client (@opensteward/shared
 * adapter/odoo): JSON-2 on Odoo 19+, External RPC (/jsonrpc execute_kw) on
 * 14–18, as the connection chooses.
 *
 * Docs: https://www.odoo.com/documentation/19.0/developer/reference/external_api.html
 *   "Post a JSON object at the /json/2/<model>/<method> URL."
 *
 * Models (fields quoted in each transform, from github.com/odoo/odoo 19.0):
 *   - Products        product.product        (addons/product)
 *   - Stock levels    stock.quant            (addons/stock), internal/transit locations
 *   - Locations       stock.location         (addons/stock)
 *   - Stock transfers stock.picking          (addons/stock), picking type code 'internal',
 *                     lines from stock.move
 *   - Purchase orders purchase.order         (addons/purchase), lines from purchase.order.line
 * Suppliers and stock adjustments have no Odoo model and are refused (501).
 *
 * Every list is one `search_read` page: "offset and limit parameters are
 * available to only retrieve a subset of all matched records" (19.0
 * external_rpc_api, Pagination), in id order, with search_count for the total.
 *
 * This adapter used to be a Cin7 Core clone (GET /productList, /ref/stockonhand
 * … against a hard-coded https://example.odoo.com/jsonrpc), which no Odoo
 * server answers. Connections made with its single-API-key form have no
 * baseUrl or apiVersion and are refused with a "reconnect" 401.
 */
import {
  ODOO_CREDENTIAL_FORM,
  OdooClient,
  pageOffset,
  reportUpstreamPage,
  type Credentials,
  type OdooDomain,
  type QueryParams,
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

import { DEFAULT_LIMIT } from './constants'
import { metadata } from './metadata'
import { verifyOdooInventoryWebhook, parseOdooInventoryWebhookEvents } from './webhook'
import { PRODUCT_FIELDS, transformProduct, type RawOdooProduct } from './transform/product'
import { QUANT_FIELDS, transformStockLevel, type RawOdooQuant } from './transform/stock-level'
import { LOCATION_FIELDS, transformLocation, type RawOdooLocation } from './transform/location'
import {
  MOVE_FIELDS,
  PICKING_FIELDS,
  transformStockTransfer,
  type RawOdooMove,
  type RawOdooPicking,
} from './transform/stock-transfer'
import {
  PURCHASE_LINE_FIELDS,
  PURCHASE_ORDER_FIELDS,
  transformPurchaseOrder,
  type RawOdooPurchaseLine,
  type RawOdooPurchaseOrder,
} from './transform/purchase-order'

/**
 * Stock on hand sits in internal and transit locations: "Internal: Physical
 * locations inside your warehouses", "Transit: Counterpart location that should
 * be used for inter-company or inter-warehouses operations"; the other usages
 * are virtual counterparts (stock_location.py usage help, 19.0).
 */
const QUANT_DOMAIN: OdooDomain = [['location_id.usage', 'in', ['internal', 'transit']]]
/** stock.picking.type `code` 'internal' is "Internal Transfer" (stock_picking.py, 19.0). */
const TRANSFER_DOMAIN: OdooDomain = [['picking_type_id.code', '=', 'internal']]

export interface OdooInventoryAdapterConfig {
  /** Unused: the Odoo URL is per connection, in `credentials.extra.baseUrl` (the shared Odoo form). */
  instanceUrl?: string
}

function notFound(what: string, id: string): Error {
  return Object.assign(new Error(`Odoo: ${what} ${id} not found`), {
    statusCode: 404,
    code: 'NOT_FOUND',
  })
}

function notSupported(resource: (typeof metadata.unavailableResources)[number]['resource']): Error {
  const reason = metadata.unavailableResources.find((r) => r.resource === resource)!.reason
  return Object.assign(new Error(`odoo-inventory cannot read ${resource}s: ${reason}`), {
    statusCode: 501,
    code: 'NOT_SUPPORTED',
  })
}

/** Odoo record ids are integers; anything else names no record. */
function recordId(what: string, id: string): number {
  if (!/^[1-9]\d*$/.test(id)) throw notFound(what, id)
  return Number(id)
}

function pageLimit(params: QueryParams): number {
  const limit = params.limit ?? DEFAULT_LIMIT
  if (typeof limit !== 'number' || !Number.isFinite(limit) || limit < 1) {
    throw Object.assign(new Error(`Odoo: limit must be a number ≥ 1 (got ${String(limit)})`), {
      statusCode: 400,
      code: 'VALIDATION',
    })
  }
  return Math.floor(limit)
}

function byParent<T extends Record<K, unknown>, K extends string>(
  rows: T[],
  key: K,
): Map<number, T[]> {
  const out = new Map<number, T[]>()
  for (const r of rows) {
    const v = r[key]
    const id = Array.isArray(v) ? v[0] : undefined
    if (typeof id !== 'number') continue
    const list = out.get(id) ?? []
    list.push(r)
    out.set(id, list)
  }
  return out
}

export class OdooInventoryAdapter implements InventoryAdapter {
  credentialFields = ODOO_CREDENTIAL_FORM.credentialFields
  exchangeCredentials = ODOO_CREDENTIAL_FORM.exchangeCredentials

  readonly platform = 'odoo-inventory'
  readonly version = '0.2.0'

  constructor(_config: OdooInventoryAdapterConfig = {}) {}

  getAuthUrl(_state: string, _scopes?: string[]): string {
    // Odoo authenticates with an API key; there is no OAuth2 redirect.
    return '#api-key-auth'
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('OdooInventoryAdapter: OAuth2 not supported. Use API key auth.')
  }

  /** An API key is sent as is on every call; there is nothing to refresh. */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyOdooInventoryWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseOdooInventoryWebhookEvents(payload)
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private client(credentials: Credentials): OdooClient {
    return new OdooClient(credentials)
  }

  private async pageOf<T>(
    credentials: Credentials,
    params: QueryParams,
    model: string,
    domain: OdooDomain,
    fields: string[],
  ): Promise<T[]> {
    const limit = pageLimit(params)
    const offset = pageOffset(params, limit)
    const page = await this.client(credentials).searchPage<T>(model, {
      domain,
      fields,
      offset,
      limit,
    })
    reportUpstreamPage(params, {
      hasMore: page.hasMore,
      ...(page.totalCount !== undefined ? { totalCount: page.totalCount } : {}),
    })
    return page.rows
  }

  /** One record by id with `read` (no default active filter), or a 404. */
  private async one<T>(
    credentials: Credentials,
    what: string,
    model: string,
    id: string,
    fields: string[],
  ): Promise<T> {
    const rows = await this.client(credentials).read<T>(model, [recordId(what, id)], fields)
    const row = rows[0]
    if (!row) throw notFound(what, id)
    return row
  }

  private async movesOf(
    credentials: Credentials,
    ids: number[],
  ): Promise<Map<number, RawOdooMove[]>> {
    if (ids.length === 0) return new Map()
    const rows = await this.client(credentials).searchRead<RawOdooMove>('stock.move', {
      domain: [['picking_id', 'in', ids]],
      fields: MOVE_FIELDS,
      order: 'id asc',
    })
    return byParent(rows as (RawOdooMove & Record<'picking_id', unknown>)[], 'picking_id')
  }

  private async linesOf(
    credentials: Credentials,
    ids: number[],
  ): Promise<Map<number, RawOdooPurchaseLine[]>> {
    if (ids.length === 0) return new Map()
    const rows = await this.client(credentials).searchRead<RawOdooPurchaseLine>(
      'purchase.order.line',
      {
        domain: [
          ['order_id', 'in', ids],
          ['display_type', '=', false],
        ],
        fields: PURCHASE_LINE_FIELDS,
        order: 'id asc',
      },
    )
    return byParent(rows as (RawOdooPurchaseLine & Record<'order_id', unknown>)[], 'order_id')
  }

  // ── Products (product.product) ─────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const rows = await this.pageOf<RawOdooProduct>(
      credentials,
      params,
      'product.product',
      [],
      PRODUCT_FIELDS,
    )
    return rows.map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    return transformProduct(
      await this.one<RawOdooProduct>(credentials, 'product', 'product.product', id, PRODUCT_FIELDS),
    )
  }

  // ── Stock levels (stock.quant) ─────────────────────────────────────────────

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const rows = await this.pageOf<RawOdooQuant>(
      credentials,
      params,
      'stock.quant',
      QUANT_DOMAIN,
      QUANT_FIELDS,
    )
    return rows.map(transformStockLevel)
  }

  async getStockLevel(credentials: Credentials, id: string): Promise<StockLevel> {
    return transformStockLevel(
      await this.one<RawOdooQuant>(credentials, 'stock level', 'stock.quant', id, QUANT_FIELDS),
    )
  }

  // ── Locations (stock.location) ─────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const rows = await this.pageOf<RawOdooLocation>(
      credentials,
      params,
      'stock.location',
      [],
      LOCATION_FIELDS,
    )
    return rows.map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    return transformLocation(
      await this.one<RawOdooLocation>(
        credentials,
        'location',
        'stock.location',
        id,
        LOCATION_FIELDS,
      ),
    )
  }

  // ── Stock transfers (stock.picking, internal) ─────────────────────────────

  async listStockTransfers(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<StockTransfer[]> {
    const rows = await this.pageOf<RawOdooPicking>(
      credentials,
      params,
      'stock.picking',
      TRANSFER_DOMAIN,
      PICKING_FIELDS,
    )
    const moves = await this.movesOf(
      credentials,
      rows.map((r) => r.id),
    )
    return rows.map((r) => transformStockTransfer(r, moves.get(r.id) ?? []))
  }

  async getStockTransfer(credentials: Credentials, id: string): Promise<StockTransfer> {
    const row = await this.one<RawOdooPicking>(
      credentials,
      'stock transfer',
      'stock.picking',
      id,
      PICKING_FIELDS,
    )
    // A receipt or delivery is a picking too, but not a transfer.
    if (row.picking_type_code !== 'internal') throw notFound('stock transfer', id)
    const moves = await this.movesOf(credentials, [row.id])
    return transformStockTransfer(row, moves.get(row.id) ?? [])
  }

  // ── Purchase orders (purchase.order) ───────────────────────────────────────

  async listPurchaseOrders(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PurchaseOrder[]> {
    const rows = await this.pageOf<RawOdooPurchaseOrder>(
      credentials,
      params,
      'purchase.order',
      [],
      PURCHASE_ORDER_FIELDS,
    )
    const lines = await this.linesOf(
      credentials,
      rows.map((r) => r.id),
    )
    return rows.map((r) => transformPurchaseOrder(r, lines.get(r.id) ?? []))
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const row = await this.one<RawOdooPurchaseOrder>(
      credentials,
      'purchase order',
      'purchase.order',
      id,
      PURCHASE_ORDER_FIELDS,
    )
    const lines = await this.linesOf(credentials, [row.id])
    return transformPurchaseOrder(row, lines.get(row.id) ?? [])
  }

  // ── Refused: no Odoo model ─────────────────────────────────────────────────

  async listSuppliers(_credentials: Credentials, _params: QueryParams): Promise<Supplier[]> {
    throw notSupported('supplier')
  }

  async getSupplier(_credentials: Credentials, _id: string): Promise<Supplier> {
    throw notSupported('supplier')
  }

  async listStockAdjustments(
    _credentials: Credentials,
    _params: QueryParams,
  ): Promise<StockAdjustment[]> {
    throw notSupported('stock-adjustment')
  }

  async getStockAdjustment(_credentials: Credentials, _id: string): Promise<StockAdjustment> {
    throw notSupported('stock-adjustment')
  }
}
