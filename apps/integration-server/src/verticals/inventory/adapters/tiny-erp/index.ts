/**
 * Olist Tiny ERP adapter for the inventory vertical.
 *
 * Auth: OAuth 2.0 Authorization Code flow.
 *   Authorize: https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/auth
 *   Token:     https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token
 *
 * Supported resources (v3 public API):
 *   - Products      GET /produtos, GET /produtos/{id}
 *   - StockLevels   GET /estoque/{idProduto}  (per-product with deposito breakdown)
 *   - Locations     GET /depositos, GET /depositos/{id}
 *   - Suppliers     GET /contatos (filtered by tipo=fornecedor), GET /contatos/{id}
 *   - PurchaseOrders GET /ordem-compra, GET /ordem-compra/{id}
 *
 * Not supported by Tiny v3 public API: StockTransfers, StockAdjustments.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: stock-adjustment — v3 public API has no standalone stock-adjustment
 *   endpoint; mutations are only indirect actions on invoices/orders
 *   (POST /notas/{id}/lancar-estoque etc.). Confirmed via swagger.json.
 * Unavailable: stock-transfer — v3 public API has no stock-transfer endpoint;
 *   the only stock path is GET/POST /estoque/{idProduto} (per-product).
 *   Confirmed via swagger.json.
 *
 * Schema-firewall: no product images, no supplier banking, no BOM/kit,
 * no manufacturing work orders.
 */
import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { InventoryAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { StockLevel } from '../../schema/stock-level'
import type { Location } from '../../schema/location'
import type { Supplier } from '../../schema/supplier'
import type { PurchaseOrder } from '../../schema/purchase-order'

import {
  credentialFields as tinyErpCredentialFields,
  buildAuthUrl,
  exchangeCode as tinyErpExchangeCode,
  refreshCredentials as tinyErpRefreshCredentials,
  DEFAULT_SCOPES,
} from './auth'
import {TinyErpClient} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'

import {transformProduct, type RawTinyErpProduct} from './transform/product'
import {
  transformStockLevels,
  type RawTinyErpStockLevel,
} from './transform/stock-level'
import {transformLocation, type RawTinyErpDeposito} from './transform/location'
import {transformSupplier, type RawTinyErpContato} from './transform/supplier'
import {
  transformPurchaseOrder,
  type RawTinyErpOrdemCompra,
} from './transform/purchase-order'

export interface TinyErpAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

/** Tiny v3 paginated list envelope */
interface TinyListResponse<T> {
  itens?: T[]
  paginacao?: { limit?: number; offset?: number; total?: number }
}

export class TinyErpAdapter implements InventoryAdapter {
  readonly platform = 'tiny-erp'
  readonly version = '0.1.0'

  private config: TinyErpAdapterConfig

  constructor(config: TinyErpAdapterConfig) {
    this.config = config
  }

  credentialFields(): CredentialField[] {
    return tinyErpCredentialFields()
  }

  /** OAuth2-only — no static credential fields to exchange. */
  async exchangeCredentials(_fields: Record<string, string>): Promise<Credentials> {
    throw new Error('tiny-erp uses OAuth2; call getAuthUrl() + exchangeCode() instead')
  }

  getAuthUrl(state: string, scopes?: string[]): string {
    return buildAuthUrl(
      this.config.clientId,
      this.config.redirectUri,
      scopes ?? DEFAULT_SCOPES,
      state,
    )
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return tinyErpExchangeCode(
      code,
      redirectUri,
      this.config.clientId,
      this.config.clientSecret,
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return tinyErpRefreshCredentials(
      credentials,
      this.config.clientId,
      this.config.clientSecret,
    )
  }

  // ── Webhooks ────────────────────────────────────────────────────────────────
  // Tiny v3 does not document HMAC/JWT signing for outbound webhooks.
  // verifyWebhook and parseWebhookEvents are intentionally not implemented.

  private client(credentials: Credentials): TinyErpClient {
    return new TinyErpClient(credentials)
  }

  private pageParams(params: QueryParams): Record<string, unknown> {
    return {
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
      offset: ((params.page ?? 1) - 1) * (params.limit ?? DEFAULT_PAGE_SIZE),
    }
  }

  // ── Products ────────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).get<TinyListResponse<RawTinyErpProduct>>(
      '/produtos',
      this.pageParams(params),
    )
    return (res.itens ?? []).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const raw = await this.client(credentials).get<RawTinyErpProduct>(`/produtos/${id}`)
    return transformProduct(raw)
  }

  // ── StockLevels ─────────────────────────────────────────────────────────────
  // Tiny only exposes stock by product; listStockLevels is not supported at
  // a global level. Callers must use getStockLevel(productId) per product.

  async listStockLevels(_credentials: Credentials, _params: QueryParams): Promise<StockLevel[]> {
    throw new Error(
      'tiny-erp: listStockLevels is not supported — call getStockLevel(productId) per product',
    )
  }

  async getStockLevel(credentials: Credentials, productId: string): Promise<StockLevel> {
    const raw = await this.client(credentials).get<RawTinyErpStockLevel>(
      `/estoque/${productId}`,
    )
    return transformStockLevels(raw)[0]!
  }

  // ── Locations (Depositos) ───────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const res = await this.client(credentials).get<TinyListResponse<RawTinyErpDeposito>>(
      '/depositos',
      this.pageParams(params),
    )
    return (res.itens ?? []).map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const raw = await this.client(credentials).get<RawTinyErpDeposito>(`/depositos/${id}`)
    return transformLocation(raw)
  }

  // ── Suppliers (Contatos — fornecedores) ────────────────────────────────────

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    // Tiny v3 /contatos has no server-side filter for contact type.
    // We must fetch all active contacts (situacao omitted = all; B = active, A = active
    // with system access) then keep only those whose tipos[] descricao matches "Fornecedor".
    const res = await this.client(credentials).get<TinyListResponse<RawTinyErpContato>>(
      '/contatos',
      this.pageParams(params),
    )
    return (res.itens ?? [])
      .filter((c) =>
        (c.tipos ?? []).some(
          (t) => typeof t.descricao === 'string' && t.descricao.toLowerCase() === 'fornecedor',
        ),
      )
      .map(transformSupplier)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const raw = await this.client(credentials).get<RawTinyErpContato>(`/contatos/${id}`)
    return transformSupplier(raw)
  }

  // ── Purchase Orders (Ordens de Compra) ─────────────────────────────────────

  async listPurchaseOrders(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PurchaseOrder[]> {
    const res = await this.client(credentials).get<TinyListResponse<RawTinyErpOrdemCompra>>(
      '/ordem-compra',
      this.pageParams(params),
    )
    return (res.itens ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const raw = await this.client(credentials).get<RawTinyErpOrdemCompra>(
      `/ordem-compra/${id}`,
    )
    return transformPurchaseOrder(raw)
  }
}
