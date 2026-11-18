/**
 * Bling inventory adapter.
 *
 * Bling is a Brazilian ERP focused on SMBs with strong e-commerce integrations
 * (Mercado Livre, Shopify, etc.). API v3 is REST + OAuth2 authorization-code.
 *
 * Auth: OAuth2 authorization-code grant.
 *   Authorize: GET  https://api.bling.com.br/Api/v3/oauth/authorize
 *   Token:     POST https://api.bling.com.br/Api/v3/oauth/token
 *
 * Supported resources (all read via GET):
 *   products        → GET /Api/v3/produtos
 *   stock-levels    → GET /Api/v3/estoques/saldos  (flatten per-deposit)
 *   locations       → GET /Api/v3/depositos
 *   suppliers       → GET /Api/v3/contatos/tipos (resolve the "Fornecedor" type id),
 *                     then GET /Api/v3/contatos?idTipoContato=<id>&criterio=1
 *   purchase-orders → GET /Api/v3/pedidos/compras
 *
 * Pagination: query params pagina (1-based) + limite (max 100).
 * Amounts: BRL floats in API → stored as integer centavos (minor units).
 * Webhooks: HMAC-SHA256, header X-Bling-Signature-256: sha256=<hex>.
 *
 * NOT supported: stock-transfers, stock-adjustments
 *   (Bling has no dedicated API endpoints for these operations)
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: stock-adjustment — Bling API v3 has no GET endpoint to list or
 *   retrieve stock-adjustment records; POST /estoques creates movements but
 *   historical adjustment data is not queryable.
 * Unavailable: stock-transfer — Bling API v3 has no dedicated transfer
 *   endpoint; inter-warehouse moves are paired Saída/Entrada movements with
 *   no separate transfer resource or list endpoint.
 */
