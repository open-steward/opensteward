/**
 * Qoblex adapter — inventory vertical.
 *
 * Qoblex is a cloud inventory management platform for e-commerce and
 * multi-warehouse operations. API base: https://api.qoblex.com
 * Auth: single API key via `qoblex-x-api-key` header.
 * Pagination: 0-based `page` query param, max 50 entries per page.
 * Rate limit: 10 requests / 60 seconds.
 *
 * Supported resources: products, stock-levels (via variant locations),
 *   locations, suppliers, purchase-orders, stock-adjustments.
 * Not supported: stock-transfers (no list/get endpoint in Qoblex v1 API).
 * Webhooks: not documented — verifyWebhook / parseWebhookEvents omitted.
 */
import {
  pageLocally,
  type CredentialField,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import type { InventoryAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { StockLevel } from '../../schema/stock-level'
import type { Location } from '../../schema/location'
import type { Supplier } from '../../schema/supplier'
import type { PurchaseOrder } from '../../schema/purchase-order'
import type { StockAdjustment } from '../../schema/stock-adjustment'

import {
  credentialFields as qoblexCredentialFields,
  exchangeCredentials as qoblexExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import {QoblexClient} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'

import {transformProduct, type RawQoblexProduct} from './transform/product'
import {transformStockLevel, type RawQoblexVariantLocation} from './transform/stock-level'
import {transformLocation, type RawQoblexLocation} from './transform/location'
import {transformSupplier, type RawQoblexSupplier} from './transform/supplier'
import {transformPurchaseOrder, type RawQoblexPurchaseOrder} from './transform/purchase-order'
import {transformStockAdjustment, type RawQoblexAdjustment} from './transform/stock-adjustment'

export type QoblexAdapterConfig = Record<string, never>

/** Qoblex list response wrapper (products endpoint). */
interface QoblexProductsResponse {
  count?: number
  filtered_count?: number
  products?: RawQoblexProduct[]
}

/** Generic list response wrapper used by suppliers, purchase_orders, adjustments. */
interface QoblexListResponse<T> {
  count?: number
  filterd_count?: number // note: Qoblex API typo — "filterd_count"
  lines?: T[]
}

export class QoblexAdapter implements InventoryAdapter {
  readonly platform = 'qoblex'
  readonly version = '0.1.0'

  constructor(_config?: QoblexAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return qoblexCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return qoblexExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('qoblex uses a static API key; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): QoblexClient {
    return new QoblexClient(credentials)
  }

  private pageParams(params: QueryParams): Record<string, unknown> {
    // Qoblex uses 0-based page index; QueryParams.page is 1-based convention
    const page = Math.max(0, (params.page ?? 1) - 1)
    return { page }
  }

  // ── Products ───────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).get<QoblexProductsResponse>(
      '/v1/products',
      { ...this.pageParams(params), expand: 'variants' },
    )
    const products: Product[] = []
    for (const raw of res.products ?? []) {
      const variants = raw.variants ?? []
      if (variants.length <= 1) {
        products.push(transformProduct(raw, variants[0]))
      } else {
        // Flatten: each variant becomes a separate Product row
        for (const v of variants) {
          products.push(transformProduct(raw, v))
        }
      }
    }
    return products
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    // id is the variant id; Qoblex product endpoint is by product id
    // We use the reporting inventory endpoint to resolve the variant → product
    const res = await this.client(credentials).get<QoblexProductsResponse>(
      '/v1/products',
      { expand: 'variants', filters: JSON.stringify({ variant_id: Number(id) }) },
    )
    const raw = res.products?.[0]
    if (!raw) throw new Error(`qoblex product/variant ${id} not found`)
    const variant = (raw.variants ?? []).find((v) => String(v.id) === id)
    return transformProduct(raw, variant ?? raw.variants?.[0])
  }

  // ── Stock Levels ──────────────────────────────────────────────────────────

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    // Stock levels are embedded in variant.locations[] on the product endpoint
    const res = await this.client(credentials).get<QoblexProductsResponse>(
      '/v1/products',
      { ...this.pageParams(params), expand: 'variants' },
    )
    const levels: StockLevel[] = []
    for (const product of res.products ?? []) {
      for (const variant of product.variants ?? []) {
        const variantId = variant.id
        if (variantId === undefined) continue
        for (const loc of (variant as { locations?: RawQoblexVariantLocation[] }).locations ?? []) {
          levels.push(transformStockLevel({ ...loc, product_variant_id: variantId }))
        }
      }
    }
    return levels
  }

  async getStockLevel(_credentials: Credentials, id: string): Promise<StockLevel> {
    throw new Error(
      `qoblex stock-level fetch is product-scoped; call listStockLevels to retrieve all levels. id=${id}`,
    )
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    // GET /v1/account/locations is unpaginated: the spec declares only
    // `filters`, `sort_by` and `expand`, and answers with a bare array of every
    // location. Slice that whole collection into the caller's page. Each caller
    // page is a separate fetch and the spec states no default order, so pin it
    // with the documented `sort_by=id` (ascending): every page then cuts the
    // same sequence instead of repeating or skipping rows.
    const res = await this.client(credentials).get<RawQoblexLocation[]>('/v1/account/locations', {
      sort_by: 'id',
    })
    return pageLocally((Array.isArray(res) ? res : []).map(transformLocation), params)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    // The spec also documents GET /v1/account/locations/{id}; this still scans
    // the list. `{}` must stay: with no limit, pageLocally returns every row.
    const all = await this.listLocations(credentials, {})
    const found = all.find((l) => l.id === id)
    if (!found) throw new Error(`qoblex location ${id} not found`)
    return found
  }

  // ── Suppliers ─────────────────────────────────────────────────────────────

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const res = await this.client(credentials).get<QoblexListResponse<RawQoblexSupplier>>(
      '/v1/suppliers',
      this.pageParams(params),
    )
    return (res.lines ?? []).map(transformSupplier)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    // No single-supplier endpoint — scan pages until found
    let page = 0
    while (true) {
      const res = await this.client(credentials).get<QoblexListResponse<RawQoblexSupplier>>(
        '/v1/suppliers',
        { page },
      )
      const items = res.lines ?? []
      const found = items.find((s) => String(s.id) === id)
      if (found) return transformSupplier(found)
      if (items.length < DEFAULT_PAGE_SIZE) throw new Error(`qoblex supplier ${id} not found`)
      page++
    }
  }

  // ── Purchase Orders ───────────────────────────────────────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const res = await this.client(credentials).get<QoblexListResponse<RawQoblexPurchaseOrder>>(
      '/v1/purchase_orders',
      this.pageParams(params),
    )
    return (res.lines ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const res = await this.client(credentials).get<RawQoblexPurchaseOrder>(`/v1/purchase_orders/${id}`)
    if (!res || !res.id) throw new Error(`qoblex purchase order ${id} not found`)
    return transformPurchaseOrder(res)
  }

  // ── Stock Adjustments ─────────────────────────────────────────────────────

  async listStockAdjustments(credentials: Credentials, params: QueryParams): Promise<StockAdjustment[]> {
    const res = await this.client(credentials).get<QoblexListResponse<RawQoblexAdjustment>>(
      '/v1/adjustments',
      this.pageParams(params),
    )
    return (res.lines ?? []).map(transformStockAdjustment)
  }

  async getStockAdjustment(credentials: Credentials, id: string): Promise<StockAdjustment> {
    const res = await this.client(credentials).get<RawQoblexAdjustment>(`/v1/adjustments/${id}`)
    if (!res || !res.id) throw new Error(`qoblex adjustment ${id} not found`)
    return transformStockAdjustment(res)
  }
}
