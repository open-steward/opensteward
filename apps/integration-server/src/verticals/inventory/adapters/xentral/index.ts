/**
 * Xentral ERP inventory adapter.
 *
 * Xentral is a German ERP platform for scaling e-commerce businesses.
 * Base URL: https://{xentralId}.xentral.biz  (one subdomain per tenant)
 * Auth: Personal Access Token (Bearer) + instance subdomain in credentials.extra.
 * API: REST V1 — https://developer.xentral.com/reference/rest-api
 *
 * Supported resources:
 *   - Products       → GET /api/v1/products  /  GET /api/v1/products/{id}
 *   - Stock levels   → GET /api/v1/products/{id}/stocks  (per-warehouse breakdown)
 *   - Locations      → GET /api/v1/warehouses  (warehouse-level; no single GET by id)
 *   - Suppliers      → GET /api/v1/suppliers  /  GET /api/v1/suppliers/{id}
 *   - Purchase orders→ GET /api/v1/purchaseOrders  /  GET /api/v1/purchaseOrders/{id}
 *
 * Not supported (no read endpoint in V1 public spec; auto-501 via absent optional methods):
 *   stock-transfers, stock-adjustments, webhooks (no HMAC/JWT signing documented).
 *
 * Schema-firewall: no product images, no supplier banking, BOM refused.
 */
import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { InventoryAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { StockLevel } from '../../schema/stock-level'
import type { Location } from '../../schema/location'
import type { Supplier } from '../../schema/supplier'
import type { PurchaseOrder } from '../../schema/purchase-order'

import {credentialFields, exchangeCredentials, getAuthUrlUnsupported} from './auth'
import {XentralClient} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'

import {transformProduct, type RawXentralProduct} from './transform/product'
import {transformStockLevels, type RawXentralProductStocks} from './transform/stock-level'
import {transformLocation, type RawXentralWarehouse} from './transform/location'
import {transformSupplier, type RawXentralSupplier} from './transform/supplier'
import {transformPurchaseOrder, type RawXentralPurchaseOrder} from './transform/purchase-order'

export interface XentralAdapterConfig {
  /** Reserved for future use; all tenant details come from Credentials.extra. */
  xentralId?: string
}

/** V1 paginated list envelope */
interface V1ListResponse<T> {
  data?: T[]
  extra?: {
    totalCount?: number
    page?: { number?: number; size?: number }
  }
}

/** V1 single-item envelope */
interface V1SingleResponse<T> {
  data?: T
}

export class XentralAdapter implements InventoryAdapter {
  readonly platform = 'xentral'
  readonly version = '0.1.0'

  constructor(_config: XentralAdapterConfig = {}) {}

  credentialFields(): CredentialField[] {
    return credentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return exchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('xentral uses Personal Access Tokens; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // PATs do not expire; pass through unchanged
    return credentials
  }

  private client(credentials: Credentials): XentralClient {
    return new XentralClient(credentials)
  }

  /**
   * Build V1 page params: page[number] + page[size] (deepObject serialised by axios).
   * Axios serialises nested objects as page[number]=1&page[size]=50 by default.
   */
  private pageParams(params: QueryParams): Record<string, unknown> {
    return {
      'page[number]': String(params.page ?? 1),
      'page[size]': String(params.limit ?? DEFAULT_PAGE_SIZE),
    }
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).get<V1ListResponse<RawXentralProduct>>(
      '/api/v1/products',
      this.pageParams(params),
    )
    return (res.data ?? []).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).get<V1SingleResponse<RawXentralProduct>>(
      `/api/v1/products/${id}`,
    )
    if (!res.data) throw new Error(`xentral: product ${id} not found`)
    return transformProduct(res.data)
  }

  // ── Stock Levels ──────────────────────────────────────────────────────────
  // Xentral exposes stock per product (with per-warehouse breakdown).
  // listStockLevels iterates over all products and aggregates; for single
  // product lookups use getStockLevel with the product id.

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    // Fetch the product list first to obtain product ids, then request stocks
    const productsRes = await this.client(credentials).get<V1ListResponse<RawXentralProduct>>(
      '/api/v1/products',
      this.pageParams(params),
    )
    const products = productsRes.data ?? []
    const stocksPerProduct = await Promise.all(
      products.map(async (p) => {
        try {
          const r = await this.client(credentials).get<V1SingleResponse<RawXentralProductStocks>>(
            `/api/v1/products/${p.id}/stocks`,
          )
          if (!r.data) return []
          return transformStockLevels(p.id, r.data)
        } catch (err) {
          // 404 means this product simply has no stock records. Any other failure
          // must propagate rather than contribute an empty slice: a silently
          // dropped product is indistinguishable from one holding zero stock, and
          // both the sync worker and a human reading stock levels would act on
          // that number as if we had successfully read it.
          if ((err as { response?: { status?: number } }).response?.status === 404) return []
          throw err
        }
      }),
    )
    return stocksPerProduct.flat()
  }

  async getStockLevel(credentials: Credentials, id: string): Promise<StockLevel> {
    // id is productId (or "productId:locationId" compound key)
    const productId = id.includes(':') ? id.split(':')[0]! : id
    const res = await this.client(credentials).get<V1SingleResponse<RawXentralProductStocks>>(
      `/api/v1/products/${productId}/stocks`,
    )
    if (!res.data) throw new Error(`xentral: stock levels for product ${productId} not found`)
    const levels = transformStockLevels(productId, res.data)
    // Return the matching record if compound key, else the first aggregate
    if (id.includes(':')) {
      const match = levels.find((l) => l.id === id)
      if (match) return match
    }
    if (levels[0]) return levels[0]
    throw new Error(`xentral: no stock level found for id=${id}`)
  }

  // ── Locations (Warehouses) ────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const res = await this.client(credentials).get<V1ListResponse<RawXentralWarehouse>>(
      '/api/v1/warehouses',
      this.pageParams(params),
    )
    return (res.data ?? []).map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    // No single-warehouse GET endpoint; fetch list and filter
    const res = await this.client(credentials).get<V1ListResponse<RawXentralWarehouse>>(
      '/api/v1/warehouses',
      { 'page[number]': '1', 'page[size]': '50' },
    )
    const match = (res.data ?? []).find((w) => w.id === id)
    if (!match) throw new Error(`xentral: warehouse ${id} not found`)
    return transformLocation(match)
  }

  // ── Suppliers ─────────────────────────────────────────────────────────────

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const res = await this.client(credentials).get<V1ListResponse<RawXentralSupplier>>(
      '/api/v1/suppliers',
      this.pageParams(params),
    )
    return (res.data ?? []).map(transformSupplier)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const res = await this.client(credentials).get<V1SingleResponse<RawXentralSupplier>>(
      `/api/v1/suppliers/${id}`,
    )
    if (!res.data) throw new Error(`xentral: supplier ${id} not found`)
    return transformSupplier(res.data)
  }

  // ── Purchase Orders ───────────────────────────────────────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const res = await this.client(credentials).get<V1ListResponse<RawXentralPurchaseOrder>>(
      '/api/v1/purchaseOrders',
      this.pageParams(params),
    )
    return (res.data ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const res = await this.client(credentials).get<V1SingleResponse<RawXentralPurchaseOrder>>(
      `/api/v1/purchaseOrders/${id}`,
    )
    if (!res.data) throw new Error(`xentral: purchase order ${id} not found`)
    return transformPurchaseOrder(res.data)
  }
}
