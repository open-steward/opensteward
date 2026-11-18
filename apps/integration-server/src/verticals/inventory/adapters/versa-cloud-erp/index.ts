/**
 * Versa Cloud ERP inventory adapter.
 *
 * Auth:       API token via VERSACCOUNTS_AUTHORIZATION header.
 * Base URL:   https://www1.versaccounts.com/v1
 * Pagination: ?page=N  (1-based) + ?since_id=<id> for cursor-style iteration.
 *
 * Supported resources:
 *   - products       (/item.json)
 *   - stock levels   (/item.json?include_quantity=true / item/:id/quantity.json)
 *   - locations      (/location.json)
 *   - suppliers      (/vendor.json)
 *   - purchase orders (/order.json?order_type_id=1)
 *   - stock adjustments (/adjustment.json)
 *   - stock transfers (/transfer.json)
 *
 * Webhooks: not implemented — Versa Cloud ERP does not publish documented
 * HMAC/JWT webhook signing; omit webhook.ts per canon rules.
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
  credentialFields as versaCredentialFields,
  exchangeCredentials as versaExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import {VersaCloudErpClient} from './client'
import {DEFAULT_PAGE_SIZE, ORDER_TYPE_PURCHASE} from './constants'

import {transformProduct, type RawVersaProduct} from './transform/product'
import {transformStockLevel, type RawVersaStockLevel} from './transform/stock-level'
import {transformLocation, type RawVersaLocation} from './transform/location'
import {transformSupplier, type RawVersaSupplier} from './transform/supplier'
import {transformPurchaseOrder, type RawVersaPurchaseOrder} from './transform/purchase-order'
import {transformStockTransfer, type RawVersaStockTransfer} from './transform/stock-transfer'
import {transformStockAdjustment, type RawVersaStockAdjustment} from './transform/stock-adjustment'

// ── Versa pagination helpers ──────────────────────────────────────────────────

function pageParams(params: QueryParams): Record<string, unknown> {
  const p: Record<string, unknown> = {
    limit: params.limit ?? DEFAULT_PAGE_SIZE,
    page: params.page ?? 1,
  }
  if (params.sinceId) p['since_id'] = params.sinceId
  return p
}

// ── List-response envelope types ──────────────────────────────────────────────

type ListEnvelope<T> = T[] | { items?: T[]; data?: T[]; results?: T[] }

function unwrapList<T>(res: ListEnvelope<T>): T[] {
  if (Array.isArray(res)) return res
  return res.items ?? res.data ?? res.results ?? []
}

export class VersaCloudErpAdapter implements InventoryAdapter {
  readonly platform = 'versa-cloud-erp'
  readonly version = '0.1.0'

  credentialFields(): CredentialField[] {
    return versaCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return versaExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('versa-cloud-erp uses a static API token; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Token is long-lived (annual renewal); no refresh needed
    return credentials
  }

  private client(credentials: Credentials): VersaCloudErpClient {
    return new VersaCloudErpClient(credentials)
  }

  // ── Products ────────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).get<ListEnvelope<RawVersaProduct>>(
      '/item.json',
      pageParams(params),
    )
    return unwrapList(res).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).get<RawVersaProduct | ListEnvelope<RawVersaProduct>>(
      `/item/${id}.json`,
    )
    // Some Versa versions wrap single objects in a list envelope
    const items = Array.isArray(res) ? res : [res as RawVersaProduct]
    const item = items[0]
    if (!item) throw new Error(`versa-cloud-erp: item ${id} not found`)
    return transformProduct(item)
  }

  // ── Stock levels ────────────────────────────────────────────────────────────

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const res = await this.client(credentials).get<ListEnvelope<RawVersaStockLevel>>(
      '/item/quantity.json',
      pageParams(params),
    )
    return unwrapList(res).map(transformStockLevel)
  }

  async getStockLevel(credentials: Credentials, id: string): Promise<StockLevel> {
    // id is formatted as "itemId:locationId"
    const [itemId] = id.split(':')
    const res = await this.client(credentials).get<ListEnvelope<RawVersaStockLevel>>(
      `/item/${itemId}/quantity.json`,
    )
    const items = unwrapList(res)
    const level = items[0]
    if (!level) throw new Error(`versa-cloud-erp: stock level for item ${itemId} not found`)
    return transformStockLevel(level)
  }

  // ── Locations ───────────────────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const res = await this.client(credentials).get<ListEnvelope<RawVersaLocation>>(
      '/location.json',
      pageParams(params),
    )
    return unwrapList(res).map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const res = await this.client(credentials).get<RawVersaLocation | ListEnvelope<RawVersaLocation>>(
      `/location/${id}.json`,
    )
    const items = Array.isArray(res) ? res : [res as RawVersaLocation]
    const loc = items[0]
    if (!loc) throw new Error(`versa-cloud-erp: location ${id} not found`)
    return transformLocation(loc)
  }

  // ── Suppliers ───────────────────────────────────────────────────────────────

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const res = await this.client(credentials).get<ListEnvelope<RawVersaSupplier>>(
      '/vendor.json',
      pageParams(params),
    )
    return unwrapList(res).map(transformSupplier)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const res = await this.client(credentials).get<RawVersaSupplier | ListEnvelope<RawVersaSupplier>>(
      `/vendor/${id}.json`,
    )
    const items = Array.isArray(res) ? res : [res as RawVersaSupplier]
    const supplier = items[0]
    if (!supplier) throw new Error(`versa-cloud-erp: vendor ${id} not found`)
    return transformSupplier(supplier)
  }

  // ── Purchase orders ─────────────────────────────────────────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const res = await this.client(credentials).get<ListEnvelope<RawVersaPurchaseOrder>>(
      '/order.json',
      { ...pageParams(params), order_type_id: ORDER_TYPE_PURCHASE },
    )
    return unwrapList(res).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const res = await this.client(credentials).get<RawVersaPurchaseOrder | ListEnvelope<RawVersaPurchaseOrder>>(
      `/order/${id}.json`,
    )
    const items = Array.isArray(res) ? res : [res as RawVersaPurchaseOrder]
    const po = items[0]
    if (!po) throw new Error(`versa-cloud-erp: order ${id} not found`)
    return transformPurchaseOrder(po)
  }

  // ── Stock adjustments ───────────────────────────────────────────────────────

  async listStockAdjustments(credentials: Credentials, params: QueryParams): Promise<StockAdjustment[]> {
    const res = await this.client(credentials).get<ListEnvelope<RawVersaStockAdjustment>>(
      '/adjustment.json',
      pageParams(params),
    )
    return unwrapList(res).map(transformStockAdjustment)
  }

  async getStockAdjustment(credentials: Credentials, id: string): Promise<StockAdjustment> {
    const res = await this.client(credentials).get<RawVersaStockAdjustment | ListEnvelope<RawVersaStockAdjustment>>(
      `/adjustment/${id}.json`,
    )
    const items = Array.isArray(res) ? res : [res as RawVersaStockAdjustment]
    const adj = items[0]
    if (!adj) throw new Error(`versa-cloud-erp: adjustment ${id} not found`)
    return transformStockAdjustment(adj)
  }

  // ── Stock transfers ─────────────────────────────────────────────────────────

  async listStockTransfers(credentials: Credentials, params: QueryParams): Promise<StockTransfer[]> {
    const res = await this.client(credentials).get<ListEnvelope<RawVersaStockTransfer>>(
      '/transfer.json',
      pageParams(params),
    )
    return unwrapList(res).map(transformStockTransfer)
  }

  async getStockTransfer(credentials: Credentials, id: string): Promise<StockTransfer> {
    const res = await this.client(credentials).get<RawVersaStockTransfer | ListEnvelope<RawVersaStockTransfer>>(
      `/transfer/${id}.json`,
    )
    const items = Array.isArray(res) ? res : [res as RawVersaStockTransfer]
    const xfer = items[0]
    if (!xfer) throw new Error(`versa-cloud-erp: transfer ${id} not found`)
    return transformStockTransfer(xfer)
  }
}
