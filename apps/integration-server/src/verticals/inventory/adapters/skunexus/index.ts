/**
 * SkuNexus adapter — inventory vertical.
 *
 * SkuNexus is an AI-powered inventory, order, and warehouse management platform
 * for eCommerce merchants. It provides real-time inventory tracking, automated
 * order processing, and multi-carrier shipping via a Rails-based REST JSON API.
 *
 * Auth: single API key sent as X-API-Key request header.
 * Pagination: page + per_page (1-indexed), list envelope: { data: T[], meta: { ... } }
 * Schema-firewall: no product images, no supplier banking, no manufacturing BOM.
 *
 * Webhook signing: SkuNexus does not publicly document HMAC/JWT signing for
 * webhooks — verifyWebhook / parseWebhookEvents are therefore not implemented.
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
  credentialFields as skunexusCredentialFields,
  exchangeCredentials as skunexusExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import {SkuNexusClient} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'

import {transformProduct, type RawSkuNexusProduct} from './transform/product'
import {transformStockLevel, type RawSkuNexusStockLevel} from './transform/stock-level'
import {transformLocation, type RawSkuNexusLocation} from './transform/location'
import {transformSupplier, type RawSkuNexusSupplier} from './transform/supplier'
import {transformPurchaseOrder, type RawSkuNexusPurchaseOrder} from './transform/purchase-order'
import {transformStockTransfer, type RawSkuNexusStockTransfer} from './transform/stock-transfer'
import {transformStockAdjustment, type RawSkuNexusStockAdjustment} from './transform/stock-adjustment'

export interface SkuNexusAdapterConfig {
  /** Reserved for future OAuth / tenant-scoping config. */
  [key: string]: unknown
}

/** Standard Rails REST list envelope returned by the SkuNexus API. */
interface ListEnvelope<T> {
  data?: T[]
  meta?: { total_count?: number; current_page?: number; total_pages?: number }
}

/** Single-item envelope returned by the SkuNexus API. */
interface ItemEnvelope<T> {
  data?: T
}

export class SkuNexusAdapter implements InventoryAdapter {
  readonly platform = 'skunexus'
  readonly version = '0.1.0'

  constructor(_config: SkuNexusAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return skunexusCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>) {
    return skunexusExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('skunexus uses a static API key; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): SkuNexusClient {
    return new SkuNexusClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      per_page: params.limit ?? DEFAULT_PAGE_SIZE,
      ...(params.page ? { page: params.page } : {}),
    }
  }

  // ── Products ───────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).get<ListEnvelope<RawSkuNexusProduct>>('/products', this.listParams(params))
    return (res.data ?? []).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).get<ItemEnvelope<RawSkuNexusProduct>>(`/products/${id}`)
    if (!res.data) throw new Error(`skunexus product ${id} not found`)
    return transformProduct(res.data)
  }

  // ── Stock levels ───────────────────────────────────────────────────────────

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const res = await this.client(credentials).get<ListEnvelope<RawSkuNexusStockLevel>>('/inventory', this.listParams(params))
    return (res.data ?? []).map(transformStockLevel)
  }

  async getStockLevel(_credentials: Credentials, id: string): Promise<StockLevel> {
    // SkuNexus stock level records are keyed by product+location tuple, not a stable single ID.
    throw new Error(`skunexus stock-level fetch is bulk-only; call listStockLevels. id=${id}`)
  }

  // ── Locations ──────────────────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const res = await this.client(credentials).get<ListEnvelope<RawSkuNexusLocation>>('/locations', this.listParams(params))
    return (res.data ?? []).map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const res = await this.client(credentials).get<ItemEnvelope<RawSkuNexusLocation>>(`/locations/${id}`)
    if (!res.data) throw new Error(`skunexus location ${id} not found`)
    return transformLocation(res.data)
  }

  // ── Suppliers (vendors) ────────────────────────────────────────────────────

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const res = await this.client(credentials).get<ListEnvelope<RawSkuNexusSupplier>>('/vendors', this.listParams(params))
    return (res.data ?? []).map(transformSupplier)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const res = await this.client(credentials).get<ItemEnvelope<RawSkuNexusSupplier>>(`/vendors/${id}`)
    if (!res.data) throw new Error(`skunexus vendor ${id} not found`)
    return transformSupplier(res.data)
  }

  // ── Purchase orders ────────────────────────────────────────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const res = await this.client(credentials).get<ListEnvelope<RawSkuNexusPurchaseOrder>>('/purchase_orders', this.listParams(params))
    return (res.data ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const res = await this.client(credentials).get<ItemEnvelope<RawSkuNexusPurchaseOrder>>(`/purchase_orders/${id}`)
    if (!res.data) throw new Error(`skunexus purchase order ${id} not found`)
    return transformPurchaseOrder(res.data)
  }

  // ── Stock transfers ────────────────────────────────────────────────────────

  async listStockTransfers(credentials: Credentials, params: QueryParams): Promise<StockTransfer[]> {
    const res = await this.client(credentials).get<ListEnvelope<RawSkuNexusStockTransfer>>('/transfer_orders', this.listParams(params))
    return (res.data ?? []).map(transformStockTransfer)
  }

  async getStockTransfer(credentials: Credentials, id: string): Promise<StockTransfer> {
    const res = await this.client(credentials).get<ItemEnvelope<RawSkuNexusStockTransfer>>(`/transfer_orders/${id}`)
    if (!res.data) throw new Error(`skunexus transfer order ${id} not found`)
    return transformStockTransfer(res.data)
  }

  // ── Stock adjustments ──────────────────────────────────────────────────────

  async listStockAdjustments(credentials: Credentials, params: QueryParams): Promise<StockAdjustment[]> {
    const res = await this.client(credentials).get<ListEnvelope<RawSkuNexusStockAdjustment>>('/inventory_adjustments', this.listParams(params))
    return (res.data ?? []).map(transformStockAdjustment)
  }

  async getStockAdjustment(credentials: Credentials, id: string): Promise<StockAdjustment> {
    const res = await this.client(credentials).get<ItemEnvelope<RawSkuNexusStockAdjustment>>(`/inventory_adjustments/${id}`)
    if (!res.data) throw new Error(`skunexus inventory adjustment ${id} not found`)
    return transformStockAdjustment(res.data)
  }
}
