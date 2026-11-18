/**
 * Jubelio adapter — Indonesian omnichannel inventory platform.
 *
 * Auth: POST /login {email, password} → {token} → Authorization: <token>
 * Pagination: ?page=N&pageSize=N (1-based).
 * No inbound webhook signing documented; verifyWebhook is not implemented.
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

import {credentialFields as jubelioCredentialFields, exchangeCredentials as jubelioExchangeCredentials, getAuthUrlUnsupported} from './auth'
import {buildClient} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'

import {transformProduct, type RawJubelioProduct} from './transform/product'
import {transformStockLevel, type RawJubelioStockLevel} from './transform/stock-level'
import {transformLocation, type RawJubelioLocation} from './transform/location'
import {transformSupplier, type RawJubelioSupplier} from './transform/supplier'
import {transformPurchaseOrder, type RawJubelioPurchaseOrder} from './transform/purchase-order'
import {transformStockTransfer, type RawJubelioStockTransfer} from './transform/stock-transfer'
import {transformStockAdjustment, type RawJubelioStockAdjustment} from './transform/stock-adjustment'

export type JubelioAdapterConfig = Record<string, never>

interface PagedResponse<T> {
  data?: T[]
  count?: number
}

export class JubelioAdapter implements InventoryAdapter {
  readonly platform = 'jubelio'
  readonly version = '0.1.0'

  constructor(_config?: JubelioAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return jubelioCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return jubelioExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('jubelio uses email + password login; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Re-login to obtain a fresh token.
    const client = await buildClient({ accessToken: '', extra: credentials.extra })
    const email = String(credentials.extra?.['email'] ?? '')
    const password = String(credentials.extra?.['password'] ?? '')
    const token = await client.login(email, password)
    return { accessToken: token, extra: credentials.extra }
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      pageSize: params.limit ?? DEFAULT_PAGE_SIZE,
      page: params.page ?? 1,
    }
  }

  // ── Products ────────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const client = await buildClient(credentials)
    const res = await client.get<PagedResponse<RawJubelioProduct>>('/inventory/items/', this.listParams(params))
    return (res.data ?? []).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const client = await buildClient(credentials)
    const raw = await client.get<RawJubelioProduct>(`/inventory/items/${id}`)
    return transformProduct(raw)
  }

  // ── Stock Levels ─────────────────────────────────────────────────────────────

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const client = await buildClient(credentials)
    const res = await client.get<PagedResponse<RawJubelioStockLevel>>('/inventory/', this.listParams(params))
    return (res.data ?? []).map(transformStockLevel)
  }

  async getStockLevel(_credentials: Credentials, id: string): Promise<StockLevel> {
    throw new Error(`jubelio stock-level fetch is bulk-only; call listStockLevels. id=${id}`)
  }

  // ── Locations ────────────────────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const client = await buildClient(credentials)
    const res = await client.get<PagedResponse<RawJubelioLocation>>('/locations/', this.listParams(params))
    return (res.data ?? []).map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const client = await buildClient(credentials)
    const raw = await client.get<RawJubelioLocation>(`/locations/${id}`)
    return transformLocation(raw)
  }

  // ── Suppliers ────────────────────────────────────────────────────────────────

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const client = await buildClient(credentials)
    const res = await client.get<PagedResponse<RawJubelioSupplier>>('/contacts/suppliers/', this.listParams(params))
    return (res.data ?? []).map(transformSupplier)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const client = await buildClient(credentials)
    const raw = await client.get<RawJubelioSupplier>(`/contacts/${id}`)
    return transformSupplier(raw)
  }

  // ── Purchase Orders ──────────────────────────────────────────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = await buildClient(credentials)
    const res = await client.get<PagedResponse<RawJubelioPurchaseOrder>>('/purchase/orders/', this.listParams(params))
    return (res.data ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = await buildClient(credentials)
    const raw = await client.get<RawJubelioPurchaseOrder>(`/purchase/orders/${id}`)
    return transformPurchaseOrder(raw)
  }

  // ── Stock Transfers ──────────────────────────────────────────────────────────

  async listStockTransfers(credentials: Credentials, params: QueryParams): Promise<StockTransfer[]> {
    const client = await buildClient(credentials)
    // Jubelio splits transfers into /out and /in; we fetch outbound as canonical list.
    const res = await client.get<PagedResponse<RawJubelioStockTransfer>>('/inventory/transfers/out', this.listParams(params))
    return (res.data ?? []).map(transformStockTransfer)
  }

  async getStockTransfer(credentials: Credentials, id: string): Promise<StockTransfer> {
    const client = await buildClient(credentials)
    const raw = await client.get<RawJubelioStockTransfer>(`/inventory/transfers/${id}`)
    return transformStockTransfer(raw)
  }

  // ── Stock Adjustments ────────────────────────────────────────────────────────

  async listStockAdjustments(credentials: Credentials, params: QueryParams): Promise<StockAdjustment[]> {
    const client = await buildClient(credentials)
    const res = await client.get<PagedResponse<RawJubelioStockAdjustment>>('/inventory/adjustments/', this.listParams(params))
    return (res.data ?? []).map(transformStockAdjustment)
  }

  async getStockAdjustment(credentials: Credentials, id: string): Promise<StockAdjustment> {
    const client = await buildClient(credentials)
    const raw = await client.get<RawJubelioStockAdjustment>(`/inventory/adjustments/${id}`)
    return transformStockAdjustment(raw)
  }
}
