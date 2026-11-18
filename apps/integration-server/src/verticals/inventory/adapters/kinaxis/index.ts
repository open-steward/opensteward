/**
 * Kinaxis Maestro inventory adapter.
 *
 * Kinaxis Maestro (formerly RapidResponse) is a supply chain orchestration
 * platform. This adapter surfaces inventory-relevant entities:
 *
 *   Products  — mapped from the Maestro "Part" table
 *   StockLevels — mapped from OnHandInventory
 *   Locations — mapped from the "Site" table
 *   Suppliers — mapped from the "Supplier" table
 *   PurchaseOrders — mapped from the "PurchaseOrder" table
 *   StockTransfers — mapped from the "Transfer" table
 *   StockAdjustments — mapped from the "InventoryAdjustment" table
 *
 * Auth: OAuth2 (authorization_code or client_credentials).
 * Tenant-scoped: credentials.extra.tenant must carry the subdomain slug.
 *
 * Webhooks: Kinaxis does not document a public HMAC/JWT webhook signature
 * scheme — webhook support is omitted.
 *
 * Schema-firewall: no BOM / routing, no manufacturing work orders, no
 * supplier banking details, no demand planning data.
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
  credentialFields as kinaxisCredentialFields,
  exchangeCredentials as kinaxisExchangeCredentials,
  buildAuthUrl,
  exchangeCode as kinaxisExchangeCode,
  refreshAccessToken,
} from './auth'
import {KinaxisClient} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'

import {transformProduct, type RawKinaxisPart} from './transform/product'
import {transformStockLevel, type RawKinaxisOnHandInventory} from './transform/stock-level'
import {transformLocation, type RawKinaxisSite} from './transform/location'
import {transformSupplier, type RawKinaxisSupplier} from './transform/supplier'
import {transformPurchaseOrder, type RawKinaxisPurchaseOrder} from './transform/purchase-order'
import {transformStockTransfer, type RawKinaxisTransfer} from './transform/stock-transfer'
import {transformStockAdjustment, type RawKinaxisInventoryAdjustment} from './transform/stock-adjustment'

export interface KinaxisAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

/** Envelope returned by all Maestro list endpoints. */
interface KinaxisListResponse<T> {
  /** Total record count (used for pagination decisions). */
  totalCount?: number
  /** The entity array — key varies per endpoint, so we accept any string key. */
  [key: string]: T[] | number | undefined
}

/** Extract the data array from a list envelope by taking the first array value. */
function extractList<T>(res: KinaxisListResponse<T>): T[] {
  for (const v of Object.values(res)) {
    if (Array.isArray(v)) return v as T[]
  }
  return []
}

export class KinaxisAdapter implements InventoryAdapter {
  readonly platform = 'kinaxis'
  readonly version = '0.1.0'

  constructor(private readonly config: KinaxisAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return kinaxisCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return kinaxisExchangeCredentials(fields)
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    // Tenant is not yet known at this call; caller must include tenant in state
    // or use a separate mechanism. We derive it from the config if available.
    const tenant = (this.config as unknown as { tenant?: string }).tenant ?? 'tenant'
    return buildAuthUrl(
      tenant,
      this.config.clientId,
      this.config.redirectUri,
      state,
      overrideScopes ?? this.config.scopes,
    )
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    const tenant = (this.config as unknown as { tenant?: string }).tenant ?? ''
    if (!tenant) throw new Error('kinaxis: config.tenant is required for exchangeCode')
    return kinaxisExchangeCode(code, tenant, this.config.clientId, this.config.clientSecret, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshAccessToken(credentials)
  }

  private client(credentials: Credentials): KinaxisClient {
    return new KinaxisClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      pageSize: params.limit ?? DEFAULT_PAGE_SIZE,
      page: params.page ?? 1,
      ...(params.updatedAfter
        ? { modifiedSince: params.updatedAfter.toISOString() }
        : {}),
    }
  }

  // ── Products (Parts) ──────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).get<KinaxisListResponse<RawKinaxisPart>>(
      '/parts',
      this.listParams(params),
    )
    return extractList<RawKinaxisPart>(res).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const raw = await this.client(credentials).get<RawKinaxisPart>(`/parts/${encodeURIComponent(id)}`)
    return transformProduct(raw)
  }

  // ── StockLevels (OnHandInventory) ─────────────────────────────────────────

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const res = await this.client(credentials).get<KinaxisListResponse<RawKinaxisOnHandInventory>>(
      '/inventory/on-hand',
      this.listParams(params),
    )
    return extractList<RawKinaxisOnHandInventory>(res).map(transformStockLevel)
  }

  async getStockLevel(_credentials: Credentials, id: string): Promise<StockLevel> {
    throw new Error(
      `kinaxis: stock levels are bulk-only via listStockLevels; single-record fetch unsupported. id=${id}`,
    )
  }

  // ── Locations (Sites) ─────────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const res = await this.client(credentials).get<KinaxisListResponse<RawKinaxisSite>>(
      '/sites',
      this.listParams(params),
    )
    return extractList<RawKinaxisSite>(res).map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const raw = await this.client(credentials).get<RawKinaxisSite>(`/sites/${encodeURIComponent(id)}`)
    return transformLocation(raw)
  }

  // ── Suppliers ─────────────────────────────────────────────────────────────

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const res = await this.client(credentials).get<KinaxisListResponse<RawKinaxisSupplier>>(
      '/suppliers',
      this.listParams(params),
    )
    return extractList<RawKinaxisSupplier>(res).map(transformSupplier)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const raw = await this.client(credentials).get<RawKinaxisSupplier>(
      `/suppliers/${encodeURIComponent(id)}`,
    )
    return transformSupplier(raw)
  }

  // ── Purchase Orders ───────────────────────────────────────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const res = await this.client(credentials).get<KinaxisListResponse<RawKinaxisPurchaseOrder>>(
      '/purchase-orders',
      this.listParams(params),
    )
    return extractList<RawKinaxisPurchaseOrder>(res).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const raw = await this.client(credentials).get<RawKinaxisPurchaseOrder>(
      `/purchase-orders/${encodeURIComponent(id)}`,
    )
    return transformPurchaseOrder(raw)
  }

  // ── Stock Transfers ───────────────────────────────────────────────────────

  async listStockTransfers(credentials: Credentials, params: QueryParams): Promise<StockTransfer[]> {
    const res = await this.client(credentials).get<KinaxisListResponse<RawKinaxisTransfer>>(
      '/transfers',
      this.listParams(params),
    )
    return extractList<RawKinaxisTransfer>(res).map(transformStockTransfer)
  }

  async getStockTransfer(credentials: Credentials, id: string): Promise<StockTransfer> {
    const raw = await this.client(credentials).get<RawKinaxisTransfer>(
      `/transfers/${encodeURIComponent(id)}`,
    )
    return transformStockTransfer(raw)
  }

  // ── Stock Adjustments ─────────────────────────────────────────────────────

  async listStockAdjustments(credentials: Credentials, params: QueryParams): Promise<StockAdjustment[]> {
    const res = await this.client(credentials).get<KinaxisListResponse<RawKinaxisInventoryAdjustment>>(
      '/inventory/adjustments',
      this.listParams(params),
    )
    return extractList<RawKinaxisInventoryAdjustment>(res).map(transformStockAdjustment)
  }

  async getStockAdjustment(credentials: Credentials, id: string): Promise<StockAdjustment> {
    const raw = await this.client(credentials).get<RawKinaxisInventoryAdjustment>(
      `/inventory/adjustments/${encodeURIComponent(id)}`,
    )
    return transformStockAdjustment(raw)
  }
}
