/**
 * E2open Supply Chain Platform adapter for the inventory vertical.
 *
 * E2open is an enterprise multi-enterprise supply chain network connecting
 * 400 000+ partners.  This adapter targets the Channel Data Management (CDM)
 * REST API v1 and the Supply Chain Collaboration (SCC) APIs.
 *
 * Auth: OAuth 2.0 — Authorization Code Flow (interactive) or Client Credentials
 *       (server-to-server machine accounts).
 * Base: https://api.e2open.com
 *
 * Supported resources:
 *   - products        (CDM Inventory entity — item master)
 *   - stock-levels    (CDM Inventory entity — on-hand positions)
 *   - purchase-orders (SCC Discrete Order Collaboration)
 *
 * Not supported (no public REST endpoint documented):
 *   - locations       — synthesised from inventory data; no standalone list API
 *   - suppliers       — accessible via Partner Directory (separate auth scope)
 *   - stock-transfers — SCC Shipment Collaboration requires separate entitlement
 *   - stock-adjustments — CDM adjustment transactions require separate entitlement
 *
 * Webhook: E2open does not publish HMAC/JWT webhook signing documentation for
 *          supply chain events.  verifyWebhook and parseWebhookEvents are omitted.
 *
 * Schema-firewall: no product images, no supplier banking, no manufacturing BOM.
 */
import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { InventoryAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { StockLevel } from '../../schema/stock-level'
import type { PurchaseOrder } from '../../schema/purchase-order'

import {
  credentialFields as e2openCredentialFields,
  getAuthUrl as e2openGetAuthUrl,
  exchangeCode as e2openExchangeCode,
  refreshCredentials as e2openRefreshCredentials,
  type E2openAuthConfig,
} from './auth'
import {E2openClient} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'

import {transformProduct, type RawE2openProduct} from './transform/product'
import {transformStockLevel, type RawE2openStockLevel} from './transform/stock-level'
import {transformPurchaseOrder, type RawE2openPurchaseOrder} from './transform/purchase-order'

export interface E2openAdapterConfig extends E2openAuthConfig {
  /** Tenant identifier (tid) — required on every CDM API call. */
  tenantId: string
}

interface CdmSearchBody {
  offset?: number
  limit?: number
  filters?: Record<string, unknown>
}

interface CdmListResponse<T> {
  data?: T[]
  total?: number
}

export class E2openAdapter implements InventoryAdapter {
  readonly platform = 'e2open'
  readonly version  = '0.1.0'

  private config: E2openAdapterConfig

  constructor(config: E2openAdapterConfig) {
    this.config = config
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  credentialFields(): CredentialField[] {
    return e2openCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    // credentialFields() path: exchange an auth code obtained externally.
    const code = fields['code']
    if (!code) throw new Error('e2open: exchangeCredentials requires a code field')
    return e2openExchangeCode(code, this.config)
  }

  getAuthUrl(state: string, _scopes?: string[]): string {
    return e2openGetAuthUrl(state, this.config)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return e2openExchangeCode(code, this.config)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return e2openRefreshCredentials(credentials)
  }

  // ── Client helpers ────────────────────────────────────────────────────────

  private client(credentials: Credentials): E2openClient {
    // Inject tenantId into extra so the client can forward it as ?tid=
    const augmented: Credentials = {
      ...credentials,
      extra: { tenantId: this.config.tenantId, ...(credentials.extra ?? {}) },
    }
    return new E2openClient(augmented)
  }

  private cdmParams(params: QueryParams): CdmSearchBody {
    const limit  = params.limit ?? DEFAULT_PAGE_SIZE
    const offset = params.page  ? (params.page - 1) * limit : 0
    return { offset, limit }
  }

  // ── Products (CDM Inventory entity — item master) ─────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const body = this.cdmParams(params)
    const res  = await this.client(credentials)
      .searchTransactions<RawE2openProduct>('Inventory', body) as CdmListResponse<RawE2openProduct>
    return (res.data ?? []).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials)
      .searchTransactions<RawE2openProduct>('Inventory', {
        limit: 1,
        filters: { partnerSkuCode: id },
      }) as CdmListResponse<RawE2openProduct>
    const item = res.data?.[0]
    if (!item) throw new Error(`e2open product ${id} not found`)
    return transformProduct(item)
  }

  // ── Stock Levels (CDM Inventory entity — on-hand positions) ───────────────

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const body = this.cdmParams(params)
    const res  = await this.client(credentials)
      .searchTransactions<RawE2openStockLevel>('Inventory', body) as CdmListResponse<RawE2openStockLevel>
    return (res.data ?? []).map(transformStockLevel)
  }

  async getStockLevel(_credentials: Credentials, id: string): Promise<StockLevel> {
    throw new Error(
      `e2open stock-level fetch is bulk-only via listStockLevels; composite id format is "sku:locationId". Requested: ${id}`,
    )
  }

  // ── Purchase Orders (SCC Discrete Order Collaboration) ────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const body = this.cdmParams(params)
    const res  = await this.client(credentials)
      .searchTransactions<RawE2openPurchaseOrder>('PurchaseOrder', body) as CdmListResponse<RawE2openPurchaseOrder>
    return (res.data ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const res = await this.client(credentials)
      .searchTransactions<RawE2openPurchaseOrder>('PurchaseOrder', {
        limit: 1,
        filters: { purchaseOrderId: id },
      }) as CdmListResponse<RawE2openPurchaseOrder>
    const po = res.data?.[0]
    if (!po) throw new Error(`e2open purchase order ${id} not found`)
    return transformPurchaseOrder(po)
  }
}
