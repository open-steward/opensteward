/**
 * 3PL Central (Extensiv Warehouse Manager) adapter for the inventory vertical.
 *
 * 3PL Central is a cloud-based 3PL WMS. The public REST API lives at
 * https://secure-wms.com and uses OAuth2 client-credentials with a
 * per-warehouse TPL key.
 *
 * Auth: OAuth2 client-credentials (no refresh_token; re-request on expiry).
 * Pagination: pgnum (1-based page), pgsiz (default 100, max 500).
 *   TotalResults in HAL envelope drives page count.
 * Response envelope: HAL+JSON — records in ResourceList or _embedded arrays.
 *
 * Supported resources:
 *   - Products   → GET /customers/{customerId}/items
 *   - StockLevels→ GET /inventory/stockdetails  (per-lot) or
 *                  GET /inventory/stocksummaries (aggregate)
 *   - Locations  → GET /inventory/facilities/{facilityId}/locations
 *   - PurchaseOrders → GET /inventory/receivers
 *   - StockAdjustments → GET /inventory/adjustments (when available)
 *
 * NOT supported (no public endpoint):
 *   - Suppliers  (embedded identifiers only; no /suppliers list endpoint)
 *   - StockTransfers (no /transfers endpoint in the public API)
 *
 * Webhooks: RSA-SHA256, signature in "Signature" header.
 *   Public key: GET https://secure-wms.com/events/webhook/key
 */
