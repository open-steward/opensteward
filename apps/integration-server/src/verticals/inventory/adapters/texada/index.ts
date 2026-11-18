/**
 * Texada CloudLink adapter for the inventory vertical.
 *
 * Texada is an equipment rental / fleet management platform (SRM + CloudLink).
 * Auth: x-api-key exchanged for a short-lived Bearer token via POST /auth.
 *       Tenant slug is also required (from the CloudLink URL).
 * Base URL: https://use-api.cloudlink.texadasoftware.com/v1/{tenant}/
 * Pagination: zero-based ?page=N&size=N (max 1000 per page).
 *
 * Supported resources: products (equipment models), stock-levels (per branch),
 * locations (branches/depots), suppliers (vendors), purchase-orders,
 * stock-transfers (branch transfers), stock-adjustments.
 *
 * Webhooks: Texada does not document HMAC/JWT-signed webhook delivery;
 * verifyWebhook and parseWebhookEvents are intentionally omitted.
 *
 * Schema-firewall: no product images, no supplier banking details, no
 * manufacturing BOM, no customer rental order data.
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
  credentialFields as texadaCredentialFields,
  exchangeCredentials as texadaExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import {TexadaClient} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'

import {transformProduct, type RawTexadaProduct} from './transform/product'
import {transformStockLevel, type RawTexadaStockLevel} from './transform/stock-level'
import {transformLocation, type RawTexadaLocation} from './transform/location'
import {transformSupplier, type RawTexadaSupplier} from './transform/supplier'
import {transformPurchaseOrder, type RawTexadaPurchaseOrder} from './transform/purchase-order'
import {transformStockTransfer, type RawTexadaStockTransfer} from './transform/stock-transfer'
import {transformStockAdjustment, type RawTexadaStockAdjustment} from './transform/stock-adjustment'

export interface TexadaAdapterConfig {
  /** Unused — Texada uses API key + tenant, not OAuth client credentials */
  clientId?: string
}

/**
 * Generic CloudLink paginated list envelope.
 * Texada wraps arrays in { data: [...], totalCount: N, page: N, size: N }.
 */
interface PagedResponse<T> {
  data?: T[]
  items?: T[]
  results?: T[]
  content?: T[]
  totalCount?: number
  total?: number
  page?: number
  size?: number
}

export class TexadaAdapter implements InventoryAdapter {
  readonly platform = 'texada'
  readonly version = '0.1.0'

  constructor(_config?: TexadaAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return texadaCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return texadaExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('texada uses API key + tenant; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // API key never expires; Bearer token is re-fetched per-request by the client
    return credentials
  }

  private client(credentials: Credentials): TexadaClient {
    return new TexadaClient(credentials)
  }

  private pageParams(params: QueryParams): Record<string, unknown> {
    return {
      page: params.page !== undefined ? params.page - 1 : 0, // convert 1-based → 0-based
      size: params.limit ?? DEFAULT_PAGE_SIZE,
    }
  }

  private unwrap<T>(res: PagedResponse<T>): T[] {
    return res.data ?? res.items ?? res.results ?? res.content ?? []
  }

  // ── Products (Equipment Models) ──────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).get<PagedResponse<RawTexadaProduct>>(
      '/Items',
      this.pageParams(params),
    )
    return this.unwrap(res).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const raw = await this.client(credentials).get<RawTexadaProduct>(`/Items/${id}`)
    return transformProduct(raw)
  }

  // ── Stock Levels ─────────────────────────────────────────────────────────

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const res = await this.client(credentials).get<PagedResponse<RawTexadaStockLevel>>(
      '/Inventory',
      this.pageParams(params),
    )
    return this.unwrap(res).map(transformStockLevel)
  }

  async getStockLevel(_credentials: Credentials, id: string): Promise<StockLevel> {
    // Texada inventory is aggregated per item+branch; no single-record endpoint
    throw new Error(`texada stock-level fetch is bulk-only; call listStockLevels. id=${id}`)
  }

  // ── Locations (Branches / Depots) ────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const res = await this.client(credentials).get<PagedResponse<RawTexadaLocation>>(
      '/Branches',
      this.pageParams(params),
    )
    return this.unwrap(res).map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const raw = await this.client(credentials).get<RawTexadaLocation>(`/Branches/${id}`)
    return transformLocation(raw)
  }

  // ── Suppliers (Vendors) ──────────────────────────────────────────────────

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const res = await this.client(credentials).get<PagedResponse<RawTexadaSupplier>>(
      '/Vendors',
      this.pageParams(params),
    )
    return this.unwrap(res).map(transformSupplier)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const raw = await this.client(credentials).get<RawTexadaSupplier>(`/Vendors/${id}`)
    return transformSupplier(raw)
  }

  // ── Purchase Orders ──────────────────────────────────────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const res = await this.client(credentials).get<PagedResponse<RawTexadaPurchaseOrder>>(
      '/PurchaseOrders',
      this.pageParams(params),
    )
    return this.unwrap(res).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const raw = await this.client(credentials).get<RawTexadaPurchaseOrder>(`/PurchaseOrders/${id}`)
    return transformPurchaseOrder(raw)
  }

  // ── Stock Transfers (Branch Transfers) ───────────────────────────────────

  async listStockTransfers(credentials: Credentials, params: QueryParams): Promise<StockTransfer[]> {
    const res = await this.client(credentials).get<PagedResponse<RawTexadaStockTransfer>>(
      '/Transfers',
      this.pageParams(params),
    )
    return this.unwrap(res).map(transformStockTransfer)
  }

  async getStockTransfer(credentials: Credentials, id: string): Promise<StockTransfer> {
    const raw = await this.client(credentials).get<RawTexadaStockTransfer>(`/Transfers/${id}`)
    return transformStockTransfer(raw)
  }

  // ── Stock Adjustments ────────────────────────────────────────────────────

  async listStockAdjustments(credentials: Credentials, params: QueryParams): Promise<StockAdjustment[]> {
    const res = await this.client(credentials).get<PagedResponse<RawTexadaStockAdjustment>>(
      '/Adjustments',
      this.pageParams(params),
    )
    return this.unwrap(res).map(transformStockAdjustment)
  }

  async getStockAdjustment(credentials: Credentials, id: string): Promise<StockAdjustment> {
    const raw = await this.client(credentials).get<RawTexadaStockAdjustment>(`/Adjustments/${id}`)
    return transformStockAdjustment(raw)
  }
}
