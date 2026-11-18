/**
 * Openbravo ERP inventory adapter.
 *
 * Openbravo is an open-source / cloud ERP with a comprehensive JSON REST
 * Web Services layer. Auth: HTTP Basic (username + password + host URL).
 *
 * Supported resources:
 *   products        → Product entity
 *   stock-levels    → MaterialMgmtStorageDetail entity
 *   locations       → Warehouse entity
 *   suppliers       → BusinessPartner (vendor=Y)
 *   purchase-orders → Order (salesTransaction=N)
 *   stock-transfers → InternalMovement entity
 *   stock-adjustments → MaterialMgmtInventoryCount entity
 *
 * Pagination: _startRow / _endRow (0-based window).
 * Webhooks: no documented signing — verifyWebhook always returns false.
 *
 * Schema-firewall: no product images, no supplier banking, no BOM/manufacturing.
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
import type { WebhookEvent } from '../../schema/webhook'

import {
  credentialFields as obCredentialFields,
  exchangeCredentials as obExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import {OpenbravoClient} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'
import {verifyOpenbravoWebhook, parseOpenbravoWebhookEvents} from './webhook'

import {transformProduct, type RawOpenbravoProduct} from './transform/product'
import {transformStockLevel, type RawOpenbravoStorageDetail} from './transform/stock-level'
import {transformLocation, type RawOpenbravoWarehouse} from './transform/location'
import {transformSupplier, type RawOpenbravoBusinessPartner} from './transform/supplier'
import {transformPurchaseOrder, type RawOpenbravoOrder} from './transform/purchase-order'
import {transformStockTransfer, type RawOpenbravoInternalMovement} from './transform/stock-transfer'
import {transformStockAdjustment, type RawOpenbravoInventoryCount} from './transform/stock-adjustment'

export type OpenbravoAdapterConfig = Record<string, never>

export class OpenbravoAdapter implements InventoryAdapter {
  readonly platform = 'openbravo'
  readonly version = '0.1.0'

  constructor(_config: OpenbravoAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return obCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return obExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('openbravo uses HTTP Basic Auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Basic auth credentials do not expire.
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyOpenbravoWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseOpenbravoWebhookEvents(payload)
  }

  private client(credentials: Credentials): OpenbravoClient {
    return new OpenbravoClient(credentials)
  }

  /**
   * Build _startRow / _endRow pagination params from QueryParams.
   * `params.page` is 1-based; `params.limit` is page size.
   */
  private pageParams(params: QueryParams, extra?: Record<string, unknown>): Record<string, unknown> {
    const size = params.limit ?? DEFAULT_PAGE_SIZE
    const page = (params.page ?? 1) - 1 // convert to 0-based page index
    const startRow = page * size
    return {
      _startRow: startRow,
      _endRow: startRow + size,
      ...extra,
    }
  }

  // ── Products ───────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).list<RawOpenbravoProduct>(
      'Product',
      this.pageParams(params),
    )
    return (res.data ?? []).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const raw = await this.client(credentials).getById<RawOpenbravoProduct>('Product', id)
    return transformProduct(raw)
  }

  // ── Stock Levels ───────────────────────────────────────────────────────────

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const res = await this.client(credentials).list<RawOpenbravoStorageDetail>(
      'MaterialMgmtStorageDetail',
      this.pageParams(params),
    )
    return (res.data ?? []).map(transformStockLevel)
  }

  async getStockLevel(credentials: Credentials, id: string): Promise<StockLevel> {
    const raw = await this.client(credentials).getById<RawOpenbravoStorageDetail>(
      'MaterialMgmtStorageDetail',
      id,
    )
    return transformStockLevel(raw)
  }

  // ── Locations ──────────────────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const res = await this.client(credentials).list<RawOpenbravoWarehouse>(
      'Warehouse',
      this.pageParams(params),
    )
    return (res.data ?? []).map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const raw = await this.client(credentials).getById<RawOpenbravoWarehouse>('Warehouse', id)
    return transformLocation(raw)
  }

  // ── Suppliers ──────────────────────────────────────────────────────────────

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const res = await this.client(credentials).list<RawOpenbravoBusinessPartner>(
      'BusinessPartner',
      this.pageParams(params, { _where: "vendor='Y'" }),
    )
    return (res.data ?? []).map(transformSupplier)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const raw = await this.client(credentials).getById<RawOpenbravoBusinessPartner>(
      'BusinessPartner',
      id,
    )
    return transformSupplier(raw)
  }

  // ── Purchase Orders ────────────────────────────────────────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const res = await this.client(credentials).list<RawOpenbravoOrder>(
      'Order',
      this.pageParams(params, { _where: "salesTransaction='N'" }),
    )
    return (res.data ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const raw = await this.client(credentials).getById<RawOpenbravoOrder>('Order', id)
    return transformPurchaseOrder(raw)
  }

  // ── Stock Transfers ────────────────────────────────────────────────────────

  async listStockTransfers(credentials: Credentials, params: QueryParams): Promise<StockTransfer[]> {
    const res = await this.client(credentials).list<RawOpenbravoInternalMovement>(
      'InternalMovement',
      this.pageParams(params),
    )
    return (res.data ?? []).map(transformStockTransfer)
  }

  async getStockTransfer(credentials: Credentials, id: string): Promise<StockTransfer> {
    const raw = await this.client(credentials).getById<RawOpenbravoInternalMovement>(
      'InternalMovement',
      id,
    )
    return transformStockTransfer(raw)
  }

  // ── Stock Adjustments ──────────────────────────────────────────────────────

  async listStockAdjustments(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<StockAdjustment[]> {
    const res = await this.client(credentials).list<RawOpenbravoInventoryCount>(
      'MaterialMgmtInventoryCount',
      this.pageParams(params),
    )
    return (res.data ?? []).map(transformStockAdjustment)
  }

  async getStockAdjustment(credentials: Credentials, id: string): Promise<StockAdjustment> {
    const raw = await this.client(credentials).getById<RawOpenbravoInventoryCount>(
      'MaterialMgmtInventoryCount',
      id,
    )
    return transformStockAdjustment(raw)
  }
}
