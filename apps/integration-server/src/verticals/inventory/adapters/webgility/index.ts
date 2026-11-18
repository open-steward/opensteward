/**
 * Webgility Connect adapter for the inventory vertical.
 *
 * Webgility Connect is an ecommerce-to-accounting integration platform that
 * syncs orders, items, and vendors from online channels to QuickBooks / Xero.
 *
 * Auth: appKey + appSecret → POST /v1/appusers → AccessToken (Bearer).
 * Schema-firewall: no stock-level breakdowns by location, no stock transfers,
 * no stock adjustments (Webgility Connect has no dedicated inventory endpoints).
 *
 * Supported resources:
 *   - Products  (GET /v1/items)
 *   - StockLevels  (synthetic, derived from Item.QBQtyOnHand)
 *   - Suppliers (GET /v1/vendors)
 *   - PurchaseOrders (GET /v1/invoices — AP invoices mapped to PO schema)
 *
 * Ref: https://github.com/webgility/connect-v1.0/wiki
 */
import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { InventoryAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { StockLevel } from '../../schema/stock-level'
import type { Supplier } from '../../schema/supplier'
import type { PurchaseOrder } from '../../schema/purchase-order'

import {
  credentialFields as webgilityCredentialFields,
  exchangeCredentials as webgilityExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import {WebgilityClient} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'

import {transformProduct, type RawWebgilityItem} from './transform/product'
import {transformStockLevel} from './transform/stock-level'
import {transformSupplier, type RawWebgilityVendor} from './transform/supplier'
import {transformPurchaseOrder, type RawWebgilityInvoice} from './transform/purchase-order'

export interface WebgilityAdapterConfig {
  /** No additional constructor config required; credentials drive everything. */
  _placeholder?: never
}

/** GET /v1/items response wrapper */
interface ItemsListResponse {
  Items?: RawWebgilityItem[]
}

/** GET /v1/vendors response wrapper */
interface VendorsListResponse {
  Vendors?: RawWebgilityVendor[]
}

/** GET /v1/invoices response wrapper */
interface InvoicesListResponse {
  Invoices?: RawWebgilityInvoice[]
}

export class WebgilityAdapter implements InventoryAdapter {
  readonly platform = 'webgility'
  readonly version = '0.1.0'

  constructor(_config?: WebgilityAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return webgilityCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>) {
    return webgilityExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('webgility uses appKey + appSecret; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // AccessToken is long-lived; no refresh endpoint documented.
    return credentials
  }

  private client(credentials: Credentials): WebgilityClient {
    return new WebgilityClient(credentials)
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const res = await this.client(credentials).get<ItemsListResponse>('/items', { limit })
    return (res.Items ?? []).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const raw = await this.client(credentials).get<RawWebgilityItem>(`/items/${id}`)
    return transformProduct(raw)
  }

  // ── Stock Levels (synthetic from Items.QBQtyOnHand) ──────────────────────

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const res = await this.client(credentials).get<ItemsListResponse>('/items', { limit })
    return (res.Items ?? [])
      .filter((item) => item.TrackInventory === true)
      .map(transformStockLevel)
  }

  async getStockLevel(_credentials: Credentials, id: string): Promise<StockLevel> {
    throw new Error(
      `webgility stock-level fetch is bulk-only (derived from /items); call listStockLevels. id=${id}`,
    )
  }

  // ── Suppliers ─────────────────────────────────────────────────────────────

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const res = await this.client(credentials).get<VendorsListResponse>('/vendors', { limit })
    return (res.Vendors ?? []).map(transformSupplier)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const raw = await this.client(credentials).get<RawWebgilityVendor>(`/vendors/${id}`)
    return transformSupplier(raw)
  }

  // ── Purchase Orders (mapped from Invoices / AP bills) ────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const res = await this.client(credentials).get<InvoicesListResponse>('/invoices', { limit })
    return (res.Invoices ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const raw = await this.client(credentials).get<RawWebgilityInvoice>(`/invoices/${id}`)
    return transformPurchaseOrder(raw)
  }
}
