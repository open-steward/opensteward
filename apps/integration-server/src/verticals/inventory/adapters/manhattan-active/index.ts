/**
 * Manhattan Active WM adapter — inventory vertical.
 *
 * Manhattan Active® Warehouse Management is a cloud-native WMS built on
 * microservices (~20,000 REST endpoints).  This adapter covers the core
 * inventory resources available via the WM REST v1 API.
 *
 * Auth: OAuth 2.0 Resource Owner Password Credentials Grant.
 *   Token endpoint: https://<env>-auth.omni.manh.com/oauth/token
 *   API base:       https://<env>.omni.manh.com/api
 *
 * Credential fields: environment, clientId, clientSecret, username, password.
 *
 * Supported resources:
 *   - products (items)
 *   - stock levels (per-item inventory by location)
 *   - locations
 *   - suppliers
 *   - purchase orders
 *   - stock transfers (inventory transfers)
 *   - stock adjustments (inventory adjustments)
 *
 * Webhooks: Manhattan Active WM does not expose a documented public webhook
 *   signature scheme.  verifyWebhook / parseWebhookEvents are not implemented.
 *
 * Reference: https://developer.manh.com/docs/how-to/rest-api/
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

import {credentialFields as manhattanActiveCredentialFields, exchangeCredentials as manhattanActiveExchangeCredentials, refreshCredentials as manhattanActiveRefreshCredentials} from './auth'
import {ManhattanActiveClient} from './client'
import {DEFAULT_PAGE_SIZE, PATHS} from './constants'

import {transformProduct, type RawManhattanActiveItem} from './transform/product'
import {transformStockLevel, type RawManhattanActiveInventory} from './transform/stock-level'
import {transformLocation, type RawManhattanActiveLocation} from './transform/location'
import {transformSupplier, type RawManhattanActiveSupplier} from './transform/supplier'
import {transformPurchaseOrder, type RawManhattanActivePurchaseOrder} from './transform/purchase-order'
import {transformStockTransfer, type RawManhattanActiveTransfer} from './transform/stock-transfer'
import {transformStockAdjustment, type RawManhattanActiveAdjustment} from './transform/stock-adjustment'

export interface ManhattanActiveAdapterConfig {
  /** Passed through to auth for token refresh; stored securely by the platform. */
  clientSecret?: string
}

// ── Paginated list response envelope ────────────────────────────────────────
interface PagedResponse<T> {
  content?: T[]
  /** Total number of records across all pages. */
  totalElements?: number
  totalPages?: number
  pageNumber?: number
  pageSize?: number
  // Some endpoints use a flat array at data[]
  data?: T[]
}

export class ManhattanActiveAdapter implements InventoryAdapter {
  readonly platform = 'manhattan-active'
  readonly version = '0.1.0'

  private readonly clientSecret: string

  constructor(config: ManhattanActiveAdapterConfig = {}) {
    this.clientSecret = config.clientSecret ?? ''
  }

  // ── Credential / auth lifecycle ───────────────────────────────────────────

  credentialFields(): CredentialField[] {
    return manhattanActiveCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return manhattanActiveExchangeCredentials(fields)
  }

  /** Manhattan Active uses Resource Owner Password Credentials — no redirect URL. */
  getAuthUrl(_state: string, _scopes?: string[]): string {
    throw new Error('manhattan-active uses Resource Owner Password Credentials Grant; use credentialFields() instead')
  }

  /** Not used — no Authorization Code flow. */
  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('manhattan-active uses Resource Owner Password Credentials Grant; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return manhattanActiveRefreshCredentials(credentials, this.clientSecret)
  }

  // ── Client factory ────────────────────────────────────────────────────────

  private client(credentials: Credentials): ManhattanActiveClient {
    return new ManhattanActiveClient(credentials)
  }

  /** Build standard page/size query params. */
  private pageParams(params: QueryParams): Record<string, unknown> {
    return {
      pageSize: params.limit ?? DEFAULT_PAGE_SIZE,
      ...(params.page !== undefined ? { pageNumber: params.page } : {}),
    }
  }

  /** Unwrap a paged response — handles both content[] and data[] envelopes. */
  private items<T>(res: PagedResponse<T>): T[] {
    return res.content ?? res.data ?? []
  }

