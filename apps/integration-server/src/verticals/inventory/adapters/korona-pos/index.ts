/**
 * KORONA POS (KORONA.cloud) adapter for the inventory vertical.
 *
 * KORONA.cloud is a cloud POS and inventory platform by COMBASE.
 * Auth: HTTP Basic (username:password Base64-encoded), account UUID in URL path.
 * API: REST v3, https://www.koronacloud.com/web/api/v3/accounts/{accountId}/...
 * Pagination: page + size query params; response envelope has results[], pagesTotal.
 * Webhooks: no HMAC/JWT webhook signing documented; webhook support omitted.
 * Schema-firewall: no product images, no supplier banking, no BOM/manufacturing.
 *
 * Resource mapping:
 *   products         → GET /products
 *   stock levels     → GET /products/{id}/stocks (per-product) or /organizationalUnits/{id}/productStocks
 *   locations        → GET /organizationalUnits
 *   suppliers        → GET /suppliers
 *   purchase orders  → GET /stockReceipts (KORONA's goods-receipt documents)
 *   stock transfers  → GET /stockReceipts filtered to those with sourceOrganizationalUnit
 *   stock adjustments→ GET /stockAdjustments (quantity delta documents with per-item reasons)
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
  credentialFields as koronaPosCredentialFields,
  exchangeCredentials as koronaPosExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import {KoronaPosClient, type KoronaResultList} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'

import {transformProduct, type RawKoronaPosProduct} from './transform/product'
import {transformStockLevel, type RawKoronaPosProductStock} from './transform/stock-level'
import {transformLocation, type RawKoronaPosOrganizationalUnit} from './transform/location'
import {transformSupplier, type RawKoronaPosSupplier} from './transform/supplier'
import {transformPurchaseOrder, type RawKoronaPosStockReceipt} from './transform/purchase-order'
import {transformStockTransfer, type RawKoronaPosStockTransfer} from './transform/stock-transfer'
import {transformStockAdjustment, type RawKoronaStockAdjustment} from './transform/stock-adjustment'

// No OAuth config needed; credentials are username/password + accountId
export type KoronaPosAdapterConfig = Record<string, never>

export class KoronaPosAdapter implements InventoryAdapter {
  readonly platform = 'korona-pos'
  readonly version = '0.1.0'

  constructor(_config?: KoronaPosAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return koronaPosCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return koronaPosExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('korona-pos uses HTTP Basic auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): KoronaPosClient {
    return new KoronaPosClient(credentials)
  }

  private pageParams(params: QueryParams): Record<string, unknown> {
    return {
      page: params.page ?? 1,
      size: params.limit ?? DEFAULT_PAGE_SIZE,
    }
  }

  // ── Products ────────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).get<KoronaResultList<RawKoronaPosProduct>>(
      'products',
      this.pageParams(params),
    )
    return (res.results ?? []).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const raw = await this.client(credentials).get<RawKoronaPosProduct>(`products/${id}`)
    return transformProduct(raw)
  }

  // ── Stock Levels ─────────────────────────────────────────────────────────────
  // KORONA exposes per-product stock across warehouses. We list all products
  // then collect stock for each, or use the warehouse-level endpoint.

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    // Use per-product stock endpoint, paginating products first
    const productsRes = await this.client(credentials).get<KoronaResultList<RawKoronaPosProduct>>(
      'products',
      { ...this.pageParams(params), trackInventory: true },
    )
    const levels: StockLevel[] = []
    for (const product of productsRes.results ?? []) {
      try {
        const stockRes = await this.client(credentials).get<KoronaResultList<RawKoronaPosProductStock>>(
          `products/${product.id}/stocks`,
          { page: 1, size: 500 },
        )
        levels.push(...(stockRes.results ?? []).map(transformStockLevel))
      } catch {
        // Skip products that have no stock data
      }
    }
    return levels
  }

  async getStockLevel(_credentials: Credentials, id: string): Promise<StockLevel> {
    throw new Error(
      `korona-pos stock levels are product+warehouse scoped; call listStockLevels. id=${id}`,
    )
  }

  // ── Locations ────────────────────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const res = await this.client(credentials).get<KoronaResultList<RawKoronaPosOrganizationalUnit>>(
      'organizationalUnits',
      this.pageParams(params),
    )
    return (res.results ?? []).map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const raw = await this.client(credentials).get<RawKoronaPosOrganizationalUnit>(
      `organizationalUnits/${id}`,
    )
    return transformLocation(raw)
  }

  // ── Suppliers ────────────────────────────────────────────────────────────────

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const res = await this.client(credentials).get<KoronaResultList<RawKoronaPosSupplier>>(
      'suppliers',
      this.pageParams(params),
    )
    return (res.results ?? []).map(transformSupplier)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const raw = await this.client(credentials).get<RawKoronaPosSupplier>(`suppliers/${id}`)
    return transformSupplier(raw)
  }

  // ── Purchase Orders (StockReceipts) ──────────────────────────────────────────
  // KORONA stock receipts from external suppliers act as purchase orders.
  // We filter to those that have a `supplier` set (incoming goods from vendor).

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const res = await this.client(credentials).get<KoronaResultList<RawKoronaPosStockReceipt>>(
      'stockReceipts',
      this.pageParams(params),
    )
    return (res.results ?? [])
      .filter((r) => Boolean(r.supplier?.id))
      .map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const raw = await this.client(credentials).get<RawKoronaPosStockReceipt>(`stockReceipts/${id}`)
    return transformPurchaseOrder(raw)
  }

  // ── Stock Transfers ───────────────────────────────────────────────────────────
  // Stock transfers in KORONA are stock receipts that have a sourceOrganizationalUnit
  // (origin location) in addition to the destination organizationalUnit.

  async listStockTransfers(credentials: Credentials, params: QueryParams): Promise<StockTransfer[]> {
    const res = await this.client(credentials).get<KoronaResultList<RawKoronaPosStockTransfer>>(
      'stockReceipts',
      this.pageParams(params),
    )
    return (res.results ?? [])
      .filter((r) => Boolean(r.sourceOrganizationalUnit?.id))
      .map(transformStockTransfer)
  }

  async getStockTransfer(credentials: Credentials, id: string): Promise<StockTransfer> {
    const raw = await this.client(credentials).get<RawKoronaPosStockTransfer>(`stockReceipts/${id}`)
    return transformStockTransfer(raw)
  }

  // ── Stock Adjustments ────────────────────────────────────────────────────────
  // KORONA stockAdjustments represent quantity-delta documents with per-item reasons.

  async listStockAdjustments(credentials: Credentials, params: QueryParams): Promise<StockAdjustment[]> {
    const res = await this.client(credentials).get<KoronaResultList<RawKoronaStockAdjustment>>(
      'stockAdjustments',
      this.pageParams(params),
    )
    return (res.results ?? []).map(transformStockAdjustment)
  }

  async getStockAdjustment(credentials: Credentials, id: string): Promise<StockAdjustment> {
    const raw = await this.client(credentials).get<RawKoronaStockAdjustment>(`stockAdjustments/${id}`)
    return transformStockAdjustment(raw)
  }
}
