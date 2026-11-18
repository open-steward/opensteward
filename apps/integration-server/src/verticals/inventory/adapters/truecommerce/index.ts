/**
 * TrueCommerce Foundry adapter — inventory vertical.
 *
 * TrueCommerce Foundry is a cloud supply-chain platform with an API-first
 * architecture.  Auth uses OAuth 2.0 client_credentials (Auth0-backed).
 * All monetary amounts come from the API in INTEGER MINOR UNITS (cents).
 *
 * Supported resources: products, inventory (stock levels), locations,
 * trading partners (suppliers), purchase orders, stock transfers,
 * stock adjustments.
 *
 * Webhooks: TrueCommerce does not publish a documented HMAC/JWT signing
 * scheme for external webhook consumers — webhook methods are omitted.
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
  credentialFields as truecommerceCredentialFields,
  exchangeCredentials as truecommerceExchangeCredentials,
  refreshCredentials as truecommerceRefreshCredentials,
} from './auth'
import {TruecommerceClient} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'

import {transformProduct, type RawTruecommerceProduct} from './transform/product'
import {transformStockLevel, type RawTruecommerceStockLevel} from './transform/stock-level'
import {transformLocation, type RawTruecommerceLocation} from './transform/location'
import {transformSupplier, type RawTruecommerceSupplier} from './transform/supplier'
import {transformPurchaseOrder, type RawTruecommercePurchaseOrder} from './transform/purchase-order'
import {transformStockTransfer, type RawTruecommerceStockTransfer} from './transform/stock-transfer'
import {transformStockAdjustment, type RawTruecommerceStockAdjustment} from './transform/stock-adjustment'

export interface TruecommerceAdapterConfig {
  clientId: string
  clientSecret: string
}

/** Envelope shapes returned by the TrueCommerce Foundry list endpoints. */
interface PagedResponse<T> {
  data?: T[]
  items?: T[]
  total?: number
  page?: number
  page_size?: number
}

/** Single-resource envelope. */
interface SingleResponse<T> {
  data?: T
}

export class TruecommerceAdapter implements InventoryAdapter {
  readonly platform = 'truecommerce'
  readonly version = '0.1.0'

  constructor(_config: TruecommerceAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return truecommerceCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return truecommerceExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    throw new Error('truecommerce: uses client_credentials grant; no interactive auth URL')
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('truecommerce: uses client_credentials grant; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return truecommerceRefreshCredentials(credentials)
  }

  private client(credentials: Credentials): TruecommerceClient {
    return new TruecommerceClient(credentials)
  }

  private pageParams(params: QueryParams): Record<string, unknown> {
    return {
      page_size: params.limit ?? DEFAULT_PAGE_SIZE,
      ...(params.page ? { page: params.page } : {}),
    }
  }

  private unwrapList<T>(res: PagedResponse<T>): T[] {
    return res.data ?? res.items ?? []
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).get<PagedResponse<RawTruecommerceProduct>>(
      '/products',
      this.pageParams(params),
    )
    return this.unwrapList(res).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).get<SingleResponse<RawTruecommerceProduct>>(
      `/products/${encodeURIComponent(id)}`,
    )
    if (!res.data) throw new Error(`truecommerce product ${id} not found`)
    return transformProduct(res.data)
  }

  // ── Stock Levels ──────────────────────────────────────────────────────────

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const res = await this.client(credentials).get<PagedResponse<RawTruecommerceStockLevel>>(
      '/inventory',
      this.pageParams(params),
    )
    return this.unwrapList(res).map(transformStockLevel)
  }

  async getStockLevel(_credentials: Credentials, id: string): Promise<StockLevel> {
    throw new Error(`truecommerce stock-level fetch is bulk-only; call listStockLevels. id=${id}`)
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const res = await this.client(credentials).get<PagedResponse<RawTruecommerceLocation>>(
      '/locations',
      this.pageParams(params),
    )
    return this.unwrapList(res).map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const res = await this.client(credentials).get<SingleResponse<RawTruecommerceLocation>>(
      `/locations/${encodeURIComponent(id)}`,
    )
    if (!res.data) throw new Error(`truecommerce location ${id} not found`)
    return transformLocation(res.data)
  }

  // ── Suppliers (Trading Partners) ──────────────────────────────────────────

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const res = await this.client(credentials).get<PagedResponse<RawTruecommerceSupplier>>(
      '/trading-partners',
      this.pageParams(params),
    )
    return this.unwrapList(res).map(transformSupplier)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const res = await this.client(credentials).get<SingleResponse<RawTruecommerceSupplier>>(
      `/trading-partners/${encodeURIComponent(id)}`,
    )
    if (!res.data) throw new Error(`truecommerce trading-partner ${id} not found`)
    return transformSupplier(res.data)
  }

  // ── Purchase Orders ───────────────────────────────────────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const res = await this.client(credentials).get<PagedResponse<RawTruecommercePurchaseOrder>>(
      '/purchase-orders',
      this.pageParams(params),
    )
    return this.unwrapList(res).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const res = await this.client(credentials).get<SingleResponse<RawTruecommercePurchaseOrder>>(
      `/purchase-orders/${encodeURIComponent(id)}`,
    )
    if (!res.data) throw new Error(`truecommerce purchase-order ${id} not found`)
    return transformPurchaseOrder(res.data)
  }

  // ── Stock Transfers ───────────────────────────────────────────────────────

  async listStockTransfers(credentials: Credentials, params: QueryParams): Promise<StockTransfer[]> {
    const res = await this.client(credentials).get<PagedResponse<RawTruecommerceStockTransfer>>(
      '/stock-transfers',
      this.pageParams(params),
    )
    return this.unwrapList(res).map(transformStockTransfer)
  }

  async getStockTransfer(credentials: Credentials, id: string): Promise<StockTransfer> {
    const res = await this.client(credentials).get<SingleResponse<RawTruecommerceStockTransfer>>(
      `/stock-transfers/${encodeURIComponent(id)}`,
    )
    if (!res.data) throw new Error(`truecommerce stock-transfer ${id} not found`)
    return transformStockTransfer(res.data)
  }

  // ── Stock Adjustments ─────────────────────────────────────────────────────

  async listStockAdjustments(credentials: Credentials, params: QueryParams): Promise<StockAdjustment[]> {
    const res = await this.client(credentials).get<PagedResponse<RawTruecommerceStockAdjustment>>(
      '/stock-adjustments',
      this.pageParams(params),
    )
    return this.unwrapList(res).map(transformStockAdjustment)
  }

  async getStockAdjustment(credentials: Credentials, id: string): Promise<StockAdjustment> {
    const res = await this.client(credentials).get<SingleResponse<RawTruecommerceStockAdjustment>>(
      `/stock-adjustments/${encodeURIComponent(id)}`,
    )
    if (!res.data) throw new Error(`truecommerce stock-adjustment ${id} not found`)
    return transformStockAdjustment(res.data)
  }
}