import { createHash } from 'node:crypto'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { InventoryAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { StockLevel } from '../../schema/stock-level'
import type { Location } from '../../schema/location'
import type { Supplier } from '../../schema/supplier'
import type { PurchaseOrder } from '../../schema/purchase-order'
import type { WebhookEvent } from '../../schema/webhook'

import {getAuthUrl, exchangeCode, refreshCredentials as refreshOAuth} from './auth'
import type { BlingOAuthConfig } from './auth'
import {BlingClient} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'
import {verifyBlingWebhook, parseBlingWebhookEvents} from './webhook'

import {transformProduct, type RawBlingProduct} from './transform/product'
import {transformStockLevels, type RawBlingStockBalance} from './transform/stock-level'
import {transformLocation, type RawBlingDeposito} from './transform/location'
import {transformSupplier, type RawBlingContato} from './transform/supplier'
import {transformPurchaseOrder, type RawBlingPedidoCompra} from './transform/purchase-order'

export type BlingAdapterConfig = BlingOAuthConfig

/** Bling envelope for list endpoints */
interface BlingListEnvelope<T> { data: T[] }
/** Bling envelope for single-item endpoints */
interface BlingSingleEnvelope<T> { data: T }

/** GET /contatos/tipos entry. `id` is per-account, not stable across tenants. */
interface RawBlingContatoTipo {
  id?: number
  descricao?: string
}

/**
 * How long a resolved "Fornecedor" contact-type id stays usable. The id is
 * stable for an account, so the TTL only bounds how long a renamed or
 * recreated contact type can go unnoticed.
 */
const FORNECEDOR_TIPO_TTL_MS = 60 * 60 * 1000
/** Bounds the map on a deployment carrying many Bling connections. */
const FORNECEDOR_TIPO_MAX_ENTRIES = 500

export class BlingAdapter implements InventoryAdapter {
  readonly platform = 'bling'
  readonly version = '0.1.0'

  private config: BlingAdapterConfig

  constructor(config: BlingAdapterConfig) {
    this.config = config
  }

  credentialFields() {
    return []
  }

  async exchangeCredentials(_fields: Record<string, string>): Promise<Credentials> {
    throw new Error('bling uses OAuth2; use getAuthUrl() + exchangeCode() instead')
  }

  getAuthUrl(state: string, _scopes?: string[]): string {
    return getAuthUrl(this.config, state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeCode(this.config, code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshOAuth(this.config, credentials)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyBlingWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseBlingWebhookEvents(payload)
  }

  private client(credentials: Credentials): BlingClient {
    return new BlingClient(credentials)
  }

  private pageParams(params: QueryParams): Record<string, unknown> {
    return {
      pagina: params.page ?? 1,
      limite: params.limit ?? DEFAULT_PAGE_SIZE,
    }
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).get<BlingListEnvelope<RawBlingProduct>>(
      '/produtos',
      this.pageParams(params),
    )
    return (res.data ?? []).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).get<BlingSingleEnvelope<RawBlingProduct>>(
      `/produtos/${id}`,
    )
    if (!res.data) throw new Error(`bling product ${id} not found`)
    return transformProduct(res.data)
  }

  // ── Stock Levels ──────────────────────────────────────────────────────────
  //
  // GET /estoques/saldos returns one record per product with a depositos[]
  // sub-array. We flatten to one StockLevel per product×deposit pair.

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const res = await this.client(credentials).get<BlingListEnvelope<RawBlingStockBalance>>(
      '/estoques/saldos',
      this.pageParams(params),
    )
    return (res.data ?? []).flatMap(transformStockLevels)
  }

  async getStockLevel(_credentials: Credentials, id: string): Promise<StockLevel> {
    throw new Error(`bling stock-level fetch is bulk-only; call listStockLevels. id=${id}`)
  }

  // ── Locations (Depositos) ─────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const res = await this.client(credentials).get<BlingListEnvelope<RawBlingDeposito>>(
      '/depositos',
      this.pageParams(params),
    )
    return (res.data ?? []).map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const res = await this.client(credentials).get<BlingSingleEnvelope<RawBlingDeposito>>(
      `/depositos/${id}`,
    )
    if (!res.data) throw new Error(`bling deposito ${id} not found`)
    return transformLocation(res.data)
  }

  // ── Suppliers (Contatos filtered by the "Fornecedor" contact type) ────────
  //
  // /contatos has no `tipo` query param — `tipo` on a contact record is the
  // *person* type (F=Fisica/individual, J=Juridica/company, E=Estrangeira),
  // not "is this a supplier". Contact *types* like "Fornecedor" are
  // tenant-defined records fetched from /contatos/tipos; we resolve the
  // "Fornecedor" type's id and filter by idTipoContato. criterio=1 ("Todos")
  // is required too — the default criterio=3 returns only recently-added
  // contacts, silently dropping older suppliers.

  private fornecedorTipoCache = new Map<string, { id: number; expiresAt: number }>()

  /**
   * Key the cache on the CREDENTIAL, never on the adapter instance.
   * `AdapterRegistry` keys instances by platform alone, so one `BlingAdapter`
   * serves every tenant — and the contact-type id is per-account. Keying on
   * the credential makes a cross-tenant hit impossible by construction rather
   * than by care, and makes a rotated token miss instead of serving a stale
   * id. Hashed so a long-lived map holds no second copy of the raw token.
   */
  private fornecedorTipoCacheKey(credentials: Credentials): string {
    return createHash('sha256').update(credentials.accessToken ?? '').digest('hex')
  }

  private async resolveFornecedorTipoId(credentials: Credentials): Promise<number> {
    const key = this.fornecedorTipoCacheKey(credentials)
    const hit = this.fornecedorTipoCache.get(key)
    if (hit && hit.expiresAt > Date.now()) return hit.id
    if (hit) this.fornecedorTipoCache.delete(key)

    const res = await this.client(credentials).get<BlingListEnvelope<RawBlingContatoTipo>>(
      '/contatos/tipos',
    )
    const fornecedor = (res.data ?? []).find(
      (t) => typeof t.descricao === 'string' && t.descricao.toLowerCase() === 'fornecedor',
    )
    if (fornecedor?.id == null) {
      // Reached without writing to the cache on purpose: a transient shape or
      // permission problem must not stick for the life of the process.
      throw new Error('bling: could not resolve a "Fornecedor" contact type from GET /contatos/tipos')
    }

    if (this.fornecedorTipoCache.size >= FORNECEDOR_TIPO_MAX_ENTRIES) {
      const oldest = this.fornecedorTipoCache.keys().next().value
      if (oldest !== undefined) this.fornecedorTipoCache.delete(oldest)
    }
    this.fornecedorTipoCache.set(key, {
      id: fornecedor.id,
      expiresAt: Date.now() + FORNECEDOR_TIPO_TTL_MS,
    })
    return fornecedor.id
  }

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const idTipoContato = await this.resolveFornecedorTipoId(credentials)
    const res = await this.client(credentials).get<BlingListEnvelope<RawBlingContato>>(
      '/contatos',
      { ...this.pageParams(params), idTipoContato, criterio: 1 },
    )
    return (res.data ?? []).map(transformSupplier)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const res = await this.client(credentials).get<BlingSingleEnvelope<RawBlingContato>>(
      `/contatos/${id}`,
    )
    if (!res.data) throw new Error(`bling contato (supplier) ${id} not found`)
    return transformSupplier(res.data)
  }

  // ── Purchase Orders ───────────────────────────────────────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const res = await this.client(credentials).get<BlingListEnvelope<RawBlingPedidoCompra>>(
      '/pedidos/compras',
      this.pageParams(params),
    )
    return (res.data ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const res = await this.client(credentials).get<BlingSingleEnvelope<RawBlingPedidoCompra>>(
      `/pedidos/compras/${id}`,
    )
    if (!res.data) throw new Error(`bling pedido de compra ${id} not found`)
    return transformPurchaseOrder(res.data)
  }
}
