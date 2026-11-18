/**
 * Boxstorm adapter for the inventory vertical.
 *
 * Boxstorm is the cloud-hosted edition of Fishbowl Advanced.
 * Auth: Bearer token (pre-generated API token or session token from POST /api/login).
 * Docs: https://help.fishbowlinventory.com/advanced/s/apidocs/
 *
 * Supported resources: products (parts), stock levels (inventory), vendors (suppliers),
 *                      purchase orders.
 * Not supported: stock transfers (write-only move endpoint), stock adjustments
 *                (write-only cycle endpoint), location list (no REST list endpoint
 *                in current Boxstorm API).
 * Webhooks: not implemented — Boxstorm does not document HMAC/JWT webhook signing.
 *
 * Schema-firewall: no product images, no supplier banking, no BOM/work orders.
 */
import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { InventoryAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { StockLevel } from '../../schema/stock-level'
import type { Supplier } from '../../schema/supplier'
import type { PurchaseOrder } from '../../schema/purchase-order'

import {credentialFields as boxstormCredentialFields, exchangeCredentials as boxstormExchangeCredentials, getAuthUrlUnsupported} from './auth'
import {BoxstormClient} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'

import {transformProduct, type RawBoxstormPart} from './transform/product'
import {transformStockLevel, type RawBoxstormInventory} from './transform/stock-level'
import {transformSupplier, type RawBoxstormVendor} from './transform/supplier'
import {transformPurchaseOrder, type RawBoxstormPurchaseOrder} from './transform/purchase-order'

export interface BoxstormAdapterConfig {
  /** No OAuth config needed; Boxstorm uses a pre-generated Bearer token. */
  _placeholder?: never
}

/** Standard paginated envelope returned by Boxstorm list endpoints. */
interface PagedResponse<T> {
  totalCount?: number
  totalPages?: number
  pageNumber?: number
  pageSize?: number
  results?: T[]
}

export class BoxstormAdapter implements InventoryAdapter {
  readonly platform = 'boxstorm'
  readonly version = '0.1.0'

  constructor(_config?: BoxstormAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return boxstormCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return boxstormExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('boxstorm uses a Bearer token; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Bearer tokens issued by Boxstorm are long-lived; nothing to refresh.
    return credentials
  }

  private client(credentials: Credentials): BoxstormClient {
    return new BoxstormClient(credentials)
  }

  private pageParams(params: QueryParams): Record<string, unknown> {
    return {
      pageSize: params.limit ?? DEFAULT_PAGE_SIZE,
      ...(params.page ? { pageNumber: params.page } : {}),
    }
  }

  // ── Products (parts) ───────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).get<PagedResponse<RawBoxstormPart>>('/parts', this.pageParams(params))
    return (res.results ?? []).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    // Fishbowl Advanced GET /api/parts returns a paged list; filter by id.
    const res = await this.client(credentials).get<PagedResponse<RawBoxstormPart>>('/parts', { pageSize: 1, id })
    const item = res.results?.[0]
    if (!item) throw new Error(`boxstorm part ${id} not found`)
    return transformProduct(item)
  }

  // ── Stock Levels (inventory) ───────────────────────────────────────────────

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const res = await this.client(credentials).get<PagedResponse<RawBoxstormInventory>>('/parts/inventory', this.pageParams(params))
    return (res.results ?? []).map(transformStockLevel)
  }

  async getStockLevel(_credentials: Credentials, id: string): Promise<StockLevel> {
    throw new Error(`boxstorm stock-level fetch is bulk-only; call listStockLevels. id=${id}`)
  }

  // ── Suppliers (vendors) ────────────────────────────────────────────────────

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const res = await this.client(credentials).get<PagedResponse<RawBoxstormVendor>>('/vendors', this.pageParams(params))
    return (res.results ?? []).map(transformSupplier)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const res = await this.client(credentials).get<RawBoxstormVendor>(`/vendors/${id}`)
    return transformSupplier(res)
  }

  // ── Purchase Orders ────────────────────────────────────────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const res = await this.client(credentials).get<PagedResponse<RawBoxstormPurchaseOrder>>('/purchase-orders', this.pageParams(params))
    return (res.results ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const res = await this.client(credentials).get<RawBoxstormPurchaseOrder>(`/purchase-orders/${id}`)
    return transformPurchaseOrder(res)
  }
}
