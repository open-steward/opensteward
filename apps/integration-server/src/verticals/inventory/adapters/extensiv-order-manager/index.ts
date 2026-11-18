/**
 * Extensiv Order Manager adapter (formerly Skubana).
 *
 * Multi-channel order management + warehouse inventory.
 * Auth: OAuth2 authorization_code via app.skubana.com/oauth/token.
 * API: https://api.skubana.com — page+limit pagination, Bearer token.
 * Schema-firewall: no product images, no supplier banking, no manufacturing BOM.
 *
 * Supported resources: products, stock-levels (aggregate + per-warehouse),
 *   locations (warehouses), suppliers (vendors), purchase-orders, stock-transfers.
 * Not supported: stock-adjustments (no API endpoint exists).
 * Webhooks: not implemented (Extensiv Order Manager does not document HMAC signing).
 *
 * ── Resource coverage ──────────────────────────────────────────────────────
 * Unavailable: stock-adjustment — Extensiv Order Manager API has no endpoint
 *   to list or retrieve inventory adjustment records; the only inventory-write
 *   surface is POST /service/v1.2/inventory/acknowledge (channel-listing
 *   acknowledge), which does not expose adjustment history.
 */
import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { InventoryAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { StockLevel } from '../../schema/stock-level'
import type { Location } from '../../schema/location'
import type { Supplier } from '../../schema/supplier'
import type { PurchaseOrder } from '../../schema/purchase-order'
import type { StockTransfer } from '../../schema/stock-transfer'

import {credentialFields as authCredentialFields, getAuthUrl as buildAuthUrl, exchangeCode as authExchangeCode, refreshToken} from './auth'
import {ExtensivOrderManagerClient} from './client'
import {DEFAULT_PAGE_SIZE, API_VERSION_V1, API_VERSION_V1_1} from './constants'

import {transformProduct, type RawExtensivProduct} from './transform/product'
import {transformProductStockTotal, type RawExtensivProductStockTotal} from './transform/stock-level'
import {transformLocation, type RawExtensivWarehouse} from './transform/location'
import {transformSupplier, type RawExtensivVendor} from './transform/supplier'
import {transformPurchaseOrder, type RawExtensivPurchaseOrder} from './transform/purchase-order'
import {transformStockTransfer, type RawExtensivStockTransfer} from './transform/stock-transfer'

export interface ExtensivOrderManagerAdapterConfig {
  appKey: string
  appSecret: string
  redirectUri: string
}

export class ExtensivOrderManagerAdapter implements InventoryAdapter {
  readonly platform = 'extensiv-order-manager'
  readonly version = '0.1.0'

  constructor(private readonly config: ExtensivOrderManagerAdapterConfig) {}

  // ── Auth ──────────────────────────────────────────────────────────────────

  credentialFields(): CredentialField[] {
    return authCredentialFields()
  }

  getAuthUrl(state: string): string {
    return buildAuthUrl(this.config.appKey, this.config.redirectUri, state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return authExchangeCode(code, this.config.appKey, this.config.appSecret, this.config.redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshToken(credentials)
  }

  // ── HTTP client ───────────────────────────────────────────────────────────

  private client(credentials: Credentials): ExtensivOrderManagerClient {
    return new ExtensivOrderManagerClient(credentials)
  }

  private pageParams(params: QueryParams): Record<string, unknown> {
    return {
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
      page: params.page ?? 1,
    }
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const items = await this.client(credentials).get<RawExtensivProduct[]>(
      `/api/${API_VERSION_V1_1}/products`,
      this.pageParams(params),
    )
    return (items ?? []).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const item = await this.client(credentials).get<RawExtensivProduct>(
      `/api/${API_VERSION_V1_1}/products/${id}`,
    )
    if (!item) throw new Error(`extensiv-order-manager: product ${id} not found`)
    return transformProduct(item)
  }

  // ── Stock Levels ──────────────────────────────────────────────────────────

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const items = await this.client(credentials).get<RawExtensivProductStockTotal[]>(
      `/api/${API_VERSION_V1}/productstocks/total`,
      this.pageParams(params),
    )
    return (items ?? []).map(transformProductStockTotal)
  }

  async getStockLevel(_credentials: Credentials, id: string): Promise<StockLevel> {
    throw new Error(`extensiv-order-manager: stock-level fetch is aggregate-only; call listStockLevels. id=${id}`)
  }

  // ── Locations (Warehouses) ─────────────────────────────────────────────────

  async listLocations(credentials: Credentials, _params: QueryParams): Promise<Location[]> {
    // warehouses endpoint is single-page (no pagination)
    const items = await this.client(credentials).get<RawExtensivWarehouse[]>(
      `/api/${API_VERSION_V1}/warehouses`,
    )
    return (items ?? []).map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const item = await this.client(credentials).get<RawExtensivWarehouse>(
      `/api/${API_VERSION_V1}/warehouses/${id}`,
    )
    if (!item) throw new Error(`extensiv-order-manager: warehouse ${id} not found`)
    return transformLocation(item)
  }

  // ── Suppliers (Vendors) ───────────────────────────────────────────────────

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const items = await this.client(credentials).get<RawExtensivVendor[]>(
      `/api/${API_VERSION_V1}/vendors`,
      this.pageParams(params),
    )
    return (items ?? []).map(transformSupplier)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const item = await this.client(credentials).get<RawExtensivVendor>(
      `/api/${API_VERSION_V1}/vendors/${id}`,
    )
    if (!item) throw new Error(`extensiv-order-manager: vendor ${id} not found`)
    return transformSupplier(item)
  }

  // ── Purchase Orders ───────────────────────────────────────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const items = await this.client(credentials).get<RawExtensivPurchaseOrder[]>(
      `/api/${API_VERSION_V1_1}/purchaseorders`,
      this.pageParams(params),
    )
    return (items ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const item = await this.client(credentials).get<RawExtensivPurchaseOrder>(
      `/api/${API_VERSION_V1_1}/purchaseorders/${id}`,
    )
    if (!item) throw new Error(`extensiv-order-manager: purchase order ${id} not found`)
    return transformPurchaseOrder(item)
  }

  // ── Stock Transfers ───────────────────────────────────────────────────────

  async listStockTransfers(credentials: Credentials, params: QueryParams): Promise<StockTransfer[]> {
    const items = await this.client(credentials).get<RawExtensivStockTransfer[]>(
      `/api/${API_VERSION_V1}/inventory/stocktransfers`,
      this.pageParams(params),
    )
    return (items ?? []).map(transformStockTransfer)
  }

  async getStockTransfer(credentials: Credentials, id: string): Promise<StockTransfer> {
    const item = await this.client(credentials).get<RawExtensivStockTransfer>(
      `/api/${API_VERSION_V1}/inventory/stocktransfers/${id}`,
    )
    if (!item) throw new Error(`extensiv-order-manager: stock transfer ${id} not found`)
    return transformStockTransfer(item)
  }
}
