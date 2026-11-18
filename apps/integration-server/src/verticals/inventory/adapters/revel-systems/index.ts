/**
 * Revel Systems inventory adapter.
 *
 * Auth:        OAuth2 client_credentials (machine-to-machine)
 * Base URL:    https://{subdomain}.revelup.com/resources/
 * Pagination:  ?limit=N&offset=N  →  { meta: { total_count, limit, offset }, objects: [...] }
 *
 * Supported resources:
 *   Product          → /resources/Product/         (sellable items)
 *   Ingredient       → /resources/Ingredient/      (stock-tracked items — stock levels)
 *   Establishment    → /resources/Establishment/   (POS locations)
 *   Vendor           → /resources/Vendor/          (suppliers)
 *   PurchaseOrder    → /resources/PurchaseOrder/
 *   InventoryTransfer → /resources/InventoryTransfer/
 *   InventoryAdjustment → /resources/InventoryAdjustment/
 *
 * Webhooks: HMAC-SHA1 via X-Revel-Signature; inout.stock + menu.updated events.
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
  credentialFields as revelCredentialFields,
  exchangeCredentials as revelExchangeCredentials,
  getAuthUrl as revelGetAuthUrl,
  refreshCredentials as revelRefreshCredentials,
  ensureAuth,
} from './auth'
import {RevelSystemsClient} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'
import {verifyRevelWebhook, parseRevelWebhookEvents} from './webhook'

import {transformProduct, type RawRevelProduct} from './transform/product'
import {transformStockLevel, type RawRevelIngredient} from './transform/stock-level'
import {transformLocation, type RawRevelEstablishment} from './transform/location'
import {transformSupplier, type RawRevelVendor} from './transform/supplier'
import {transformPurchaseOrder, type RawRevelPurchaseOrder} from './transform/purchase-order'
import {transformStockTransfer, type RawRevelInventoryTransfer} from './transform/stock-transfer'
import {transformStockAdjustment, type RawRevelInventoryAdjustment} from './transform/stock-adjustment'

/** Revel list response shape: { meta: { total_count, limit, offset, next, previous }, objects: T[] } */
interface RevelListResponse<T> {
  meta?: { total_count?: number; limit?: number; offset?: number; next?: string | null; previous?: string | null }
  objects?: T[]
}

export interface RevelSystemsAdapterConfig {
  clientId: string
  clientSecret: string
}

export class RevelSystemsAdapter implements InventoryAdapter {
  readonly platform = 'revel-systems'
  readonly version = '0.1.0'

  constructor(_config: RevelSystemsAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return revelCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return revelExchangeCredentials(fields)
  }

  getAuthUrl(state: string): string {
    return revelGetAuthUrl(state)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('revel-systems uses client_credentials OAuth2; use credentialFields() + exchangeCredentials() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return revelRefreshCredentials(credentials)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyRevelWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseRevelWebhookEvents(payload)
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private async client(credentials: Credentials): Promise<RevelSystemsClient> {
    const fresh = await ensureAuth(credentials)
    return new RevelSystemsClient(fresh)
  }

  private pageParams(params: QueryParams): Record<string, unknown> {
    const offset = params.page !== undefined ? (params.page - 1) * (params.limit ?? DEFAULT_PAGE_SIZE) : 0
    return {
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
      offset,
      format: 'json',
    }
  }

  // ── Products ───────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const c = await this.client(credentials)
    const res = await c.get<RevelListResponse<RawRevelProduct>>('/Product/', this.pageParams(params))
    return (res.objects ?? []).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const c = await this.client(credentials)
    const raw = await c.get<RawRevelProduct>(`/Product/${id}/`)
    return transformProduct(raw)
  }

  // ── StockLevels (via Ingredient) ───────────────────────────────────────────

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const c = await this.client(credentials)
    const res = await c.get<RevelListResponse<RawRevelIngredient>>('/Ingredient/', this.pageParams(params))
    return (res.objects ?? []).map(transformStockLevel)
  }

  async getStockLevel(credentials: Credentials, id: string): Promise<StockLevel> {
    const c = await this.client(credentials)
    const raw = await c.get<RawRevelIngredient>(`/Ingredient/${id}/`)
    return transformStockLevel(raw)
  }

  // ── Locations (via Establishment) ─────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const c = await this.client(credentials)
    const res = await c.get<RevelListResponse<RawRevelEstablishment>>('/Establishment/', this.pageParams(params))
    return (res.objects ?? []).map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const c = await this.client(credentials)
    const raw = await c.get<RawRevelEstablishment>(`/Establishment/${id}/`)
    return transformLocation(raw)
  }

  // ── Suppliers (via Vendor) ────────────────────────────────────────────────

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const c = await this.client(credentials)
    const res = await c.get<RevelListResponse<RawRevelVendor>>('/Vendor/', this.pageParams(params))
    return (res.objects ?? []).map(transformSupplier)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const c = await this.client(credentials)
    const raw = await c.get<RawRevelVendor>(`/Vendor/${id}/`)
    return transformSupplier(raw)
  }

  // ── PurchaseOrders ────────────────────────────────────────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const c = await this.client(credentials)
    const res = await c.get<RevelListResponse<RawRevelPurchaseOrder>>('/PurchaseOrder/', this.pageParams(params))
    return (res.objects ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const c = await this.client(credentials)
    const raw = await c.get<RawRevelPurchaseOrder>(`/PurchaseOrder/${id}/`)
    return transformPurchaseOrder(raw)
  }

  // ── StockTransfers (via InventoryTransfer) ────────────────────────────────

  async listStockTransfers(credentials: Credentials, params: QueryParams): Promise<StockTransfer[]> {
    const c = await this.client(credentials)
    const res = await c.get<RevelListResponse<RawRevelInventoryTransfer>>('/InventoryTransfer/', this.pageParams(params))
    return (res.objects ?? []).map(transformStockTransfer)
  }

  async getStockTransfer(credentials: Credentials, id: string): Promise<StockTransfer> {
    const c = await this.client(credentials)
    const raw = await c.get<RawRevelInventoryTransfer>(`/InventoryTransfer/${id}/`)
    return transformStockTransfer(raw)
  }

  // ── StockAdjustments (via InventoryAdjustment) ────────────────────────────

  async listStockAdjustments(credentials: Credentials, params: QueryParams): Promise<StockAdjustment[]> {
    const c = await this.client(credentials)
    const res = await c.get<RevelListResponse<RawRevelInventoryAdjustment>>('/InventoryAdjustment/', this.pageParams(params))
    return (res.objects ?? []).map(transformStockAdjustment)
  }

  async getStockAdjustment(credentials: Credentials, id: string): Promise<StockAdjustment> {
    const c = await this.client(credentials)
    const raw = await c.get<RawRevelInventoryAdjustment>(`/InventoryAdjustment/${id}/`)
    return transformStockAdjustment(raw)
  }
}
