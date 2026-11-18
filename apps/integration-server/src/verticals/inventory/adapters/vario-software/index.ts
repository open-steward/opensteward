/**
 * VARIO Cloud adapter for the inventory vertical.
 *
 * VARIO Cloud is a German API-first ERP/WMS (vario-software.de).
 * Auth: OAuth 2.0 password grant — tenant + clientId/Secret + username/password.
 *   All requests carry: Authorization: Bearer <token>, User-Agent header.
 * Rate limit: 40 req / 6 s (429 + x-rate-limit-retry-after-seconds).
 * Pagination: limit/offset in VQL POST body; x-query-more-elements / x-query-next-offset headers.
 * Pagination (stockjournal): selection={"type":"..."}&pageable={"_start":N,"_limit":N} JSON-serialised query params.
 * Webhooks: NOT yet documented ("coming soon") — no webhook methods implemented.
 *
 * Supported resources:
 *   products       — GET /erp/articles/{id}  (individual, via VQL list)
 *   stockLevels    — GET /erp/articles/{id}/stocks
 *   locations      — GET /erp/storages/{id}  (VQL list)
 *   suppliers      — GET /erp/article-suppliers/{id}  (VQL list)
 *   purchaseOrders — GET /erp/order-proposals/{id}  (VQL list)
 *   stockTransfers — GET /erp/stocks/stockjournal  (type=TRANSFER)
 *   stockAdjustments — GET /erp/stocks/stockjournal  (type=MANUAL)
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

import {
  credentialFields as varioCredentialFields,
  exchangeCredentials as varioExchangeCredentials,
  refreshCredentials as varioRefreshCredentials,
  getAuthUrlUnsupported,
} from './auth'
import {VarioSoftwareClient} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'

import {transformProduct, type RawVarioArticle} from './transform/product'
import {transformStockLevel, type RawVarioArticleStorage} from './transform/stock-level'
import {transformLocation, type RawVarioStorage} from './transform/location'
import {transformSupplier, type RawVarioArticleSupplier} from './transform/supplier'
import {transformPurchaseOrder, type RawVarioOrderProposal} from './transform/purchase-order'
import {transformStockTransfer, type RawVarioStockJournalEntry} from './transform/stock-transfer'
import {transformStockAdjustment, type RawVarioManualMovement} from './transform/stock-adjustment'

export interface VarioSoftwareAdapterConfig {
  /** Unused — auth is credential-field driven */
  _unused?: never
}

// VQL response wrapper — computed-queries/execute returns an array directly
// or wrapped in a data envelope. We handle both.
interface VqlRow { id?: string | number; [key: string]: unknown }

export class VarioSoftwareAdapter implements InventoryAdapter {
  readonly platform = 'vario-software'
  readonly version = '0.1.0'

  constructor(_config?: VarioSoftwareAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return varioCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return varioExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('vario-software uses OAuth2 password grant; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return varioRefreshCredentials(credentials)
  }

  private client(credentials: Credentials): VarioSoftwareClient {
    return new VarioSoftwareClient(credentials)
  }

  private pageSize(params: QueryParams): number {
    return params.limit ?? DEFAULT_PAGE_SIZE
  }

  private offset(params: QueryParams): number {
    return params.page && params.limit ? (params.page - 1) * params.limit : 0
  }

  // ── Products ─────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const c = this.client(credentials)
    const limit = this.pageSize(params)
    const offset = this.offset(params)
    // VQL to list articles — SELECT all core fields
    const result = await c.vql<VqlRow>(
      'SELECT id, number, name, description, active, productType, netSalesPrice, grossSalesPrice, grossMetric, productUnit, productGroupRef, manufacturerRef, identifiers, customsTariffNumber, countryOfOriginRef, info FROM article.query',
      limit,
      offset,
    )
    return result.items.map((row) => transformProduct(row as unknown as RawVarioArticle))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const raw = await this.client(credentials).get<RawVarioArticle>(`/erp/articles/${id}`)
    return transformProduct(raw)
  }

