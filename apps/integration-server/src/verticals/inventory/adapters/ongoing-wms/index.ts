/**
 * Ongoing WMS adapter — inventory vertical.
 *
 * Ongoing WMS is a cloud-based Warehouse Management System (WMS) for 3PL and
 * e-commerce logistics. The Goods Owner REST API lets external systems read
 * article/inventory data, purchase orders, movements, and inventory adjustments.
 *
 * Auth: HTTP Basic (username:password), warehouse code in URL path, goodsOwnerId
 *       query parameter for all read endpoints.
 * Base URL: https://api.ongoingsystems.se/{warehouse}/api/v1/
 *
 * Supported resources: products, stock-levels, locations (goodsOwners),
 *   purchase-orders, stock-transfers (movements), stock-adjustments.
 *
 * Webhooks: Ongoing WMS webhooks use URL-token auth, not HMAC/JWT header
 *   signing — verifyWebhook/parseWebhookEvents are not implemented.
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

import {
  credentialFields as ongoingWmsCredentialFields,
  exchangeCredentials as ongoingWmsExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import {OngoingWmsClient} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'

import {transformProduct, type RawOngoingWmsArticle} from './transform/product'
import {transformStockLevel, type RawOngoingWmsStockLevel} from './transform/stock-level'
import {transformLocation, type RawOngoingWmsGoodsOwner} from './transform/location'
import {transformSupplier, type RawOngoingWmsSupplier} from './transform/supplier'
import {transformPurchaseOrder, type RawOngoingWmsPurchaseOrder} from './transform/purchase-order'
import {transformStockTransfer, type RawOngoingWmsMovement} from './transform/stock-transfer'
import {transformStockAdjustment, type RawOngoingWmsInventoryAdjustment} from './transform/stock-adjustment'

export interface OngoingWmsAdapterConfig {
  /** Unused — API key auth; kept for interface compatibility */
  clientId?: string
  clientSecret?: string
  redirectUri?: string
}

/** GET /inventoryAdjustments response: per-article array with nested adjustments */
interface RawInventoryAdjustmentsResponse {
  article?: {
    articleSystemId?: number
    articleNumber?: string
    articleName?: string
    productCode?: string
    [key: string]: unknown
  }
  inventoryAdjustments?: Array<{
    inventoryId?: number
    numberOfItems?: number
    inventoryTime?: string
    articleItemComment?: string
    inventoryItemComment?: string
    inventoryAdjustmentCause?: { code?: string; name?: string } | null
    location?: string
    batchNumber?: string
    serial?: string
    expiryDate?: string | null
    [key: string]: unknown
  }>
  [key: string]: unknown
}

export class OngoingWmsAdapter implements InventoryAdapter {
  readonly platform = 'ongoing-wms'
  readonly version = '0.1.0'

  constructor(_config: OngoingWmsAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return ongoingWmsCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>) {
    return ongoingWmsExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('ongoing-wms uses HTTP Basic Auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): OngoingWmsClient {
    return new OngoingWmsClient(credentials)
  }

  // ── Products ────────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const c = this.client(credentials)
    const items = await c.get<RawOngoingWmsArticle[]>('/articles', {
      goodsOwnerId: c.goodsOwnerId,
      maxArticlesToGet: params.limit ?? DEFAULT_PAGE_SIZE,
      ...(params.cursor ? { articleSystemIdFrom: params.cursor } : {}),
    })
    return (items ?? []).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const c = this.client(credentials)
    const item = await c.get<RawOngoingWmsArticle>(`/articles/${id}`)
    return transformProduct(item)
  }

