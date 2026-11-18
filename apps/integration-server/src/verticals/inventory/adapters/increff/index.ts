/**
 * Increff Assure OMS/WMS adapter for the inventory vertical.
 *
 * Increff is an enterprise supply-chain platform (OMS + WMS) popular in
 * the South Asian and global omnichannel retail market.
 *
 * Auth: access-key + secret-key pair (provisioned by Increff) + clientCode
 *       that forms the per-tenant subdomain.
 * Base URL: https://{clientCode}.increff.com/api
 *
 * Pagination: pageNo (1-based) + pageSize query params.
 * Responses: { data: T[] } or { data: T } envelope.
 *
 * Webhook signing: no HMAC/JWT signing documented in public APIs — omitted.
 *
 * Schema-firewall: no product images, no supplier banking, BOM refused.
 *
 * Docs: https://docs.increff.com/space/IOSA (Increff Omni Standard APIs)
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
  credentialFields as increffCredentialFields,
  exchangeCredentials as increffExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import {IncreffClient} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'

import {transformProduct, type RawIncreffProduct} from './transform/product'
import {transformStockLevel, type RawIncreffStockLevel} from './transform/stock-level'
import {transformLocation, type RawIncreffLocation} from './transform/location'
import {transformSupplier, type RawIncreffSupplier} from './transform/supplier'
import {transformPurchaseOrder, type RawIncreffPurchaseOrder} from './transform/purchase-order'
import {transformStockTransfer, type RawIncreffStockTransfer} from './transform/stock-transfer'
import {transformStockAdjustment, type RawIncreffStockAdjustment} from './transform/stock-adjustment'

export interface IncreffAdapterConfig {
  /** No OAuth config needed — API key auth only. Reserved for future use. */
  _reserved?: never
}

/** Standard Increff list response envelope */
interface ListEnvelope<T> { data?: T[]; items?: T[]; list?: T[] }
/** Standard Increff single-item response envelope */
interface SingleEnvelope<T> { data?: T }

export class IncreffAdapter implements InventoryAdapter {
  readonly platform = 'increff'
  readonly version = '0.1.0'

  constructor(_config?: IncreffAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return increffCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>) {
    return increffExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('increff uses access-key + secret-key; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): IncreffClient {
    return new IncreffClient(credentials)
  }

  private pageParams(params: QueryParams): Record<string, unknown> {
    return {
      pageSize: params.limit ?? DEFAULT_PAGE_SIZE,
      pageNo: params.page ?? 1,
    }
  }

  private unwrapList<T>(res: ListEnvelope<T>): T[] {
    return res.data ?? res.items ?? res.list ?? []
  }

  // ── Products (SKU masters) ────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).get<ListEnvelope<RawIncreffProduct>>(
      '/v1/skus',
      this.pageParams(params),
    )
    return this.unwrapList(res).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).get<SingleEnvelope<RawIncreffProduct>>(
      `/v1/skus/${encodeURIComponent(id)}`,
    )
    if (!res.data) throw new Error(`increff product ${id} not found`)
    return transformProduct(res.data)
  }

  // ── Stock Levels (Available-to-Promise inventory) ─────────────────────────

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const res = await this.client(credentials).get<ListEnvelope<RawIncreffStockLevel>>(
      '/v1/inventory/atp',
      this.pageParams(params),
    )
    return this.unwrapList(res).map(transformStockLevel)
  }

  async getStockLevel(_credentials: Credentials, id: string): Promise<StockLevel> {
    throw new Error(`increff stock-level fetch is bulk-only; call listStockLevels. id=${id}`)
  }

  // ── Locations (warehouses) ────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const res = await this.client(credentials).get<ListEnvelope<RawIncreffLocation>>(
      '/v1/warehouses',
      this.pageParams(params),
    )
    return this.unwrapList(res).map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const res = await this.client(credentials).get<SingleEnvelope<RawIncreffLocation>>(
      `/v1/warehouses/${encodeURIComponent(id)}`,
    )
    if (!res.data) throw new Error(`increff location ${id} not found`)
    return transformLocation(res.data)
  }

  // ── Suppliers ─────────────────────────────────────────────────────────────

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const res = await this.client(credentials).get<ListEnvelope<RawIncreffSupplier>>(
      '/v1/suppliers',
      this.pageParams(params),
    )
    return this.unwrapList(res).map(transformSupplier)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const res = await this.client(credentials).get<SingleEnvelope<RawIncreffSupplier>>(
      `/v1/suppliers/${encodeURIComponent(id)}`,
    )
    if (!res.data) throw new Error(`increff supplier ${id} not found`)
    return transformSupplier(res.data)
  }

  // ── Purchase Orders (inward orders) ───────────────────────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const res = await this.client(credentials).get<ListEnvelope<RawIncreffPurchaseOrder>>(
      '/v1/inward-orders',
      this.pageParams(params),
    )
    return this.unwrapList(res).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const res = await this.client(credentials).get<SingleEnvelope<RawIncreffPurchaseOrder>>(
      `/v1/inward-orders/${encodeURIComponent(id)}`,
    )
    if (!res.data) throw new Error(`increff purchase order ${id} not found`)
    return transformPurchaseOrder(res.data)
  }

  // ── Stock Transfers ───────────────────────────────────────────────────────

  async listStockTransfers(credentials: Credentials, params: QueryParams): Promise<StockTransfer[]> {
    const res = await this.client(credentials).get<ListEnvelope<RawIncreffStockTransfer>>(
      '/v1/transfers',
      this.pageParams(params),
    )
    return this.unwrapList(res).map(transformStockTransfer)
  }

  async getStockTransfer(credentials: Credentials, id: string): Promise<StockTransfer> {
    const res = await this.client(credentials).get<SingleEnvelope<RawIncreffStockTransfer>>(
      `/v1/transfers/${encodeURIComponent(id)}`,
    )
    if (!res.data) throw new Error(`increff stock transfer ${id} not found`)
    return transformStockTransfer(res.data)
  }

  // ── Stock Adjustments ─────────────────────────────────────────────────────

  async listStockAdjustments(credentials: Credentials, params: QueryParams): Promise<StockAdjustment[]> {
    const res = await this.client(credentials).get<ListEnvelope<RawIncreffStockAdjustment>>(
      '/v1/adjustments',
      this.pageParams(params),
    )
    return this.unwrapList(res).map(transformStockAdjustment)
  }

  async getStockAdjustment(credentials: Credentials, id: string): Promise<StockAdjustment> {
    const res = await this.client(credentials).get<SingleEnvelope<RawIncreffStockAdjustment>>(
      `/v1/adjustments/${encodeURIComponent(id)}`,
    )
    if (!res.data) throw new Error(`increff stock adjustment ${id} not found`)
    return transformStockAdjustment(res.data)
  }
}
