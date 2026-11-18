/**
 * AdvancePro (APTX) inventory adapter.
 *
 * AdvancePro is a warehouse/inventory management platform from AdvanceWare
 * Technologies.  The public REST API (v1) lives at advanceware.net/RESTAPIv1.
 *
 * Auth: POST /api/Authenticate/login (username + password) → JWT Bearer token.
 * The task brief specifies auth=basic; we model this as username+password
 * credential fields that are exchanged for a short-lived JWT on first use.
 *
 * Supported resources: products, stock-levels, locations (warehouses),
 * suppliers (vendors), purchase-orders, stock-adjustments, stock-transfers.
 *
 * Webhooks: AdvancePro does not publish a documented webhook signing scheme;
 * webhook.ts is intentionally omitted.
 *
 * Schema-firewall: no product images, no supplier banking details,
 * no manufacturing BOMs / work orders.
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
  credentialFields as advanceProCredentialFields,
  exchangeCredentials as advanceProExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import {AdvanceProClient} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'

import {transformProduct, type RawAdvanceProProduct} from './transform/product'
import {transformStockLevel, type RawAdvanceProStockLevel} from './transform/stock-level'
import {transformLocation, type RawAdvanceProWarehouse} from './transform/location'
import {transformSupplier, type RawAdvanceProVendor} from './transform/supplier'
import {transformPurchaseOrder, type RawAdvanceProPurchaseOrder} from './transform/purchase-order'
import {transformStockTransfer, type RawAdvanceProStockTransfer} from './transform/stock-transfer'
import {transformStockAdjustment, type RawAdvanceProStockAdjustment} from './transform/stock-adjustment'

export interface AdvanceProAdapterConfig {
  /** Not used for OAuth — placeholder to satisfy InventoryAdapter config conventions. */
  clientId?: string
}

// AdvancePro list endpoints wrap results in a top-level array or a data envelope
type ListEnvelope<T> = T[] | { data?: T[]; items?: T[]; records?: T[]; total?: number }

function unwrapList<T>(res: ListEnvelope<T>): T[] {
  if (Array.isArray(res)) return res
  return res.data ?? res.items ?? res.records ?? []
}

// Single-item endpoints return the object directly or wrapped in { data: ... }
type SingleEnvelope<T> = T | { data?: T }

function unwrapSingle<T>(res: SingleEnvelope<T>): T {
  if (res && typeof res === 'object' && 'data' in (res as Record<string, unknown>)) {
    return (res as { data: T }).data ?? (res as T)
  }
  return res as T
}

export class AdvanceProAdapter implements InventoryAdapter {
  readonly platform = 'advance-pro'
  readonly version = '0.1.0'

  constructor(_config?: AdvanceProAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return advanceProCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return advanceProExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('advance-pro uses username + password; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // JWTs are short-lived; the client re-authenticates automatically when
    // the token expires.  Simply return as-is; the client handles re-auth.
    return credentials
  }

  private client(credentials: Credentials): AdvanceProClient {
    return new AdvanceProClient(credentials)
  }

  private pageParams(params: QueryParams): Record<string, unknown> {
    return {
      pageSize: params.limit ?? DEFAULT_PAGE_SIZE,
      ...(params.page ? { pageNumber: params.page } : {}),
    }
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).get<ListEnvelope<RawAdvanceProProduct>>(
      'api/Products',
      this.pageParams(params),
    )
    return unwrapList(res).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).get<SingleEnvelope<RawAdvanceProProduct>>(
      `api/Products/${id}`,
    )
    return transformProduct(unwrapSingle(res))
  }

  // ── Stock Levels ──────────────────────────────────────────────────────────

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const res = await this.client(credentials).get<ListEnvelope<RawAdvanceProStockLevel>>(
      'api/Inventory',
      this.pageParams(params),
    )
    return unwrapList(res).map(transformStockLevel)
  }

  async getStockLevel(_credentials: Credentials, id: string): Promise<StockLevel> {
    // AdvancePro inventory is bulk-only; no single-record endpoint is documented
    throw new Error(
      `advance-pro stock-level fetch is bulk-only; call listStockLevels. id=${id}`,
    )
  }

  // ── Locations / Warehouses ────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const res = await this.client(credentials).get<ListEnvelope<RawAdvanceProWarehouse>>(
      'api/Warehouses',
      this.pageParams(params),
    )
    return unwrapList(res).map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const res = await this.client(credentials).get<SingleEnvelope<RawAdvanceProWarehouse>>(
      `api/Warehouses/${id}`,
    )
    return transformLocation(unwrapSingle(res))
  }

  // ── Suppliers / Vendors ───────────────────────────────────────────────────

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const res = await this.client(credentials).get<ListEnvelope<RawAdvanceProVendor>>(
      'api/Vendors',
      this.pageParams(params),
    )
    return unwrapList(res).map(transformSupplier)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const res = await this.client(credentials).get<SingleEnvelope<RawAdvanceProVendor>>(
      `api/Vendors/${id}`,
    )
    return transformSupplier(unwrapSingle(res))
  }

  // ── Purchase Orders ───────────────────────────────────────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const res = await this.client(credentials).get<ListEnvelope<RawAdvanceProPurchaseOrder>>(
      'api/PurchaseOrders',
      this.pageParams(params),
    )
    return unwrapList(res).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const res = await this.client(credentials).get<SingleEnvelope<RawAdvanceProPurchaseOrder>>(
      `api/PurchaseOrders/${id}`,
    )
    return transformPurchaseOrder(unwrapSingle(res))
  }

  // ── Stock Transfers ───────────────────────────────────────────────────────

  async listStockTransfers(credentials: Credentials, params: QueryParams): Promise<StockTransfer[]> {
    const res = await this.client(credentials).get<ListEnvelope<RawAdvanceProStockTransfer>>(
      'api/StockTransfers',
      this.pageParams(params),
    )
    return unwrapList(res).map(transformStockTransfer)
  }

  async getStockTransfer(credentials: Credentials, id: string): Promise<StockTransfer> {
    const res = await this.client(credentials).get<SingleEnvelope<RawAdvanceProStockTransfer>>(
      `api/StockTransfers/${id}`,
    )
    return transformStockTransfer(unwrapSingle(res))
  }

  // ── Stock Adjustments ─────────────────────────────────────────────────────

  async listStockAdjustments(credentials: Credentials, params: QueryParams): Promise<StockAdjustment[]> {
    const res = await this.client(credentials).get<ListEnvelope<RawAdvanceProStockAdjustment>>(
      'api/StockAdjustments',
      this.pageParams(params),
    )
    return unwrapList(res).map(transformStockAdjustment)
  }

  async getStockAdjustment(credentials: Credentials, id: string): Promise<StockAdjustment> {
    const res = await this.client(credentials).get<SingleEnvelope<RawAdvanceProStockAdjustment>>(
      `api/StockAdjustments/${id}`,
    )
    return transformStockAdjustment(unwrapSingle(res))
  }
}
