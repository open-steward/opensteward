/**
 * SPS Commerce adapter for the inventory vertical.
 *
 * SPS Commerce is the largest retail EDI network, providing cloud-based
 * supply chain management. Their Fulfillment API exposes purchase orders,
 * item catalogs, inventory advisories (846), and vendor/location data.
 *
 * Auth: OAuth2 client credentials (machine-to-machine) via Auth0.
 *   Token URL: POST https://api.spscommerce.net/authorization/v1/token
 *   Header:    Authorization: Bearer <token>
 *
 * Base URL (prod):    https://api.spscommerce.com
 * Base URL (sandbox): https://integration.api.spscommerce.com
 *
 * Pagination: SPS REST standards offset-based pagination.
 *   Query params: limit, offset
 *   Response:     { results: [...], paging: { limit, offset, totalCount, next } }
 *
 * Coverage:
 *   Implemented: listProducts, getProduct,
 *                listStockLevels, listLocations, getLocation,
 *                listSuppliers, getSupplier,
 *                listPurchaseOrders, getPurchaseOrder
 *   Not available in public API (auto-501):
 *                getStockLevel (bulk-only via inventory-advises),
 *                listStockTransfers, getStockTransfer,
 *                listStockAdjustments, getStockAdjustment
 *
 * Docs: https://spscommerce.github.io/sps-api-standards/
 *       https://docs.api.spscommerce.com/
 */

import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { InventoryAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { StockLevel } from '../../schema/stock-level'
import type { Location } from '../../schema/location'
import type { Supplier } from '../../schema/supplier'
import type { PurchaseOrder } from '../../schema/purchase-order'

import {buildAuthUrl, exchangeAuthCode, fetchClientCredentialsToken, refreshAccessToken} from './auth'
import {SpsCommerceClient, type SpsListEnvelope} from './client'
import {FULFILLMENT_V1, DEFAULT_PAGE_SIZE} from './constants'

import {transformProduct, type RawSpsCommerceProduct} from './transform/product'
import {transformStockLevel, type RawSpsCommerceStockLevel} from './transform/stock-level'
import {transformLocation, type RawSpsCommerceLocation} from './transform/location'
import {transformSupplier, type RawSpsCommerceSupplier} from './transform/supplier'
import {transformPurchaseOrder, type RawSpsCommercePurchaseOrder} from './transform/purchase-order'

export interface SpsCommerceAdapterConfig {
  /** OAuth2 client ID */
  clientId?: string
  /** OAuth2 client secret */
  clientSecret?: string
  /** OAuth2 redirect URI (authorization-code flow only) */
  redirectUri?: string
  /** Additional OAuth2 scopes */
  scopes?: string[]
}

export class SpsCommerceAdapter implements InventoryAdapter {
  readonly platform = 'sps-commerce'
  readonly version = '0.1.0'

  private clientId: string | undefined
  private clientSecret: string | undefined
  private redirectUri: string | undefined
  private scopes: string[]

  constructor(config: SpsCommerceAdapterConfig = {}) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? []
  }

  // ── Auth ─────────────────────────────────────────────────────────────────

  credentialFields(): CredentialField[] {
    return [
      { name: 'clientId', label: 'Client ID', type: 'text', required: true },
      { name: 'clientSecret', label: 'Client Secret', type: 'password', required: true },
    ]
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    const clientId = fields['clientId']
    const clientSecret = fields['clientSecret']
    if (!clientId || !clientSecret) {
      throw new Error('sps-commerce: clientId and clientSecret are required')
    }
    return fetchClientCredentialsToken(clientId, clientSecret)
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    if (!this.clientId || !this.redirectUri) {
      throw new Error('sps-commerce: clientId and redirectUri required for getAuthUrl')
    }
    return buildAuthUrl(
      this.clientId,
      this.redirectUri,
      state,
      overrideScopes ?? this.scopes,
    )
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('sps-commerce: clientId and clientSecret required for exchangeCode')
    }
    return exchangeAuthCode(code, this.clientId, this.clientSecret, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshAccessToken(credentials)
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private client(credentials: Credentials): SpsCommerceClient {
    return new SpsCommerceClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
      ...(params.page !== undefined ? { offset: ((params.page - 1) * (params.limit ?? DEFAULT_PAGE_SIZE)) } : {}),
    }
  }

  // ── Products / Items ──────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).get<SpsListEnvelope<RawSpsCommerceProduct>>(
      `${FULFILLMENT_V1}/items`,
      this.listParams(params),
    )
    return (res.results ?? []).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const raw = await this.client(credentials).get<RawSpsCommerceProduct>(
      `${FULFILLMENT_V1}/items/${encodeURIComponent(id)}`,
    )
    if (!raw?.item_id) throw new Error(`sps-commerce: item ${id} not found`)
    return transformProduct(raw)
  }

  // ── Inventory Advisories (Stock Levels) ──────────────────────────────────

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const res = await this.client(credentials).get<SpsListEnvelope<RawSpsCommerceStockLevel>>(
      `${FULFILLMENT_V1}/inventory-advises`,
      this.listParams(params),
    )
    return (res.results ?? []).map(transformStockLevel)
  }

  // getStockLevel is bulk-only via inventory-advises; auto-501 from unimplemented interface method

  // ── Locations ─────────────────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const res = await this.client(credentials).get<SpsListEnvelope<RawSpsCommerceLocation>>(
      `${FULFILLMENT_V1}/locations`,
      this.listParams(params),
    )
    return (res.results ?? []).map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const raw = await this.client(credentials).get<RawSpsCommerceLocation>(
      `${FULFILLMENT_V1}/locations/${encodeURIComponent(id)}`,
    )
    if (!raw?.location_id) throw new Error(`sps-commerce: location ${id} not found`)
    return transformLocation(raw)
  }

  // ── Vendors / Suppliers ───────────────────────────────────────────────────

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const res = await this.client(credentials).get<SpsListEnvelope<RawSpsCommerceSupplier>>(
      `${FULFILLMENT_V1}/vendors`,
      this.listParams(params),
    )
    return (res.results ?? []).map(transformSupplier)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const raw = await this.client(credentials).get<RawSpsCommerceSupplier>(
      `${FULFILLMENT_V1}/vendors/${encodeURIComponent(id)}`,
    )
    if (!raw?.vendor_id) throw new Error(`sps-commerce: vendor ${id} not found`)
    return transformSupplier(raw)
  }

  // ── Purchase Orders ───────────────────────────────────────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const res = await this.client(credentials).get<SpsListEnvelope<RawSpsCommercePurchaseOrder>>(
      `${FULFILLMENT_V1}/purchaseorders`,
      this.listParams(params),
    )
    return (res.results ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const raw = await this.client(credentials).get<RawSpsCommercePurchaseOrder>(
      `${FULFILLMENT_V1}/purchaseorders/${encodeURIComponent(id)}`,
    )
    if (!raw?.purchase_order_number && !raw?.po_id) {
      throw new Error(`sps-commerce: purchase order ${id} not found`)
    }
    return transformPurchaseOrder(raw)
  }
}
