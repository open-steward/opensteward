/**
 * Picqer adapter — warehouse management system.
 *
 * Auth: HTTP Basic Auth, API key as username (password blank).
 * Base URL: https://{subdomain}.picqer.com/api/v1
 * Pagination: offset-based, 100 results per page.
 * Schema-firewall: no product images, no supplier banking, no BOM.
 *
 * Supported resources: products, stock-levels (per warehouse), locations
 * (warehouses), suppliers, purchase orders, stock adjustments (stock history).
 * Not supported: stock transfers (Picqer has no inter-warehouse transfer API).
 */
import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { InventoryAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { StockLevel } from '../../schema/stock-level'
import type { Location } from '../../schema/location'
import type { Supplier } from '../../schema/supplier'
import type { PurchaseOrder } from '../../schema/purchase-order'
import type { StockAdjustment } from '../../schema/stock-adjustment'
import type { WebhookEvent } from '../../schema/webhook'

import {
  credentialFields as picqerCredentialFields,
  exchangeCredentials as picqerExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import {PicqerClient} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'
import {verifyPicqerWebhook, parsePicqerWebhookEvents} from './webhook'

import {transformProduct, type RawPicqerProduct} from './transform/product'
import {transformStockLevel, type RawPicqerStockLevel} from './transform/stock-level'
import {transformLocation, type RawPicqerWarehouse} from './transform/location'
import {transformSupplier, type RawPicqerSupplier} from './transform/supplier'
import {transformPurchaseOrder, type RawPicqerPurchaseOrder} from './transform/purchase-order'
import {transformStockAdjustment, type RawPicqerStockHistory} from './transform/stock-adjustment'

export type PicqerAdapterConfig = Record<string, never>

export class PicqerAdapter implements InventoryAdapter {
  readonly platform = 'picqer'
  readonly version = '0.1.0'

  constructor(_config: PicqerAdapterConfig = {}) {}

  credentialFields(): CredentialField[] {
    return picqerCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>) {
    return picqerExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('picqer uses static API key; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyPicqerWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parsePicqerWebhookEvents(payload)
  }

  private client(credentials: Credentials): PicqerClient {
    return new PicqerClient(credentials)
  }

  private offsetParams(params: QueryParams): Record<string, unknown> {
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const page = params.page ?? 1
    return {
      limit,
      offset: (page - 1) * limit,
    }
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const items = await this.client(credentials).get<RawPicqerProduct[]>('/products', this.offsetParams(params))
    return (items ?? []).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const item = await this.client(credentials).get<RawPicqerProduct>(`/products/${id}`)
    return transformProduct(item)
  }

  // ── Stock levels ──────────────────────────────────────────────────────────
  //
  // Picqer exposes stock as GET /warehouses/{idwarehouse}/stock (per-warehouse
  // list of product stocks). listStockLevels fetches all warehouses first,
  // then their stock.

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const client = this.client(credentials)
    const warehouses = await client.get<RawPicqerWarehouse[]>('/warehouses')
    const results: StockLevel[] = []
    for (const wh of warehouses ?? []) {
      try {
        const stocks = await client.get<RawPicqerStockLevel[]>(`/warehouses/${wh.idwarehouse}/stock`, this.offsetParams(params))
        for (const s of stocks ?? []) {
          results.push(transformStockLevel({ ...s, idwarehouse: wh.idwarehouse }))
        }
      } catch {
        // skip inaccessible warehouses without throwing
      }
    }
    return results
  }

  async getStockLevel(credentials: Credentials, id: string): Promise<StockLevel> {
    // id format: "{idproduct}:{idwarehouse}"
    const [productId, warehouseId] = id.split(':')
    if (!productId || !warehouseId) throw new Error(`picqer getStockLevel: id must be "{idproduct}:{idwarehouse}", got ${id}`)
    const stocks = await this.client(credentials).get<RawPicqerStockLevel[]>(`/products/${productId}/stock`)
    const match = (stocks ?? []).find((s) => String(s.idwarehouse) === warehouseId)
    if (!match) throw new Error(`picqer stock level ${id} not found`)
    return transformStockLevel(match)
  }

  // ── Locations (warehouses) ────────────────────────────────────────────────

  async listLocations(credentials: Credentials, _params: QueryParams): Promise<Location[]> {
    const items = await this.client(credentials).get<RawPicqerWarehouse[]>('/warehouses')
    return (items ?? []).map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const item = await this.client(credentials).get<RawPicqerWarehouse>(`/warehouses/${id}`)
    return transformLocation(item)
  }

  // ── Suppliers ─────────────────────────────────────────────────────────────

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const items = await this.client(credentials).get<RawPicqerSupplier[]>('/suppliers', this.offsetParams(params))
    return (items ?? []).map(transformSupplier)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const item = await this.client(credentials).get<RawPicqerSupplier>(`/suppliers/${id}`)
    return transformSupplier(item)
  }

  // ── Purchase orders ───────────────────────────────────────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const items = await this.client(credentials).get<RawPicqerPurchaseOrder[]>('/purchaseorders', this.offsetParams(params))
    return (items ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const item = await this.client(credentials).get<RawPicqerPurchaseOrder>(`/purchaseorders/${id}`)
    return transformPurchaseOrder(item)
  }

  // ── Stock adjustments (stock history) ────────────────────────────────────

  async listStockAdjustments(credentials: Credentials, params: QueryParams): Promise<StockAdjustment[]> {
    const items = await this.client(credentials).get<RawPicqerStockHistory[]>('/stockhistory', this.offsetParams(params))
    return (items ?? []).map(transformStockAdjustment)
  }

  async getStockAdjustment(credentials: Credentials, id: string): Promise<StockAdjustment> {
    const item = await this.client(credentials).get<RawPicqerStockHistory>(`/stockhistory/${id}`)
    return transformStockAdjustment(item)
  }
}
