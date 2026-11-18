/**
 * Fulfil.io adapter for the inventory vertical.
 *
 * Fulfil.io is a Tryton-based cloud ERP for eCommerce brands.
 * Base URL: https://{subdomain}.fulfil.io/api/v2
 * Auth: x-api-key header (single API key per subdomain).
 *
 * Schema-firewall: no product images, no supplier banking, BOM refused.
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

import {credentialFields as fulfilCredentialFields, exchangeCredentials as fulfilExchangeCredentials, getAuthUrlUnsupported} from './auth'
import {FulfilClient} from './client'
import {DEFAULT_PAGE_SIZE, MODELS} from './constants'
import {verifyFulfilWebhook, parseFulfilWebhookEvents} from './webhook'

import {transformProduct, type RawFulfilProduct, PRODUCT_FIELDS} from './transform/product'
import {transformStockLevel, type RawFulfilStockLevel, STOCK_LEVEL_FIELDS} from './transform/stock-level'
import {transformLocation, type RawFulfilLocation, LOCATION_FIELDS} from './transform/location'
import {transformSupplier, type RawFulfilParty, SUPPLIER_FIELDS} from './transform/supplier'
import {
  transformPurchaseOrder,
  type RawFulfilPurchaseOrder,
  PURCHASE_FIELDS,
} from './transform/purchase-order'
import {
  transformStockTransfer,
  type RawFulfilStockTransfer,
  STOCK_TRANSFER_FIELDS,
} from './transform/stock-transfer'
import {
  transformStockAdjustment,
  type RawFulfilStockAdjustment,
  STOCK_ADJUSTMENT_FIELDS,
} from './transform/stock-adjustment'

export interface FulfilIoAdapterConfig {
  /** Reserved for future config fields; no client credentials needed at class level. */
  [key: string]: unknown
}

export class FulfilIoAdapter implements InventoryAdapter {
  readonly platform = 'fulfil-io'
  readonly version = '0.1.0'

  constructor(_config: FulfilIoAdapterConfig = {}) {}

  credentialFields(): CredentialField[] {
    return fulfilCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return fulfilExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('fulfil-io uses static API key; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyFulfilWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseFulfilWebhookEvents(payload)
  }

  private client(credentials: Credentials): FulfilClient {
    return new FulfilClient(credentials)
  }

  private pageNum(params: QueryParams): number {
    return params.page ?? 1
  }

  private perPage(params: QueryParams): number {
    return params.limit ?? DEFAULT_PAGE_SIZE
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const raws = await this.client(credentials).list<RawFulfilProduct>(
      MODELS.PRODUCT,
      PRODUCT_FIELDS,
      this.pageNum(params),
      this.perPage(params),
    )
    return raws.map((r) => { try { return transformProduct(r) } catch { return null } }).filter(Boolean) as Product[]
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const raw = await this.client(credentials).getById<RawFulfilProduct>(
      MODELS.PRODUCT,
      id,
      PRODUCT_FIELDS,
    )
    return transformProduct(raw)
  }

  // ── StockLevels ───────────────────────────────────────────────────────────

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    // stock.product.location provides per-product per-location on-hand quantities
    const raws = await this.client(credentials).list<RawFulfilStockLevel>(
      'stock.product.location',
      STOCK_LEVEL_FIELDS,
      this.pageNum(params),
      this.perPage(params),
    )
    return raws.map((r) => { try { return transformStockLevel(r) } catch { return null } }).filter(Boolean) as StockLevel[]
  }

  async getStockLevel(_credentials: Credentials, id: string): Promise<StockLevel> {
    throw new Error(`fulfil-io stock-level fetch is bulk-only; call listStockLevels. id=${id}`)
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const raws = await this.client(credentials).list<RawFulfilLocation>(
      MODELS.STOCK_LOCATION,
      LOCATION_FIELDS,
      this.pageNum(params),
      this.perPage(params),
    )
    return raws.map((r) => { try { return transformLocation(r) } catch { return null } }).filter(Boolean) as Location[]
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const raw = await this.client(credentials).getById<RawFulfilLocation>(
      MODELS.STOCK_LOCATION,
      id,
      LOCATION_FIELDS,
    )
    return transformLocation(raw)
  }

  // ── Suppliers ─────────────────────────────────────────────────────────────

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    // Filter to supplier=true parties only
    const raws = await this.client(credentials).searchRead<RawFulfilParty>(
      MODELS.PARTY,
      [['supplier', '=', true]],
      SUPPLIER_FIELDS,
      (this.pageNum(params) - 1) * this.perPage(params),
      this.perPage(params),
    )
    return raws.map((r) => { try { return transformSupplier(r) } catch { return null } }).filter(Boolean) as Supplier[]
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const raw = await this.client(credentials).getById<RawFulfilParty>(
      MODELS.PARTY,
      id,
      SUPPLIER_FIELDS,
    )
    return transformSupplier(raw)
  }

  // ── PurchaseOrders ────────────────────────────────────────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const raws = await this.client(credentials).list<RawFulfilPurchaseOrder>(
      MODELS.PURCHASE,
      PURCHASE_FIELDS,
      this.pageNum(params),
      this.perPage(params),
    )
    return raws.map((r) => { try { return transformPurchaseOrder(r) } catch { return null } }).filter(Boolean) as PurchaseOrder[]
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const raw = await this.client(credentials).getById<RawFulfilPurchaseOrder>(
      MODELS.PURCHASE,
      id,
      PURCHASE_FIELDS,
    )
    return transformPurchaseOrder(raw)
  }

  // ── StockTransfers ────────────────────────────────────────────────────────

  async listStockTransfers(credentials: Credentials, params: QueryParams): Promise<StockTransfer[]> {
    const raws = await this.client(credentials).list<RawFulfilStockTransfer>(
      MODELS.INTERNAL_SHIPMENT,
      STOCK_TRANSFER_FIELDS,
      this.pageNum(params),
      this.perPage(params),
    )
    return raws.map((r) => { try { return transformStockTransfer(r) } catch { return null } }).filter(Boolean) as StockTransfer[]
  }

  async getStockTransfer(credentials: Credentials, id: string): Promise<StockTransfer> {
    const raw = await this.client(credentials).getById<RawFulfilStockTransfer>(
      MODELS.INTERNAL_SHIPMENT,
      id,
      STOCK_TRANSFER_FIELDS,
    )
    return transformStockTransfer(raw)
  }

  // ── StockAdjustments ──────────────────────────────────────────────────────

  async listStockAdjustments(credentials: Credentials, params: QueryParams): Promise<StockAdjustment[]> {
    const raws = await this.client(credentials).list<RawFulfilStockAdjustment>(
      MODELS.STOCK_INVENTORY,
      STOCK_ADJUSTMENT_FIELDS,
      this.pageNum(params),
      this.perPage(params),
    )
    return raws.map((r) => { try { return transformStockAdjustment(r) } catch { return null } }).filter(Boolean) as StockAdjustment[]
  }

  async getStockAdjustment(credentials: Credentials, id: string): Promise<StockAdjustment> {
    const raw = await this.client(credentials).getById<RawFulfilStockAdjustment>(
      MODELS.STOCK_INVENTORY,
      id,
      STOCK_ADJUSTMENT_FIELDS,
    )
    return transformStockAdjustment(raw)
  }
}
