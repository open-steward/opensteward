/**
 * Blue Yonder (JDA) Luminate WMS adapter for the inventory vertical.
 *
 * Auth: OAuth 2.0 client-credentials flow (tenant-scoped token endpoint).
 * Resources supported:
 *   - Stock levels   → GET /wms/v1/inventory
 *   - Purchase orders (inbound receipts) → GET /wms/v1/receipts
 *
 * Schema-firewall: no product images, no supplier banking, BOM refused.
 */
// ── Resource coverage ──────────────────────────────────────────────
// Unverified: location      — Blue Yonder WMS REST API docs are enterprise-gated; no public endpoint for warehouse locations confirmed
// Unverified: product       — Blue Yonder WMS REST API docs are enterprise-gated; no public items/products endpoint confirmed
// Unverified: stock-adjustment — Blue Yonder WMS REST API docs are enterprise-gated; no public adjustments endpoint confirmed
// Unverified: stock-transfer   — Blue Yonder WMS REST API docs are enterprise-gated; no public transfers endpoint confirmed
// Unverified: supplier         — Blue Yonder WMS REST API docs are enterprise-gated; no public suppliers endpoint confirmed
import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { InventoryAdapter } from '../../adapter/interface'
import type { StockLevel } from '../../schema/stock-level'
import type { PurchaseOrder } from '../../schema/purchase-order'

import {CREDENTIAL_FORM, refreshAccessToken} from './auth'
import {BlueYonderClient} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'

import {transformStockLevel, type RawBlueYonderInventoryPosition} from './transform/stock-level'
import {transformPurchaseOrder, type RawBlueYonderReceipt} from './transform/purchase-order'

export interface BlueYonderAdapterConfig {
  /** Not used at construction time — tenant details come from Credentials.extra. */
  clientId?: string
  clientSecret?: string
}

/** Blue Yonder page-envelope shape returned by all list endpoints. */
interface PagedResponse<T> {
  data?: T[]
  pagination?: {
    page?: number
    pageSize?: number
    totalPages?: number
    totalItems?: number
  }
}

export class BlueYonderAdapter implements InventoryAdapter {
  readonly platform = 'blue-yonder'
  readonly version = '0.1.0'

  constructor(_config: BlueYonderAdapterConfig = {}) {}

  credentialFields(): CredentialField[] {
    return CREDENTIAL_FORM.credentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return CREDENTIAL_FORM.exchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    throw new Error('blue-yonder uses OAuth2 client-credentials; use credentialFields() instead')
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('blue-yonder uses OAuth2 client-credentials; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    const clientId = String(credentials.extra?.['clientId'] ?? '')
    const clientSecret = String(credentials.extra?.['clientSecret'] ?? '')
    const tenantHost = String(credentials.extra?.['tenantHost'] ?? '')
    if (!clientId || !clientSecret || !tenantHost) return credentials
    const { accessToken, expiresAt } = await refreshAccessToken(clientId, clientSecret, tenantHost)
    return { ...credentials, accessToken, expiresAt }
  }

  private client(credentials: Credentials): BlueYonderClient {
    return new BlueYonderClient(credentials)
  }

  private pageParams(params: QueryParams): Record<string, unknown> {
    return {
      pageSize: params.limit ?? DEFAULT_PAGE_SIZE,
      ...(params.page ? { page: params.page } : { page: 1 }),
    }
  }

  // ── Stock Levels ──────────────────────────────────────────────────────────

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const res = await this.client(credentials).get<PagedResponse<RawBlueYonderInventoryPosition>>(
      '/inventory',
      this.pageParams(params),
    )
    return (res.data ?? []).map(transformStockLevel)
  }

  async getStockLevel(credentials: Credentials, id: string): Promise<StockLevel> {
    const res = await this.client(credentials).get<PagedResponse<RawBlueYonderInventoryPosition>>(
      '/inventory',
      { itemId: id, page: 1, pageSize: DEFAULT_PAGE_SIZE },
    )
    const positions = res.data ?? []
    if (positions.length === 0) throw new Error(`blue-yonder: no inventory position found for itemId=${id}`)
    return transformStockLevel(positions[0]!)
  }

  // ── Purchase Orders (inbound receipts) ───────────────────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const res = await this.client(credentials).get<PagedResponse<RawBlueYonderReceipt>>(
      '/receipts',
      this.pageParams(params),
    )
    return (res.data ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const res = await this.client(credentials).get<RawBlueYonderReceipt | null>(`/receipts/${id}`)
    if (!res) throw new Error(`blue-yonder: receipt ${id} not found`)
    return transformPurchaseOrder(res)
  }
}