  // ── StockLevels ───────────────────────────────────────────────────────────

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const c = this.client(credentials)
    const limit = this.pageSize(params)
    const offset = this.offset(params)
    // List articles first (IDs only), then fetch stocks per article
    const articleResult = await c.vql<VqlRow>(
      'SELECT id FROM article.query',
      limit,
      offset,
    )
    const levels: StockLevel[] = []
    for (const row of articleResult.items) {
      try {
        const articleId = String(row.id ?? '')
        // Aggregated stock across all sales storages
        const stock = await c.get<Record<string, unknown>>(`/erp/articles/${articleId}/stocks`)
        const raw: RawVarioArticleStorage = {
          ...(stock as object),
          _articleId: articleId,
          _storageId: 'all',
        }
        levels.push(transformStockLevel(raw))
      } catch {
        // never throw in transforms — skip articles that error
      }
    }
    return levels
  }

  async getStockLevel(credentials: Credentials, id: string): Promise<StockLevel> {
    // id format: "{articleId}:{storageId}" or just "{articleId}"
    const [articleId, storageId] = id.split(':')
    const c = this.client(credentials)
    if (storageId && storageId !== 'all') {
      const stock = await c.get<Record<string, unknown>>(
        `/erp/articles/${articleId}/storages/${storageId}/stocks`,
      )
      const raw: RawVarioArticleStorage = {
        ...(stock as object),
        _articleId: articleId,
        _storageId: storageId,
      }
      return transformStockLevel(raw)
    }
    const stock = await c.get<Record<string, unknown>>(`/erp/articles/${articleId}/stocks`)
    const raw: RawVarioArticleStorage = {
      ...(stock as object),
      _articleId: articleId,
      _storageId: 'all',
    }
    return transformStockLevel(raw)
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const c = this.client(credentials)
    const limit = this.pageSize(params)
    const offset = this.offset(params)
    const result = await c.vql<VqlRow>(
      'SELECT id, number, displayName, active, transit, salesStorage, purchaseOrderStorage, returnOrderStorage, withStorageBins, allowNegativeStock, pickingRequired, useInAvailabilityDetermination, supplyStorage, considerForOrderProposal FROM storage.query',
      limit,
      offset,
    )
    return result.items.map((row) => transformLocation(row as unknown as RawVarioStorage))
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const raw = await this.client(credentials).get<RawVarioStorage>(`/erp/storages/${id}`)
    return transformLocation(raw)
  }

  // ── Suppliers ─────────────────────────────────────────────────────────────

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const c = this.client(credentials)
    const limit = this.pageSize(params)
    const offset = this.offset(params)
    const result = await c.vql<VqlRow>(
      'SELECT id, accountId, accountDisplayName, articleId, articleNumber, active, mainSupplier, supplierArticleNumber, supplierArticleName, deliveryTime, minimumOrderQuantity, defaultNetPrice, dropShippingAllowed FROM article_supplier.query',
      limit,
      offset,
    )
    return result.items.map((row) => transformSupplier(row as unknown as RawVarioArticleSupplier))
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const raw = await this.client(credentials).get<RawVarioArticleSupplier>(`/erp/article-suppliers/${id}`)
    return transformSupplier(raw)
  }

  // ── PurchaseOrders ────────────────────────────────────────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const c = this.client(credentials)
    const limit = this.pageSize(params)
    const offset = this.offset(params)
    const result = await c.vql<VqlRow>(
      'SELECT id, version, processed, supplierPreference, orderProposalSuppliers, orderProposalLines, info FROM order_proposal.query',
      limit,
      offset,
    )
    return result.items.map((row) => transformPurchaseOrder(row as unknown as RawVarioOrderProposal))
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const raw = await this.client(credentials).get<RawVarioOrderProposal>(`/erp/order-proposals/${id}`)
    return transformPurchaseOrder(raw)
  }

  // ── StockTransfers ────────────────────────────────────────────────────────

  async listStockTransfers(credentials: Credentials, params: QueryParams): Promise<StockTransfer[]> {
    // VARIO stockjournal expects JSON-serialised objects for selection + pageable:
    //   selection={"type":"DOCUMENT"}&pageable={"_start":N,"_limit":N}
    // (no TRANSFER type exists in the enum; DOCUMENT covers document-based transfers)
    const items = await this.client(credentials).get<RawVarioStockJournalEntry[]>(
      '/erp/stocks/stockjournal',
      {
        selection: JSON.stringify({ type: 'DOCUMENT' }),
        pageable: JSON.stringify({ _start: this.offset(params), _limit: this.pageSize(params) }),
      },
    )
    return (Array.isArray(items) ? items : []).map(transformStockTransfer)
  }

  async getStockTransfer(credentials: Credentials, id: string): Promise<StockTransfer> {
    // Journal entries are not individually addressable by the API —
    // fetch the list and find by id.
    const items = await this.client(credentials).get<RawVarioStockJournalEntry[]>(
      '/erp/stocks/stockjournal',
      {
        selection: JSON.stringify({ type: 'DOCUMENT' }),
        pageable: JSON.stringify({ _start: 0, _limit: 1000 }),
      },
    )
    const found = (Array.isArray(items) ? items : []).find((e) => String(e.id) === id)
    if (!found) throw new Error(`vario-software stock transfer ${id} not found`)
    return transformStockTransfer(found)
  }

  // ── StockAdjustments ──────────────────────────────────────────────────────

  async listStockAdjustments(credentials: Credentials, params: QueryParams): Promise<StockAdjustment[]> {
    const items = await this.client(credentials).get<RawVarioManualMovement[]>(
      '/erp/stocks/stockjournal',
      {
        selection: JSON.stringify({ type: 'MANUAL' }),
        pageable: JSON.stringify({ _start: this.offset(params), _limit: this.pageSize(params) }),
      },
    )
    return (Array.isArray(items) ? items : []).map(transformStockAdjustment)
  }

  async getStockAdjustment(credentials: Credentials, id: string): Promise<StockAdjustment> {
    const items = await this.client(credentials).get<RawVarioManualMovement[]>(
      '/erp/stocks/stockjournal',
      {
        selection: JSON.stringify({ type: 'MANUAL' }),
        pageable: JSON.stringify({ _start: 0, _limit: 1000 }),
      },
    )
    const found = (Array.isArray(items) ? items : []).find((e) => String(e.id) === id)
    if (!found) throw new Error(`vario-software stock adjustment ${id} not found`)
    return transformStockAdjustment(found)
  }
}