  // ── Products (items) ──────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).get<PagedResponse<RawManhattanActiveItem>>(
      PATHS.items,
      this.pageParams(params),
    )
    return this.items(res).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const raw = await this.client(credentials).get<RawManhattanActiveItem>(`${PATHS.items}/${id}`)
    return transformProduct(raw)
  }

  // ── Stock levels ──────────────────────────────────────────────────────────
  //
  // Manhattan Active WM exposes inventory per item, scoped to a location.
  // listStockLevels pages through all items and fetches inventory for each;
  // for a production integration, callers should supply a productId filter
  // via QueryParams.filter.

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    // If a specific item is requested (params.filter?.itemId), fetch directly.
    const filter = (params as QueryParams & { filter?: Record<string, string> }).filter
    if (filter?.['itemId']) {
      const res = await this.client(credentials).get<PagedResponse<RawManhattanActiveInventory>>(
        PATHS.itemInventory(filter['itemId']),
        this.pageParams(params),
      )
      return this.items(res).map(transformStockLevel)
    }
    // Otherwise, fetch inventory summary across all items at the items level.
    // Some Manhattan Active deployments expose a flat inventory endpoint.
    const res = await this.client(credentials).get<PagedResponse<RawManhattanActiveInventory>>(
      '/wm/v1/inventory',
      this.pageParams(params),
    )
    return this.items(res).map(transformStockLevel)
  }

  async getStockLevel(credentials: Credentials, id: string): Promise<StockLevel> {
    // id is expected in the format "itemId:locationId"
    const [itemId, locationId] = id.split(':')
    if (!itemId || !locationId) {
      throw new Error(`manhattan-active: getStockLevel id must be "itemId:locationId", got "${id}"`)
    }
    const res = await this.client(credentials).get<PagedResponse<RawManhattanActiveInventory>>(
      PATHS.itemInventory(itemId),
      { locationId },
    )
    const entries = this.items(res)
    const entry = entries.find((e) => e.locationId === locationId) ?? entries[0]
    if (!entry) throw new Error(`manhattan-active: stock level not found for ${id}`)
    return transformStockLevel(entry)
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const res = await this.client(credentials).get<PagedResponse<RawManhattanActiveLocation>>(
      PATHS.locations,
      this.pageParams(params),
    )
    return this.items(res).map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const raw = await this.client(credentials).get<RawManhattanActiveLocation>(`${PATHS.locations}/${id}`)
    return transformLocation(raw)
  }

  // ── Suppliers ─────────────────────────────────────────────────────────────

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const res = await this.client(credentials).get<PagedResponse<RawManhattanActiveSupplier>>(
      PATHS.suppliers,
      this.pageParams(params),
    )
    return this.items(res).map(transformSupplier)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const raw = await this.client(credentials).get<RawManhattanActiveSupplier>(`${PATHS.suppliers}/${id}`)
    return transformSupplier(raw)
  }

  // ── Purchase orders ───────────────────────────────────────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const res = await this.client(credentials).get<PagedResponse<RawManhattanActivePurchaseOrder>>(
      PATHS.purchaseOrders,
      this.pageParams(params),
    )
    return this.items(res).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const raw = await this.client(credentials).get<RawManhattanActivePurchaseOrder>(`${PATHS.purchaseOrders}/${id}`)
    return transformPurchaseOrder(raw)
  }

  // ── Stock transfers (inventory transfers) ─────────────────────────────────

  async listStockTransfers(credentials: Credentials, params: QueryParams): Promise<StockTransfer[]> {
    const res = await this.client(credentials).get<PagedResponse<RawManhattanActiveTransfer>>(
      PATHS.stockTransfers,
      this.pageParams(params),
    )
    return this.items(res).map(transformStockTransfer)
  }

  async getStockTransfer(credentials: Credentials, id: string): Promise<StockTransfer> {
    const raw = await this.client(credentials).get<RawManhattanActiveTransfer>(`${PATHS.stockTransfers}/${id}`)
    return transformStockTransfer(raw)
  }

  // ── Stock adjustments (inventory adjustments) ─────────────────────────────

  async listStockAdjustments(credentials: Credentials, params: QueryParams): Promise<StockAdjustment[]> {
    const res = await this.client(credentials).get<PagedResponse<RawManhattanActiveAdjustment>>(
      PATHS.stockAdjustments,
      this.pageParams(params),
    )
    return this.items(res).map(transformStockAdjustment)
  }

  async getStockAdjustment(credentials: Credentials, id: string): Promise<StockAdjustment> {
    const raw = await this.client(credentials).get<RawManhattanActiveAdjustment>(`${PATHS.stockAdjustments}/${id}`)
    return transformStockAdjustment(raw)
  }
}