import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { InventoryAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { StockLevel } from '../../schema/stock-level'
import type { Location } from '../../schema/location'
import type { PurchaseOrder } from '../../schema/purchase-order'
import type { StockAdjustment } from '../../schema/stock-adjustment'
import type { WebhookEvent } from '../../schema/webhook'

import {
  credentialFields as tplCredentialFields,
  exchangeCredentials as tplExchangeCredentials,
  refreshOAuth2,
  getAuthUrlUnsupported,
} from './auth'
import {ThreePlCentralClient} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'
import {verify3plCentralWebhook, parse3plCentralWebhookEvents} from './webhook'

import {transformProduct, type Raw3plCentralItem} from './transform/product'
import {transformStockLevel, type Raw3plCentralStockLevel} from './transform/stock-level'
import {transformLocation, type Raw3plCentralLocation, type Raw3plCentralFacility} from './transform/location'
import {transformPurchaseOrder, type Raw3plCentralReceiver} from './transform/purchase-order'
import {transformStockAdjustment, type Raw3plCentralAdjustment} from './transform/stock-adjustment'

export interface ThreePlCentralAdapterConfig {
  clientId: string
  clientSecret: string
  tplKey: string
  userLoginId: string
}

/** HAL+JSON envelope — most list endpoints wrap in ResourceList */
interface HalListResponse<T> {
  TotalResults?: number
  /** Standard ResourceList key */
  ResourceList?: T[]
  /** Some endpoints use _embedded */
  _embedded?: Record<string, T[]>
  /** stocksummaries uses Summaries */
  Summaries?: T[]
}

export class ThreePlCentralAdapter implements InventoryAdapter {
  readonly platform = '3plcentral'
  readonly version = '0.1.0'

  constructor(_config: ThreePlCentralAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return tplCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>) {
    return tplExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('3plcentral uses OAuth2 client-credentials; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshOAuth2(credentials)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verify3plCentralWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parse3plCentralWebhookEvents(payload)
  }

  private client(credentials: Credentials): ThreePlCentralClient {
    return new ThreePlCentralClient(credentials)
  }

  private pageParams(params: QueryParams): Record<string, unknown> {
    return {
      pgsiz: params.limit ?? DEFAULT_PAGE_SIZE,
      ...(params.page ? { pgnum: params.page } : { pgnum: 1 }),
    }
  }

  /** Extract records from HAL ResourceList or _embedded or Summaries */
  private extractList<T>(res: HalListResponse<T>, embeddedKey?: string): T[] {
    if (res.ResourceList) return res.ResourceList
    if (res.Summaries) return res.Summaries
    if (res._embedded) {
      if (embeddedKey && res._embedded[embeddedKey]) return res._embedded[embeddedKey]!
      // Fallback: first key
      const values = Object.values(res._embedded)
      if (values.length > 0) return values[0] as T[]
    }
    return []
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    // customerId is required; stored in credentials.extra
    const customerId = String((credentials.extra as Record<string, string>)?.customerId ?? '')
    if (!customerId) throw new Error('3plcentral: credentials.extra.customerId is required for listProducts')

    const res = await this.client(credentials).get<HalListResponse<Raw3plCentralItem>>(
      `/customers/${customerId}/items`,
      {
        ...this.pageParams(params),
        sort: 'ReadOnly.lastModifiedDate',
      },
    )
    return this.extractList(res, 'http://api.3plCentral.com/rels/customers/item').map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const customerId = String((credentials.extra as Record<string, string>)?.customerId ?? '')
    if (!customerId) throw new Error('3plcentral: credentials.extra.customerId is required for getProduct')

    const res = await this.client(credentials).get<HalListResponse<Raw3plCentralItem>>(
      `/customers/${customerId}/items/${id}`,
    )
    const items = this.extractList(res, 'http://api.3plCentral.com/rels/customers/item')
    // Single-item endpoints may return the object directly
    const raw = (items[0] ?? res) as Raw3plCentralItem
    return transformProduct(raw)
  }

  // ── Stock Levels ──────────────────────────────────────────────────────────

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const extra = (credentials.extra as Record<string, string>) ?? {}
    const customerid = extra['customerId'] ?? ''
    const facilityid = extra['facilityId'] ?? ''

    const res = await this.client(credentials).get<HalListResponse<Raw3plCentralStockLevel>>(
      '/inventory/stockdetails',
      {
        ...this.pageParams(params),
        ...(customerid ? { customerid } : {}),
        ...(facilityid ? { facilityid } : {}),
        sort: 'receivedDate',
      },
    )
    return this.extractList(res, 'item').map(transformStockLevel)
  }

  async getStockLevel(_credentials: Credentials, id: string): Promise<StockLevel> {
    throw new Error(`3plcentral: stock-level fetch is bulk-only via /inventory/stockdetails. id=${id}`)
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const facilityId = String((credentials.extra as Record<string, string>)?.facilityId ?? '')
    if (!facilityId) throw new Error('3plcentral: credentials.extra.facilityId is required for listLocations')

    const res = await this.client(credentials).get<HalListResponse<Raw3plCentralLocation>>(
      `/inventory/facilities/${facilityId}/locations`,
      this.pageParams(params),
    )
    return this.extractList(res).map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const facilityId = String((credentials.extra as Record<string, string>)?.facilityId ?? '')
    if (!facilityId) throw new Error('3plcentral: credentials.extra.facilityId is required for getLocation')

    const res = await this.client(credentials).get<HalListResponse<Raw3plCentralFacility>>(
      `/inventory/facilities/${facilityId}/locations/${id}`,
    )
    const locs = this.extractList(res)
    const raw = (locs[0] ?? res) as Raw3plCentralFacility
    return transformLocation(raw)
  }

  // ── Purchase Orders (Receivers) ──────────────────────────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const extra = (credentials.extra as Record<string, string>) ?? {}
    const customerid = extra['customerId'] ?? ''
    const facilityid = extra['facilityId'] ?? ''

    const res = await this.client(credentials).get<HalListResponse<Raw3plCentralReceiver>>(
      '/inventory/receivers',
      {
        ...this.pageParams(params),
        ...(customerid ? { customerid } : {}),
        ...(facilityid ? { facilityid } : {}),
        sort: 'ReadOnly.receivedDate',
      },
    )
    return this.extractList(res, 'http://api.3plCentral.com/rels/receivers/receiver').map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const res = await this.client(credentials).get<HalListResponse<Raw3plCentralReceiver>>(
      `/inventory/receivers/${id}`,
    )
    const recs = this.extractList(res, 'http://api.3plCentral.com/rels/receivers/receiver')
    const raw = (recs[0] ?? res) as Raw3plCentralReceiver
    return transformPurchaseOrder(raw)
  }

  // ── Stock Adjustments ─────────────────────────────────────────────────────

  async listStockAdjustments(credentials: Credentials, params: QueryParams): Promise<StockAdjustment[]> {
    const extra = (credentials.extra as Record<string, string>) ?? {}
    const customerid = extra['customerId'] ?? ''
    const facilityid = extra['facilityId'] ?? ''

    const res = await this.client(credentials).get<HalListResponse<Raw3plCentralAdjustment>>(
      '/inventory/adjustments',
      {
        ...this.pageParams(params),
        ...(customerid ? { customerid } : {}),
        ...(facilityid ? { facilityid } : {}),
      },
    )
    return this.extractList(res, 'http://api.3plCentral.com/rels/adjustments/adjustment').map(transformStockAdjustment)
  }

  async getStockAdjustment(credentials: Credentials, id: string): Promise<StockAdjustment> {
    const res = await this.client(credentials).get<HalListResponse<Raw3plCentralAdjustment>>(
      `/inventory/adjustments/${id}`,
    )
    const adjs = this.extractList(res, 'http://api.3plCentral.com/rels/adjustments/adjustment')
    const raw = (adjs[0] ?? res) as Raw3plCentralAdjustment
    return transformStockAdjustment(raw)
  }
}
