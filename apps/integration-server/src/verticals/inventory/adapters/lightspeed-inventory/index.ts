/**
 * Lightspeed Retail (X-Series) inventory adapter.
 *
 * Formerly "Vend". Cloud-based retail POS with multi-outlet inventory.
 * Auth: OAuth2 Authorization Code Grant (RFC 6749).
 *
 * Base URL: https://{domain_prefix}.retail.lightspeed.app/api/2.0
 * The domain_prefix is stored in credentials.extra.domainPrefix after OAuth exchange.
 *
 * Pagination: the API 2.0 version keyset — each response's `version.max` is the
 * next page's `after`, until an empty collection. Every list serves ONE caller
 * page per call (page `params.page` at `page_size = params.limit`) through
 * `LightspeedInventoryClient.listPage`, and reports `hasMore`. `maxPageSize` is
 * 200: API 2.0 documents no hard maximum, but 200 is its default page and
 * Lightspeed advises against asking for more (see `constants.ts`).
 *
 * Supported resources:
 *   - products        (GET /products)
 *   - stock levels    (GET /inventory)
 *   - locations       (GET /outlets)
 *   - suppliers       (GET /suppliers)
 *   - purchase orders (GET /consignments?type=SUPPLIER)
 *   - stock transfers (GET /consignments?type=OUTLET)
 *   - stock adjusts   (GET /consignments?type=STOCKTAKE)
 *   - webhooks        (HMAC-SHA256, X-Signature header)
 *
 * Schema-firewall: no product images, no supplier banking details, no BOM.
 */
import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { InventoryAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { StockLevel } from '../../schema/stock-level'
import type { Location } from '../../schema/location'
import type { Supplier } from '../../schema/supplier'
import type { PurchaseOrder } from '../../schema/purchase-order'
import type { StockTransfer } from '../../schema/stock-transfer'
import type { StockAdjustment } from '../../schema/stock-adjustment'
import type { WebhookEvent } from '../../schema/webhook'

import {
  getAuthUrl as lsGetAuthUrl,
  exchangeCode as lsExchangeCode,
  refreshCredentials as lsRefreshCredentials,
  credentialFields as lsCredentialFields,
} from './auth'
import {LightspeedInventoryClient} from './client'
import {MAX_PAGE_SIZE} from './constants'
import {verifyLightspeedWebhook, parseLightspeedWebhookEvents} from './webhook'

import {transformProduct, type RawLightspeedProduct} from './transform/product'
import {transformStockLevel, type RawLightspeedInventoryRecord} from './transform/stock-level'
import {transformLocation, type RawLightspeedOutlet} from './transform/location'
import {transformSupplier, type RawLightspeedSupplier} from './transform/supplier'
import {transformPurchaseOrder, type RawLightspeedConsignment} from './transform/purchase-order'
import {transformStockTransfer} from './transform/stock-transfer'
import {transformStockAdjustment} from './transform/stock-adjustment'

export interface LightspeedInventoryAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string
}

export class LightspeedInventoryAdapter implements InventoryAdapter {
  readonly platform = 'lightspeed-inventory'
  readonly version = '0.1.0'
  /** Every list pages through `LightspeedInventoryClient.listPage`, which reports `hasMore`. */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  private config: LightspeedInventoryAdapterConfig

  constructor(config: LightspeedInventoryAdapterConfig) {
    this.config = config
  }

  credentialFields(): CredentialField[] {
    return lsCredentialFields()
  }

  async exchangeCredentials(_fields: Record<string, string>): Promise<Credentials> {
    throw new Error('lightspeed-inventory uses OAuth2; call getAuthUrl() + exchangeCode() instead')
  }

