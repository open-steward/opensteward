/**
 * VHSYS inventory adapter.
 *
 * VHSYS is a Brazilian SMB ERP (vhsys.com.br). The public REST API v2 exposes
 * products, stock levels per deposit, deposits (locations), suppliers, and
 * purchase orders.
 *
 * Auth: static API key pair — access-token + secret-access-token headers.
 * Base URL: https://api.vhsys.com/v2
 * Pagination: query params `pagina` (1-based page) + `limite` (page size, max 100).
 *
 * Webhooks: VHSYS posts plain JSON payloads with no documented HMAC/JWT
 * signature header — verifyWebhook is not implemented.
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

import {credentialFields as vhsysCredentialFields, exchangeCredentials as vhsysExchangeCredentials, getAuthUrlUnsupported} from './auth'
import {VhsysClient} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'

import {transformProduct, type RawVhsysProduct} from './transform/product'
import {transformStockLevel, type RawVhsysStockLevel} from './transform/stock-level'
import {transformLocation, type RawVhsysLocation} from './transform/location'
import {transformSupplier, type RawVhsysSupplier} from './transform/supplier'
import {transformPurchaseOrder, type RawVhsysPurchaseOrder} from './transform/purchase-order'

export type VhsysAdapterConfig = Record<string, never>

/** Paginated list response wrapper used by VHSYS list endpoints. */
interface VhsysList<T> {
  data?: T[]
  total?: number
  pagina?: number
  // Some endpoints use a top-level array directly.
  [key: string]: unknown
}

export class VhsysAdapter implements InventoryAdapter {
  readonly platform = 'vhsys'
  readonly version = '0.1.0'

  constructor(_config?: VhsysAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return vhsysCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>) {
    return vhsysExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('vhsys uses static API key pair; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): VhsysClient {
    return new VhsysClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      limite: params.limit ?? DEFAULT_PAGE_SIZE,
      ...(params.page ? { pagina: params.page } : { pagina: 1 }),
    }
  }

  /** Extract the item array from a VHSYS paginated response. */
  private items<T>(res: VhsysList<T>): T[] {
    if (Array.isArray(res.data)) return res.data
    // Some endpoints wrap under a named key — fall back to first array value found.
    for (const v of Object.values(res)) {
      if (Array.isArray(v)) return v as T[]
    }
    return []
  }

  // ── Products ───────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).get<VhsysList<RawVhsysProduct>>('/produtos', this.listParams(params))
    return this.items<RawVhsysProduct>(res).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).get<RawVhsysProduct>(`/produtos/${id}`)
    return transformProduct(res)
  }

  // ── Stock levels ──────────────────────────────────────────────────────────

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const res = await this.client(credentials).get<VhsysList<RawVhsysStockLevel>>('/estoque', this.listParams(params))
    return this.items<RawVhsysStockLevel>(res).map(transformStockLevel)
  }

  async getStockLevel(credentials: Credentials, id: string): Promise<StockLevel> {
    // id may be "productId" or "productId:depositId"
    const [productId] = id.split(':')
    const res = await this.client(credentials).get<VhsysList<RawVhsysStockLevel>>(`/estoque/${productId}`)
    const items = this.items<RawVhsysStockLevel>(res)
    if (items.length === 0) throw new Error(`vhsys stock level not found for product ${productId}`)
    // If composite id requested, match on deposit
    if (id.includes(':')) {
      const depositId = id.split(':')[1]
      const match = items.find((s) => String(s.id_deposito ?? '') === depositId)
      if (!match) throw new Error(`vhsys stock level not found for product ${productId} deposit ${depositId}`)
      return transformStockLevel(match)
    }
    return transformStockLevel(items[0])
  }

  // ── Locations (depósitos) ─────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const res = await this.client(credentials).get<VhsysList<RawVhsysLocation>>('/depositos', this.listParams(params))
    return this.items<RawVhsysLocation>(res).map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const res = await this.client(credentials).get<RawVhsysLocation>(`/depositos/${id}`)
    return transformLocation(res)
  }

  // ── Suppliers (fornecedores) ───────────────────────────────────────────────

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const res = await this.client(credentials).get<VhsysList<RawVhsysSupplier>>('/fornecedores', this.listParams(params))
    return this.items<RawVhsysSupplier>(res).map(transformSupplier)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const res = await this.client(credentials).get<RawVhsysSupplier>(`/fornecedores/${id}`)
    return transformSupplier(res)
  }

  // ── Purchase orders (ordens de compra) ────────────────────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const res = await this.client(credentials).get<VhsysList<RawVhsysPurchaseOrder>>('/ordens-compra', this.listParams(params))
    return this.items<RawVhsysPurchaseOrder>(res).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const res = await this.client(credentials).get<RawVhsysPurchaseOrder>(`/ordens-compra/${id}`)
    return transformPurchaseOrder(res)
  }

  // ── Stock transfers / adjustments — not supported by VHSYS v2 public API ──

  async listStockTransfers(_credentials: Credentials, _params: QueryParams): Promise<never[]> {
    // VHSYS v2 does not expose a stock-transfer endpoint.
    return []
  }

  async listStockAdjustments(_credentials: Credentials, _params: QueryParams): Promise<never[]> {
    // VHSYS v2 does not expose a stock-adjustment list endpoint.
    return []
  }
}