  // ── Stock Levels ─────────────────────────────────────────────────────────────
  // Stock is embedded in the article response under inventoryInfo.

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const c = this.client(credentials)
    const items = await c.get<RawOngoingWmsStockLevel[]>('/articles', {
      goodsOwnerId: c.goodsOwnerId,
      onlyArticlesInStock: true,
      maxArticlesToGet: params.limit ?? DEFAULT_PAGE_SIZE,
      ...(params.cursor ? { articleSystemIdFrom: params.cursor } : {}),
    })
    return (items ?? []).map((raw) => transformStockLevel({ ...raw, goodsOwnerId: c.goodsOwnerId }))
  }

  async getStockLevel(credentials: Credentials, id: string): Promise<StockLevel> {
    const c = this.client(credentials)
    const item = await c.get<RawOngoingWmsStockLevel>(`/articles/${id}`)
    return transformStockLevel({ ...item, goodsOwnerId: c.goodsOwnerId })
  }

  // ── Locations (GoodsOwners) ──────────────────────────────────────────────────

  async listLocations(credentials: Credentials, _params: QueryParams): Promise<Location[]> {
    const c = this.client(credentials)
    const items = await c.get<RawOngoingWmsGoodsOwner[]>('/goodsOwners')
    return (items ?? []).map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const c = this.client(credentials)
    const item = await c.get<RawOngoingWmsGoodsOwner>(`/goodsOwners/${id}`)
    return transformLocation(item)
  }

  // ── Suppliers ────────────────────────────────────────────────────────────────
  // The Goods Owner REST API has no dedicated /suppliers endpoint.
  // We synthesise unique suppliers from article supplierInfo objects.

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const c = this.client(credentials)
    const articles = await c.get<Array<{ supplierInfo?: RawOngoingWmsSupplier; [k: string]: unknown }>>('/articles', {
      goodsOwnerId: c.goodsOwnerId,
      maxArticlesToGet: params.limit ?? DEFAULT_PAGE_SIZE,
    })
    const seen = new Set<string>()
    const suppliers: Supplier[] = []
    for (const a of articles ?? []) {
      const si = a.supplierInfo as RawOngoingWmsSupplier | undefined
      if (!si?.supplierNumber || seen.has(si.supplierNumber)) continue
      seen.add(si.supplierNumber)
      suppliers.push(transformSupplier(si))
    }
    return suppliers
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const c = this.client(credentials)
    // Look up by scanning articles for this supplierNumber
    const articles = await c.get<Array<{ supplierInfo?: RawOngoingWmsSupplier; [k: string]: unknown }>>('/articles', {
      goodsOwnerId: c.goodsOwnerId,
      maxArticlesToGet: DEFAULT_PAGE_SIZE,
    })
    for (const a of articles ?? []) {
      const si = a.supplierInfo as RawOngoingWmsSupplier | undefined
      if (si?.supplierNumber === id) return transformSupplier(si)
    }
    throw new Error(`ongoing-wms supplier ${id} not found`)
  }

  // ── Purchase Orders ──────────────────────────────────────────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const c = this.client(credentials)
    const items = await c.get<RawOngoingWmsPurchaseOrder[]>('/purchaseOrders', {
      goodsOwnerId: c.goodsOwnerId,
      maxPurchaseOrdersToGet: params.limit ?? DEFAULT_PAGE_SIZE,
    })
    return (items ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const c = this.client(credentials)
    const item = await c.get<RawOngoingWmsPurchaseOrder>(`/purchaseOrders/${id}`)
    return transformPurchaseOrder(item)
  }

  // ── Stock Transfers (Movements) ──────────────────────────────────────────────
  // GET /movements requires moveTimeFrom; we default to 90 days ago.

  async listStockTransfers(credentials: Credentials, params: QueryParams): Promise<StockTransfer[]> {
    const c = this.client(credentials)
    const moveTimeFrom = params.updatedAfter
      ? params.updatedAfter.toISOString()
      : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
    const items = await c.get<RawOngoingWmsMovement[]>('/movements', {
      goodsOwnerId: c.goodsOwnerId,
      moveTimeFrom,
    })
    return (items ?? []).map(transformStockTransfer)
  }

  async getStockTransfer(_credentials: Credentials, id: string): Promise<StockTransfer> {
    throw new Error(`ongoing-wms movements are list-only; call listStockTransfers. id=${id}`)
  }

  // ── Stock Adjustments ────────────────────────────────────────────────────────
  // GET /inventoryAdjustments returns per-article arrays; we flatten to one
  // StockAdjustment per inventoryAdjustment entry.

  async listStockAdjustments(credentials: Credentials, params: QueryParams): Promise<StockAdjustment[]> {
    const c = this.client(credentials)
    const from = params.updatedAfter
      ? params.updatedAfter.toISOString()
      : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
    const groups = await c.get<RawInventoryAdjustmentsResponse[]>('/inventoryAdjustments', {
      goodsOwnerId: c.goodsOwnerId,
      from,
    })
    const results: StockAdjustment[] = []
    for (const group of groups ?? []) {
      for (const adj of group.inventoryAdjustments ?? []) {
        const flat: RawOngoingWmsInventoryAdjustment = {
          article: group.article as RawOngoingWmsInventoryAdjustment['article'],
          adjustment: adj,
        }
        results.push(transformStockAdjustment(flat))
      }
    }
    return results
  }

  async getStockAdjustment(credentials: Credentials, id: string): Promise<StockAdjustment> {
    const c = this.client(credentials)
    const item = await c.get<{ article?: unknown; inventoryAdjustments?: unknown[] }>(`/inventoryAdjustments/${id}`)
    // Single adjustment response — it may be a wrapper or direct object
    const adjs = item.inventoryAdjustments
    if (Array.isArray(adjs) && adjs.length > 0) {
      return transformStockAdjustment({
        article: item.article as RawOngoingWmsInventoryAdjustment['article'],
        adjustment: adjs[0] as RawOngoingWmsInventoryAdjustment['adjustment'],
      })
    }
    // Fallback: treat whole item as adjustment
    return transformStockAdjustment({ adjustment: item as RawOngoingWmsInventoryAdjustment['adjustment'] })
  }
}
