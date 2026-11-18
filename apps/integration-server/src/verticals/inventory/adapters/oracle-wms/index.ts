/**
 * Oracle Warehouse Management Cloud adapter
 *
 * Auth: OAuth 2.0 (authorization_code or client_credentials grant)
 * API:  lgfapi v10  —  https://{wmsDomain}/{envName}/wms/lgfapi/v10/entity/
 *
 * Supported resources:
 *   products           → entity/item
 *   stock-levels       → entity/inventory
 *   locations          → entity/location
 *   suppliers          → entity/vendor
 *   purchase-orders    → entity/purchase_order_hdr
 *   stock-transfers    → entity/transfer_order_hdr
 *   stock-adjustments  → entity/inventory_adjustment_hdr
 *
 * Webhooks: NOT supported (Oracle WMS uses REST polling, no HMAC push events).
 *
 * Docs: https://docs.oracle.com/en/cloud/saas/warehouse-management/26a/owmre/
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

import {credentialFields as oracleWmsCredentialFields, exchangeCredentials as oracleWmsExchangeCredentials, refreshCredentials as oracleWmsRefreshCredentials} from './auth'
import {OracleWmsClient} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'
import {verifyOracleWmsWebhook, parseOracleWmsWebhookEvents} from './webhook'

import {transformProduct, type RawOracleWmsItem} from './transform/product'
import {transformStockLevel, type RawOracleWmsInventory} from './transform/stock-level'
import {transformLocation, type RawOracleWmsLocation} from './transform/location'
import {transformSupplier, type RawOracleWmsVendor} from './transform/supplier'
import {transformPurchaseOrder, type RawOracleWmsPurchaseOrderHdr} from './transform/purchase-order'
import {transformStockTransfer, type RawOracleWmsTransferOrderHdr} from './transform/stock-transfer'
import {transformStockAdjustment, type RawOracleWmsInventoryAdjustmentHdr} from './transform/stock-adjustment'

export interface OracleWmsAdapterConfig {
  clientId: string
  clientSecret: string
  _redirectUri: string
  scopes?: string[]
}

export class OracleWmsAdapter implements InventoryAdapter {
  readonly platform = 'oracle-wms'
  readonly version = '0.1.0'

  constructor(_config: OracleWmsAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return oracleWmsCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return oracleWmsExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    throw new Error(
      'oracle-wms uses OAuth2 client credentials via WMS IDCS; use credentialFields() + exchangeCredentials()',
    )
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error(
      'oracle-wms uses OAuth2 client credentials via WMS IDCS; use credentialFields() + exchangeCredentials()',
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return oracleWmsRefreshCredentials(credentials)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyOracleWmsWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>) {
    return parseOracleWmsWebhookEvents(payload)
  }

  private client(credentials: Credentials): OracleWmsClient {
    return new OracleWmsClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      page_size: params.limit ?? DEFAULT_PAGE_SIZE,
      ...(params.page ? { page: params.page } : {}),
    }
  }

  // ── Products (entity/item) ──────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).list<RawOracleWmsItem>('item', this.listParams(params))
    return (res.results ?? []).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const raw = await this.client(credentials).getById<RawOracleWmsItem>('item', id)
    return transformProduct(raw)
  }

  // ── StockLevels (entity/inventory) ────────────────────────────────────

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const res = await this.client(credentials).list<RawOracleWmsInventory>('inventory', this.listParams(params))
    return (res.results ?? []).map(transformStockLevel)
  }

  async getStockLevel(_credentials: Credentials, id: string): Promise<StockLevel> {
    throw new Error(`oracle-wms stock-level fetch is bulk-only; call listStockLevels with item_id/location_id filters. id=${id}`)
  }

  // ── Locations (entity/location) ────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const res = await this.client(credentials).list<RawOracleWmsLocation>('location', this.listParams(params))
    return (res.results ?? []).map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const raw = await this.client(credentials).getById<RawOracleWmsLocation>('location', id)
    return transformLocation(raw)
  }

  // ── Suppliers (entity/vendor) ──────────────────────────────────────────

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const res = await this.client(credentials).list<RawOracleWmsVendor>('vendor', this.listParams(params))
    return (res.results ?? []).map(transformSupplier)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const raw = await this.client(credentials).getById<RawOracleWmsVendor>('vendor', id)
    return transformSupplier(raw)
  }

  // ── PurchaseOrders (entity/purchase_order_hdr) ────────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const res = await this.client(credentials).list<RawOracleWmsPurchaseOrderHdr>('purchase_order_hdr', this.listParams(params))
    return (res.results ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const raw = await this.client(credentials).getById<RawOracleWmsPurchaseOrderHdr>('purchase_order_hdr', id)
    return transformPurchaseOrder(raw)
  }

  // ── StockTransfers (entity/transfer_order_hdr) ────────────────────────

  async listStockTransfers(credentials: Credentials, params: QueryParams): Promise<StockTransfer[]> {
    const res = await this.client(credentials).list<RawOracleWmsTransferOrderHdr>('transfer_order_hdr', this.listParams(params))
    return (res.results ?? []).map(transformStockTransfer)
  }

  async getStockTransfer(credentials: Credentials, id: string): Promise<StockTransfer> {
    const raw = await this.client(credentials).getById<RawOracleWmsTransferOrderHdr>('transfer_order_hdr', id)
    return transformStockTransfer(raw)
  }

  // ── StockAdjustments (entity/inventory_adjustment_hdr) ────────────────

  async listStockAdjustments(credentials: Credentials, params: QueryParams): Promise<StockAdjustment[]> {
    const res = await this.client(credentials).list<RawOracleWmsInventoryAdjustmentHdr>('inventory_adjustment_hdr', this.listParams(params))
    return (res.results ?? []).map(transformStockAdjustment)
  }

  async getStockAdjustment(credentials: Credentials, id: string): Promise<StockAdjustment> {
    const raw = await this.client(credentials).getById<RawOracleWmsInventoryAdjustmentHdr>('inventory_adjustment_hdr', id)
    return transformStockAdjustment(raw)
  }
}
