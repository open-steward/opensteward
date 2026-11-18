/**
 * Tecsys OrderDynamics adapter for the inventory vertical.
 *
 * Tecsys OrderDynamics (OmniOMS) is a cloud-native order and inventory
 * management platform by Tecsys Inc., secured via Azure Active Directory
 * OAuth2 client_credentials. The REST API is hosted on Azure API Management
 * at https://api.orderdynamics.net/v1/.
 *
 * Supported resources: products, stock-levels, locations, purchase-orders.
 * Not supported (endpoints not publicly documented): suppliers,
 * stock-transfers, stock-adjustments. Callers of those methods receive a
 * clear unsupported error so the platform layer can skip them gracefully.
 *
 * Webhooks: Tecsys OrderDynamics does not publish a documented HMAC/JWT
 * webhook-signing scheme, so verifyWebhook and parseWebhookEvents are omitted.
 *
 * Pagination: pageSize (max 100) + pageNumber (1-indexed) query parameters.
 * The response is a plain JSON array; stop when the array length < pageSize.
 */
import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { InventoryAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { StockLevel } from '../../schema/stock-level'
import type { Location } from '../../schema/location'
import type { PurchaseOrder } from '../../schema/purchase-order'

import {credentialFields, exchangeCredentials, getAuthUrl, refreshCredentials} from './auth'
import {TecsysClient} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'

import {transformProduct, type RawTecsysProduct} from './transform/product'
import {transformStockLevel, type RawTecsysStockLevel} from './transform/stock-level'
import {transformLocation, type RawTecsysLocation} from './transform/location'
import {transformPurchaseOrder, type RawTecsysPurchaseOrder} from './transform/purchase-order'

export interface TecsysAdapterConfig {
  /** Provided for interface compatibility; unused (no pre-configured OAuth app needed). */
  clientId?: string
  clientSecret?: string
}

export class TecsysAdapter implements InventoryAdapter {
  readonly platform = 'tecsys'
  readonly version = '0.1.0'

  constructor(_config?: TecsysAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return credentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return exchangeCredentials(fields)
  }

  getAuthUrl(state: string, scopes?: string[]): string {
    return getAuthUrl(state, scopes)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error(
      'tecsys: uses client_credentials OAuth2 (Azure AD); use credentialFields() + exchangeCredentials() instead',
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshCredentials(credentials)
  }

  private client(credentials: Credentials): TecsysClient {
    return new TecsysClient(credentials)
  }

  private pageParams(params: QueryParams): Record<string, unknown> {
    return {
      pageSize: params.limit ?? DEFAULT_PAGE_SIZE,
      ...(params.page ? { pageNumber: params.page } : {}),
    }
  }

  // ── Products ───────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).get<RawTecsysProduct[]>(
      '/items',
      this.pageParams(params),
    )
    return (Array.isArray(res) ? res : []).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).get<RawTecsysProduct>(`/items/${encodeURIComponent(id)}`)
    return transformProduct(res)
  }

  // ── Stock Levels ──────────────────────────────────────────────────────────

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    // BulkOnhand returns per-SKU per-location inventory; no single-record endpoint.
    const res = await this.client(credentials).get<RawTecsysStockLevel[]>(
      '/inventory/BulkOnhand',
      this.pageParams(params),
    )
    return (Array.isArray(res) ? res : []).map(transformStockLevel)
  }

  async getStockLevel(_credentials: Credentials, id: string): Promise<StockLevel> {
    throw new Error(
      `tecsys: stock-level fetch is bulk-only; call listStockLevels and filter client-side. id=${id}`,
    )
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const res = await this.client(credentials).get<RawTecsysLocation[]>(
      '/inventorylocations',
      this.pageParams(params),
    )
    return (Array.isArray(res) ? res : []).map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const res = await this.client(credentials).get<RawTecsysLocation>(
      `/inventorylocations/${encodeURIComponent(id)}`,
    )
    return transformLocation(res)
  }

  // ── Purchase Orders ───────────────────────────────────────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const res = await this.client(credentials).get<RawTecsysPurchaseOrder[]>(
      '/orders',
      { ...this.pageParams(params), orderType: 'PurchaseOrder' },
    )
    return (Array.isArray(res) ? res : []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const res = await this.client(credentials).get<RawTecsysPurchaseOrder>(
      `/orders/${encodeURIComponent(id)}`,
    )
    return transformPurchaseOrder(res)
  }
}
