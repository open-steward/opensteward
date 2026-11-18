/**
 * Crunchtime adapter for the inventory vertical.
 *
 * Crunchtime (net-chef.com) is the leading restaurant back-office platform
 * covering inventory, purchasing, recipes, and labor for enterprise food-service.
 *
 * Auth: 4-header credential scheme — not a standard OAuth2 flow.
 *   authenticationtoken  provisioned by Crunchtime support per environment
 *   sitename             customer subdomain (e.g. "eattacos" from eattacos.net-chef.com)
 *   userid               Application User ID
 *   password             Application User password
 *
 * Supported resources: products, stock-levels, locations, suppliers, purchase-orders,
 *                       stock-adjustments
 * Not supported:  stock-transfers (no public endpoint documented)
 * Webhooks:       not documented — no webhook support in this adapter
 *
 * Schema-firewall: no product images, no supplier banking, no recipes/BOM.
 */
import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { InventoryAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { StockLevel } from '../../schema/stock-level'
import type { Location } from '../../schema/location'
import type { Supplier } from '../../schema/supplier'
import type { PurchaseOrder } from '../../schema/purchase-order'
import type { StockAdjustment } from '../../schema/stock-adjustment'

import {
  credentialFields as crunchtimeCredentialFields,
  exchangeCredentials as crunchtimeExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import {CrunchtimeClient} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'

import {transformProduct, type RawCrunchtimeProduct} from './transform/product'
import {transformStockLevel, type RawCrunchtimeCurrentInventory} from './transform/stock-level'
import {transformLocation, type RawCrunchtimeLocation} from './transform/location'
import {transformSupplier, type RawCrunchtimeVendor} from './transform/supplier'
import {transformPurchaseOrder, type RawCrunchtimePurchaseOrder} from './transform/purchase-order'
import {transformStockAdjustment, type RawCrunchtimeInventoryAdjustment} from './transform/stock-adjustment'

export interface CrunchtimeAdapterConfig {
  /** No OAuth2 config needed — credentials are supplied via credentialFields(). */
  _placeholder?: never
}

/** Crunchtime page-based list response wrapper. */
interface CrunchtimePageResponse<T> {
  pageNumber?: number
  pageSize?: number
  totalRecords?: number
  data?: T[]
  /** Some endpoints wrap the list directly in a named key; normalised below. */
  [key: string]: unknown
}

export class CrunchtimeAdapter implements InventoryAdapter {
  readonly platform = 'crunchtime'
  readonly version = '0.1.0'

  constructor(_config?: CrunchtimeAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return crunchtimeCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return crunchtimeExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('crunchtime uses provisioned token + site credentials; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Tokens are long-lived and managed by Crunchtime support; no refresh needed.
    return credentials
  }

  private client(credentials: Credentials): CrunchtimeClient {
    return new CrunchtimeClient(credentials)
  }

  private pageParams(params: QueryParams): Record<string, unknown> {
    return {
      pageSize: params.limit ?? DEFAULT_PAGE_SIZE,
      ...(params.page ? { pageNumber: params.page } : { pageNumber: 1 }),
    }
  }

  // ── Products ───────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).get<CrunchtimePageResponse<RawCrunchtimeProduct>>(
      '/companyproduct/v1/getCompanyProductsEnhancedByPage',
      this.pageParams(params),
    )
    return extractList<RawCrunchtimeProduct>(res, 'data').map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).get<CrunchtimePageResponse<RawCrunchtimeProduct>>(
      '/companyproduct/v1/getAllCompanyProductsEnhanced',
      { productNumber: id },
    )
    const items = extractList<RawCrunchtimeProduct>(res, 'data')
    const found = items.find((p) => p.productNumber === id)
    if (!found) throw new Error(`crunchtime product ${id} not found`)
    return transformProduct(found)
  }

  // ── StockLevels ────────────────────────────────────────────────────────────

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const res = await this.client(credentials).get<CrunchtimePageResponse<RawCrunchtimeCurrentInventory>>(
      '/inventory/v1/getCurrentInventoryByPage',
      this.pageParams(params),
    )
    return extractList<RawCrunchtimeCurrentInventory>(res, 'data').map(transformStockLevel)
  }

  async getStockLevel(_credentials: Credentials, id: string): Promise<StockLevel> {
    throw new Error(`crunchtime stock-level fetch is bulk-only; call listStockLevels. id=${id}`)
  }

  // ── Locations ──────────────────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const res = await this.client(credentials).get<CrunchtimePageResponse<RawCrunchtimeLocation>>(
      '/location/v1/getLocationsByPage',
      this.pageParams(params),
    )
    return extractList<RawCrunchtimeLocation>(res, 'data').map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const res = await this.client(credentials).get<CrunchtimePageResponse<RawCrunchtimeLocation>>(
      '/location/v1/getAllLocations',
      { locationCode: id },
    )
    const items = extractList<RawCrunchtimeLocation>(res, 'data')
    const found = items.find((l) => l.locationCode === id)
    if (!found) throw new Error(`crunchtime location ${id} not found`)
    return transformLocation(found)
  }

  // ── Suppliers (Vendors) ────────────────────────────────────────────────────

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const res = await this.client(credentials).get<CrunchtimePageResponse<RawCrunchtimeVendor>>(
      '/vendor/v1/getAllVendors',
      {
        pageSize: params.limit ?? DEFAULT_PAGE_SIZE,
        pageNumber: params.page ?? 1,
      },
    )
    return extractList<RawCrunchtimeVendor>(res, 'data').map(transformSupplier)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const res = await this.client(credentials).get<CrunchtimePageResponse<RawCrunchtimeVendor>>(
      '/vendor/v1/getAllVendors',
      { vendorCode: id },
    )
    const items = extractList<RawCrunchtimeVendor>(res, 'data')
    const found = items.find((v) => v.vendorCode === id)
    if (!found) throw new Error(`crunchtime vendor ${id} not found`)
    return transformSupplier(found)
  }

  // ── PurchaseOrders ─────────────────────────────────────────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const res = await this.client(credentials).get<CrunchtimePageResponse<RawCrunchtimePurchaseOrder>>(
      '/purchaseorder/v1/getPurchaseOrdersByPage',
      this.pageParams(params),
    )
    return extractList<RawCrunchtimePurchaseOrder>(res, 'data').map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const res = await this.client(credentials).get<CrunchtimePageResponse<RawCrunchtimePurchaseOrder>>(
      '/purchaseorder/v1/getAllPurchaseOrders',
      { purchaseOrderNumber: id, includeDetails: true },
    )
    const items = extractList<RawCrunchtimePurchaseOrder>(res, 'data')
    const found = items.find((po) => po.purchaseOrderNumber === id)
    if (!found) throw new Error(`crunchtime purchase order ${id} not found`)
    return transformPurchaseOrder(found)
  }

  // ── StockAdjustments ───────────────────────────────────────────────────────

  async listStockAdjustments(credentials: Credentials, params: QueryParams): Promise<StockAdjustment[]> {
    const res = await this.client(credentials).get<CrunchtimePageResponse<RawCrunchtimeInventoryAdjustment>>(
      '/inventory/v1/getInventoryAdjustmentsByPage',
      this.pageParams(params),
    )
    return extractList<RawCrunchtimeInventoryAdjustment>(res, 'data').map(transformStockAdjustment)
  }

  async getStockAdjustment(credentials: Credentials, id: string): Promise<StockAdjustment> {
    const res = await this.client(credentials).get<CrunchtimePageResponse<RawCrunchtimeInventoryAdjustment>>(
      '/inventory/v1/getAllInventoryAdjustments',
      { adjustmentId: id },
    )
    const items = extractList<RawCrunchtimeInventoryAdjustment>(res, 'data')
    const found = items.find((a) => a.adjustmentId === id)
    if (!found) throw new Error(`crunchtime inventory adjustment ${id} not found`)
    return transformStockAdjustment(found)
  }
}

/**
 * Safely extract a list from the Crunchtime response envelope.
 * The API may return `{ data: [...] }` or a bare array, depending on endpoint version.
 */
function extractList<T>(res: CrunchtimePageResponse<T>, key: string): T[] {
  if (Array.isArray(res)) return res as unknown as T[]
  if (Array.isArray(res[key])) return res[key] as T[]
  return []
}
