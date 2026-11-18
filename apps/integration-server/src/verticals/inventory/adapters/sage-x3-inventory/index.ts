/**
 * Sage X3 inventory adapter.
 *
 * Sage X3 (formerly Sage Enterprise Management) is a mid-market / enterprise
 * ERP platform.  This adapter targets the Sage X3 Web API (api1 / SData 2.0
 * protocol) for inventory operations.
 *
 * Auth:        OAuth2 authorization_code flow
 * Base URL:    https://<tenant>/api1/x3/erp/<FOLDER>
 * Pagination:  count + $startIndex query params
 * Signed webhooks: NOT documented — webhook methods are stubs only.
 *
 * Supported resources:
 *   - products        (ITMMASTER)
 *   - stock-levels    (STKCNSSDIM)
 *   - locations       (STOLOC)
 *   - suppliers       (BPSUPPLIER)
 *   - purchase-orders (PORDER)
 *   - stock-transfers (MISREC)
 *   - stock-adjustments (INVADJ)
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
  getAuthUrl,
  exchangeCode as exchangeOAuthCode,
  refreshCredentials as refreshOAuthCredentials,
  credentialFields as sageCredentialFields,
  type SageX3OAuthConfig,
} from './auth'
import {SageX3Client} from './client'
import {DEFAULT_PAGE_SIZE, REPR} from './constants'
import {verifySageX3Webhook, parseSageX3WebhookEvents} from './webhook'

import {transformProduct, type RawSageX3Product} from './transform/product'
import {transformStockLevel, type RawSageX3StockLevel} from './transform/stock-level'
import {transformLocation, type RawSageX3Location} from './transform/location'
import {transformSupplier, type RawSageX3Supplier} from './transform/supplier'
import {transformPurchaseOrder, type RawSageX3PurchaseOrder} from './transform/purchase-order'
import {transformStockTransfer, type RawSageX3StockTransfer} from './transform/stock-transfer'
import {transformStockAdjustment, type RawSageX3StockAdjustment} from './transform/stock-adjustment'

export interface SageX3InventoryAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  authServerUrl: string
  scopes?: string[]
}

export class SageX3InventoryAdapter implements InventoryAdapter {
  readonly platform = 'sage-x3-inventory'
  readonly version = '0.1.0'

  private oauthConfig: SageX3OAuthConfig

  constructor(config: SageX3InventoryAdapterConfig) {
    this.oauthConfig = {
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: config.redirectUri,
      authServerUrl: config.authServerUrl,
      scopes: config.scopes,
    }
  }

  credentialFields(): CredentialField[] {
    return sageCredentialFields()
  }

  async exchangeCredentials(_fields: Record<string, string>): Promise<Credentials> {
    throw new Error('sage-x3-inventory uses OAuth2; call getAuthUrl() + exchangeCode() instead')
  }

  getAuthUrl(state: string, scopes?: string[]): string {
    return getAuthUrl(this.oauthConfig, state, scopes)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return exchangeOAuthCode(this.oauthConfig, code, redirectUri, {
      serverUrl: '',
      folder: '',
    })
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshOAuthCredentials(credentials)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifySageX3Webhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseSageX3WebhookEvents(payload)
  }

  private client(credentials: Credentials): SageX3Client {
    return new SageX3Client(credentials)
  }

  private pageParams(params: QueryParams): { count: number; $startIndex: number } {
    const pageSize = params.limit ?? DEFAULT_PAGE_SIZE
    const page = params.page ?? 1
    return {
      count: pageSize,
      $startIndex: (page - 1) * pageSize,
    }
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const { count, $startIndex } = this.pageParams(params)
    const res = await this.client(credentials).query<RawSageX3Product>(
      REPR.PRODUCT,
      {},
      count,
      $startIndex,
    )
    return (res.$resources ?? []).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const raw = await this.client(credentials).details<RawSageX3Product>(REPR.PRODUCT, id)
    return transformProduct(raw)
  }

  // ── Stock Levels ──────────────────────────────────────────────────────────

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const { count, $startIndex } = this.pageParams(params)
    const res = await this.client(credentials).query<RawSageX3StockLevel>(
      REPR.STOCK_LEVEL,
      {},
      count,
      $startIndex,
    )
    return (res.$resources ?? []).map(transformStockLevel)
  }

  async getStockLevel(_credentials: Credentials, id: string): Promise<StockLevel> {
    throw new Error(
      `sage-x3-inventory stock levels are site-scoped (STKCNSSDIM); use listStockLevels with a where filter. id=${id}`,
    )
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const { count, $startIndex } = this.pageParams(params)
    const res = await this.client(credentials).query<RawSageX3Location>(
      REPR.LOCATION,
      {},
      count,
      $startIndex,
    )
    return (res.$resources ?? []).map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    // STOLOC key is "SITE:LOCCODE" — encode for URL
    const raw = await this.client(credentials).details<RawSageX3Location>(REPR.LOCATION, id)
    return transformLocation(raw)
  }

  // ── Suppliers ─────────────────────────────────────────────────────────────

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const { count, $startIndex } = this.pageParams(params)
    const res = await this.client(credentials).query<RawSageX3Supplier>(
      REPR.SUPPLIER,
      {},
      count,
      $startIndex,
    )
    return (res.$resources ?? []).map(transformSupplier)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const raw = await this.client(credentials).details<RawSageX3Supplier>(REPR.SUPPLIER, id)
    return transformSupplier(raw)
  }

  // ── Purchase Orders ───────────────────────────────────────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const { count, $startIndex } = this.pageParams(params)
    const res = await this.client(credentials).query<RawSageX3PurchaseOrder>(
      REPR.PURCHASE_ORDER,
      {},
      count,
      $startIndex,
    )
    return (res.$resources ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const raw = await this.client(credentials).details<RawSageX3PurchaseOrder>(
      REPR.PURCHASE_ORDER,
      id,
    )
    return transformPurchaseOrder(raw)
  }

  // ── Stock Transfers ───────────────────────────────────────────────────────

  async listStockTransfers(credentials: Credentials, params: QueryParams): Promise<StockTransfer[]> {
    const { count, $startIndex } = this.pageParams(params)
    const res = await this.client(credentials).query<RawSageX3StockTransfer>(
      REPR.STOCK_TRANSFER,
      {},
      count,
      $startIndex,
    )
    return (res.$resources ?? []).map(transformStockTransfer)
  }

  async getStockTransfer(credentials: Credentials, id: string): Promise<StockTransfer> {
    const raw = await this.client(credentials).details<RawSageX3StockTransfer>(
      REPR.STOCK_TRANSFER,
      id,
    )
    return transformStockTransfer(raw)
  }

  // ── Stock Adjustments ─────────────────────────────────────────────────────

  async listStockAdjustments(credentials: Credentials, params: QueryParams): Promise<StockAdjustment[]> {
    const { count, $startIndex } = this.pageParams(params)
    const res = await this.client(credentials).query<RawSageX3StockAdjustment>(
      REPR.STOCK_ADJUSTMENT,
      {},
      count,
      $startIndex,
    )
    return (res.$resources ?? []).map(transformStockAdjustment)
  }

  async getStockAdjustment(credentials: Credentials, id: string): Promise<StockAdjustment> {
    const raw = await this.client(credentials).details<RawSageX3StockAdjustment>(
      REPR.STOCK_ADJUSTMENT,
      id,
    )
    return transformStockAdjustment(raw)
  }
}