  getAuthUrl(state: string, scopes?: string[]): string {
    return lsGetAuthUrl(
      this.config.clientId,
      this.config.redirectUri,
      state,
      scopes?.join(' ') ?? this.config.scopes,
    )
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return lsExchangeCode(code, redirectUri, this.config.clientId, this.config.clientSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return lsRefreshCredentials(credentials, this.config.clientId, this.config.clientSecret)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyLightspeedWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseLightspeedWebhookEvents(payload)
  }

  private client(credentials: Credentials): LightspeedInventoryClient {
    return new LightspeedInventoryClient(credentials)
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const items = await this.client(credentials).listPage<RawLightspeedProduct>(
      '/products',
      params,
    )
    return items.map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).get<{ data?: RawLightspeedProduct }>(`/products/${id}`)
    if (!res.data) throw new Error(`lightspeed-inventory product ${id} not found`)
    return transformProduct(res.data)
  }

  // ── Stock Levels ─────────────────────────────────────────────────────────

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const items = await this.client(credentials).listPage<RawLightspeedInventoryRecord>(
      '/inventory',
      params,
    )
    return items.map(transformStockLevel)
  }

  async getStockLevel(_credentials: Credentials, id: string): Promise<StockLevel> {
    // X-Series inventory records are keyed by (product_id, outlet_id); there is no
    // single-record GET by a combined UUID. Callers should use listStockLevels.
    throw new Error(`lightspeed-inventory stock-level fetch is bulk-only; call listStockLevels. id=${id}`)
  }

  // ── Locations (Outlets) ──────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const items = await this.client(credentials).listPage<RawLightspeedOutlet>(
      '/outlets',
      params,
    )
    return items.map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const res = await this.client(credentials).get<{ data?: RawLightspeedOutlet }>(`/outlets/${id}`)
    if (!res.data) throw new Error(`lightspeed-inventory outlet ${id} not found`)
    return transformLocation(res.data)
  }

  // ── Suppliers ────────────────────────────────────────────────────────────

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const items = await this.client(credentials).listPage<RawLightspeedSupplier>(
      '/suppliers',
      params,
    )
    return items.map(transformSupplier)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const res = await this.client(credentials).get<{ data?: RawLightspeedSupplier }>(`/suppliers/${id}`)
    if (!res.data) throw new Error(`lightspeed-inventory supplier ${id} not found`)
    return transformSupplier(res.data)
  }

  // ── Purchase Orders (Consignments type=SUPPLIER) ─────────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const items = await this.client(credentials).listPage<RawLightspeedConsignment>(
      '/consignments',
      params,
      { type: 'SUPPLIER' },
    )
    return items.map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const res = await this.client(credentials).get<{ data?: RawLightspeedConsignment }>(`/consignments/${id}`)
    if (!res.data) throw new Error(`lightspeed-inventory consignment ${id} not found`)
    return transformPurchaseOrder(res.data)
  }

  // ── Stock Transfers (Consignments type=OUTLET) ───────────────────────────

  async listStockTransfers(credentials: Credentials, params: QueryParams): Promise<StockTransfer[]> {
    const items = await this.client(credentials).listPage<RawLightspeedConsignment>(
      '/consignments',
      params,
      { type: 'OUTLET' },
    )
    return items.map(transformStockTransfer)
  }

  async getStockTransfer(credentials: Credentials, id: string): Promise<StockTransfer> {
    const res = await this.client(credentials).get<{ data?: RawLightspeedConsignment }>(`/consignments/${id}`)
    if (!res.data) throw new Error(`lightspeed-inventory consignment ${id} not found`)
    return transformStockTransfer(res.data)
  }

  // ── Stock Adjustments (Consignments type=STOCKTAKE) ──────────────────────

  async listStockAdjustments(credentials: Credentials, params: QueryParams): Promise<StockAdjustment[]> {
    const items = await this.client(credentials).listPage<RawLightspeedConsignment>(
      '/consignments',
      params,
      { type: 'STOCKTAKE' },
    )
    return items.map(transformStockAdjustment)
  }

  async getStockAdjustment(credentials: Credentials, id: string): Promise<StockAdjustment> {
    const res = await this.client(credentials).get<{ data?: RawLightspeedConsignment }>(`/consignments/${id}`)
    if (!res.data) throw new Error(`lightspeed-inventory consignment ${id} not found`)
    return transformStockAdjustment(res.data)
  }
}
