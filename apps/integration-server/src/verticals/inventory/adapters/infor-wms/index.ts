/**
 * Infor WMS adapter — inventory vertical.
 *
 * Infor CloudSuite Warehouse Management System (WMS) is a tier-one,
 * cloud-native WMS with multi-owner, multi-warehouse support. It is accessed
 * via the Infor ION API Gateway using an OAuth 2.0 Resource Owner Password
 * Credentials (ROPC) flow with a service account (.ionapi credentials file).
 *
 * Auth: ION API OAuth2 password grant (saak/sask service account).
 * Base URL: {ionApiUrl}/{tenantId}/WMS  (constructed from stored credentials)
 *
 * Supported resources:
 *   Products          — GET /items, GET /items/{id}
 *   StockLevels       — GET /inventorybalances  (bulk only)
 *   Locations         — GET /locations, GET /locations/{id}
 *   Suppliers         — GET /suppliers, GET /suppliers/{id}
 *   PurchaseOrders    — GET /purchaseorders, GET /purchaseorders/{id}
 *   StockTransfers    — GET /transferorders, GET /transferorders/{id}
 *   StockAdjustments  — GET /adjustments, GET /adjustments/{id}
 *
 * Webhooks — Infor WMS does not publish a documented outbound-webhook
 * signing scheme; verifyWebhook / parseWebhookEvents are intentionally
 * omitted (auto-501 applies).
 *
 * Schema-firewall: no product images, no supplier banking details,
 * no customer order data, no manufacturing BOM / work orders.
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
  credentialFields as inforWmsCredentialFields,
  exchangeCredentials as inforWmsExchangeCredentials,
  refreshCredentials as inforWmsRefreshCredentials,
  getAuthUrlUnsupported,
} from './auth'
import {InforWmsClient} from './client'
import {DEFAULT_PAGE_SIZE, PATHS} from './constants'

import {transformProduct, type RawInforWmsItem} from './transform/product'
import {transformStockLevel, type RawInforWmsInventoryBalance} from './transform/stock-level'
import {transformLocation, type RawInforWmsLocation} from './transform/location'
import {transformSupplier, type RawInforWmsSupplier} from './transform/supplier'
import {transformPurchaseOrder, type RawInforWmsPurchaseOrder} from './transform/purchase-order'
import {transformStockTransfer, type RawInforWmsTransferOrder} from './transform/stock-transfer'
import {transformStockAdjustment, type RawInforWmsAdjustment} from './transform/stock-adjustment'

// ── Response envelope shapes ─────────────────────────────────────────────────

interface PagedResponse<T> {
  totalCount?: number
  pageNumber?: number
  pageSize?: number
  items?: T[]
}

// ── Adapter config ───────────────────────────────────────────────────────────

export interface InforWmsAdapterConfig {
  /** Not used at construction time — credentials are collected via credentialFields(). */
  _unused?: never
}

// ── Adapter ──────────────────────────────────────────────────────────────────

export class InforWmsAdapter implements InventoryAdapter {
  readonly platform = 'infor-wms'
  readonly version = '0.1.0'

  constructor(_config: InforWmsAdapterConfig = {}) {}

  credentialFields(): CredentialField[] {
    return inforWmsCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return inforWmsExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('infor-wms uses ION API service-account credentials; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return inforWmsRefreshCredentials(credentials)
  }

  private client(credentials: Credentials): InforWmsClient {
    return new InforWmsClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      pageSize: params.limit ?? DEFAULT_PAGE_SIZE,
      ...(params.page ? { pageNumber: params.page } : {}),
    }
  }

  // ── Products ───────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).get<PagedResponse<RawInforWmsItem>>(
      PATHS.items,
      this.listParams(params),
    )
    return (res.items ?? []).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const raw = await this.client(credentials).get<RawInforWmsItem>(PATHS.item(id))
    return transformProduct(raw)
  }

  // ── Stock levels ──────────────────────────────────────────────────────────

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const res = await this.client(credentials).get<PagedResponse<RawInforWmsInventoryBalance>>(
      PATHS.inventoryBalances,
      this.listParams(params),
    )
    return (res.items ?? []).map(transformStockLevel)
  }

  async getStockLevel(_credentials: Credentials, id: string): Promise<StockLevel> {
    throw new Error(`infor-wms: stock-level fetch is bulk-only; call listStockLevels. id=${id}`)
  }

  // ── Locations ──────────────────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const res = await this.client(credentials).get<PagedResponse<RawInforWmsLocation>>(
      PATHS.locations,
      this.listParams(params),
    )
    return (res.items ?? []).map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const raw = await this.client(credentials).get<RawInforWmsLocation>(PATHS.location(id))
    return transformLocation(raw)
  }

  // ── Suppliers ──────────────────────────────────────────────────────────────

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const res = await this.client(credentials).get<PagedResponse<RawInforWmsSupplier>>(
      PATHS.suppliers,
      this.listParams(params),
    )
    return (res.items ?? []).map(transformSupplier)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const raw = await this.client(credentials).get<RawInforWmsSupplier>(PATHS.supplier(id))
    return transformSupplier(raw)
  }

  // ── Purchase orders ────────────────────────────────────────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const res = await this.client(credentials).get<PagedResponse<RawInforWmsPurchaseOrder>>(
      PATHS.purchaseOrders,
      this.listParams(params),
    )
    return (res.items ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const raw = await this.client(credentials).get<RawInforWmsPurchaseOrder>(PATHS.purchaseOrder(id))
    return transformPurchaseOrder(raw)
  }

  // ── Stock transfers ────────────────────────────────────────────────────────

  async listStockTransfers(credentials: Credentials, params: QueryParams): Promise<StockTransfer[]> {
    const res = await this.client(credentials).get<PagedResponse<RawInforWmsTransferOrder>>(
      PATHS.transferOrders,
      this.listParams(params),
    )
    return (res.items ?? []).map(transformStockTransfer)
  }

  async getStockTransfer(credentials: Credentials, id: string): Promise<StockTransfer> {
    const raw = await this.client(credentials).get<RawInforWmsTransferOrder>(PATHS.transferOrder(id))
    return transformStockTransfer(raw)
  }

  // ── Stock adjustments ──────────────────────────────────────────────────────

  async listStockAdjustments(credentials: Credentials, params: QueryParams): Promise<StockAdjustment[]> {
    const res = await this.client(credentials).get<PagedResponse<RawInforWmsAdjustment>>(
      PATHS.adjustments,
      this.listParams(params),
    )
    return (res.items ?? []).map(transformStockAdjustment)
  }

  async getStockAdjustment(credentials: Credentials, id: string): Promise<StockAdjustment> {
    const raw = await this.client(credentials).get<RawInforWmsAdjustment>(PATHS.adjustment(id))
    return transformStockAdjustment(raw)
  }
}
