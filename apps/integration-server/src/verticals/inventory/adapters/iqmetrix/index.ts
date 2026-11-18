/**
 * iQmetrix inventory adapter.
 *
 * Auth: OAuth 2.0 resource-owner password grant (no public authorization-code
 * flow).  Credentials include clientId, clientSecret, username, password and
 * companyId from the iQmetrix onboarding package.
 *
 * iQmetrix uses a micro-service topology; each resource lives on a different
 * base URL:
 *   Catalog (products)     → catalogs.iqmetrix.net/v1
 *   Availability (stock)   → availability.iqmetrix.net/v1
 *   Entity Manager (locs)  → entitymanager.iqmetrix.net/v1
 *
 * Supported resources (all read-only):
 *   - products     (catalog items with optional ProductDetails enrichment)
 *   - stock-levels (inventory availability per location)
 *   - locations    (stores / entities from entity manager)
 *   - suppliers    (vendor entity relationships)
 *
 * Not supported — API is write-only or undocumented for retail reads:
 *   - purchase-orders  (write-only RQ integration)
 *   - stock-adjustments (write-only RQ integration)
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: stock-transfer — iQmetrix VIS API offers only an async
 *   write-only POST (Create a Transfer Request); the single GET endpoint
 *   returns creation status + transferId only, with no list or full-record
 *   read capability. Cannot populate the canonical StockTransfer schema.
 *
 * Webhooks: not documented by iQmetrix for retail partners; stubs return false/[].
 *
 * Schema-firewall: no product images, no supplier banking, no BOM.
 */
import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { InventoryAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { StockLevel } from '../../schema/stock-level'
import type { Location } from '../../schema/location'
import type { Supplier } from '../../schema/supplier'

import {
  credentialFields as iqmetrixCredentialFields,
  exchangeCredentials as iqmetrixExchangeCredentials,
  refreshCredentials as iqmetrixRefreshCredentials,
} from './auth'
import {IqmetrixClient} from './client'
import {
  CATALOG_BASE_URL,
  AVAILABILITY_BASE_URL,
  ENTITY_BASE_URL,
  DEFAULT_PAGE_SIZE,
} from './constants'
import {verifyIqmetrixWebhook, parseIqmetrixWebhookEvents} from './webhook'

import {
  transformProduct,
  type RawIqmetrixCatalogItem,
  type RawIqmetrixProductDetails,
} from './transform/product'
import {
  transformStockLevel,
  type RawIqmetrixAvailability,
} from './transform/stock-level'
import {
  transformLocation,
  type RawIqmetrixLocation,
} from './transform/location'
import {
  transformSupplier,
  type RawIqmetrixSupplierEntity,
} from './transform/supplier'
export type IqmetrixAdapterConfig = Record<string, never>

/** Shape of GET /Companies({id})/Catalog/Items response */
interface CatalogItemsResponse {
  Items?: RawIqmetrixCatalogItem[]
}

/** Shape of GET /Companies({id})/Catalog/Items/ProductDetails/Bulk response */
interface BulkProductDetailsResponse {
  CatalogItems?: Record<string, RawIqmetrixProductDetails>
}

/** Shape of array responses from Availability and Entity Manager */
type ArrayResponse<T> = T[]

/** Shape of GET /Companies({id})/Relationships/Vendors response */
interface VendorRelationshipsResponse {
  Relationships?: Array<{ Vendor?: RawIqmetrixSupplierEntity }>
}

export class IqmetrixAdapter implements InventoryAdapter {
  readonly platform = 'iqmetrix'
  readonly version  = '0.1.0'

  constructor(_config: IqmetrixAdapterConfig = {}) {}

  // ── Credentials ──────────────────────────────────────────────────────────

  credentialFields(): CredentialField[] {
    return iqmetrixCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return iqmetrixExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    throw new Error('iqmetrix uses OAuth2 password grant; use credentialFields() instead')
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('iqmetrix uses OAuth2 password grant; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return iqmetrixRefreshCredentials(credentials)
  }

  // ── Webhooks (stubs — not documented by iQmetrix) ────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyIqmetrixWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>) {
    return parseIqmetrixWebhookEvents(payload)
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private companyId(credentials: Credentials): string {
    return String(credentials.extra?.['companyId'] ?? '')
  }

  private catalogClient(credentials: Credentials): IqmetrixClient {
    return new IqmetrixClient(credentials, CATALOG_BASE_URL)
  }

  private availabilityClient(credentials: Credentials): IqmetrixClient {
    return new IqmetrixClient(credentials, AVAILABILITY_BASE_URL)
  }

  private entityClient(credentials: Credentials): IqmetrixClient {
    return new IqmetrixClient(credentials, ENTITY_BASE_URL)
  }

  // ── Products ─────────────────────────────────────────────────────────────
  //
  // GET /Companies({CompanyId})/Catalog/Items
  // Then bulk-enrich with ProductDetails for up to 500 items.

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const companyId = this.companyId(credentials)
    if (!companyId) throw new Error('iqmetrix: companyId missing from credentials.extra')
    const client = this.catalogClient(credentials)

    // Catalog items — paginated via Search endpoint which supports Page/PageSize
    const res = await client.get<CatalogItemsResponse>(
      `/Companies(${companyId})/Catalog/Search`,
      {
        Page:     params.page ?? 1,
        PageSize: params.limit ?? DEFAULT_PAGE_SIZE,
      },
    )

    const items: RawIqmetrixCatalogItem[] = res.Items ?? []
    if (items.length === 0) return []

    // Bulk-enrich with product details (max 500 per call, well within page size)
    const ids = items.map((it) => it.CatalogItemId)
    try {
      const bulk = await client.post<BulkProductDetailsResponse>(
        `/Companies(${companyId})/Catalog/Items/ProductDetails/Bulk`,
        { CatalogItemIds: ids },
      )
      const detailMap = bulk.CatalogItems ?? {}
      for (const item of items) {
        const pd = detailMap[item.CatalogItemId]
        if (pd) item._productDetails = pd
      }
    } catch {
      // Enrichment is best-effort; continue without details
    }

    return items.map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const companyId = this.companyId(credentials)
    if (!companyId) throw new Error('iqmetrix: companyId missing from credentials.extra')
    const client = this.catalogClient(credentials)

    const item = await client.get<RawIqmetrixCatalogItem>(
      `/Companies(${companyId})/Catalog/Items(${id})`,
    )
    if (!item?.CatalogItemId) throw new Error(`iqmetrix: catalog item ${id} not found`)

    // Enrich with product details
    try {
      const pd = await client.get<RawIqmetrixProductDetails>(
        `/Companies(${companyId})/Catalog/Items(${id})/ProductDetails`,
      )
      if (pd) item._productDetails = pd
    } catch {
      // best-effort
    }

    return transformProduct(item)
  }

  // ── Stock Levels ─────────────────────────────────────────────────────────
  //
  // GET /Companies({CompanyId})/CatalogItems/Availability
  // Returns array of AvailabilityItem { Id, CatalogItemId, EntityId, Quantity, IsAvailable }

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const companyId = this.companyId(credentials)
    if (!companyId) throw new Error('iqmetrix: companyId missing from credentials.extra')

    const items = await this.availabilityClient(credentials).get<ArrayResponse<RawIqmetrixAvailability>>(
      `/Companies(${companyId})/CatalogItems/Availability`,
      {
        $skip:  ((params.page ?? 1) - 1) * (params.limit ?? DEFAULT_PAGE_SIZE),
        $top:   params.limit ?? DEFAULT_PAGE_SIZE,
      },
    )

    return (Array.isArray(items) ? items : []).map(transformStockLevel)
  }

  async getStockLevel(credentials: Credentials, id: string): Promise<StockLevel> {
    const companyId = this.companyId(credentials)
    if (!companyId) throw new Error('iqmetrix: companyId missing from credentials.extra')

    // Availability records are identified by CatalogItemId; no single-record GET
    const items = await this.availabilityClient(credentials).get<ArrayResponse<RawIqmetrixAvailability>>(
      `/Companies(${companyId})/CatalogItems/Availability`,
      { $filter: `CatalogItemId eq '${id}'` },
    )
    const arr = Array.isArray(items) ? items : []
    if (arr.length === 0) throw new Error(`iqmetrix: no availability record found for CatalogItemId=${id}`)
    // Return first record (aggregated on-hand across all locations)
    return transformStockLevel(arr[0]!)
  }

  // ── Locations ────────────────────────────────────────────────────────────
  //
  // GET /Companies({CompanyId})/Locations
  // Returns array of Location { Id, Name, Address, ... }

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const companyId = this.companyId(credentials)
    if (!companyId) throw new Error('iqmetrix: companyId missing from credentials.extra')

    const items = await this.entityClient(credentials).get<ArrayResponse<RawIqmetrixLocation>>(
      `/Companies(${companyId})/Locations`,
      {
        $skip: ((params.page ?? 1) - 1) * (params.limit ?? DEFAULT_PAGE_SIZE),
        $top:  params.limit ?? DEFAULT_PAGE_SIZE,
      },
    )

    return (Array.isArray(items) ? items : []).map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const companyId = this.companyId(credentials)
    if (!companyId) throw new Error('iqmetrix: companyId missing from credentials.extra')

    const item = await this.entityClient(credentials).get<RawIqmetrixLocation>(
      `/Companies(${companyId})/Locations(${id})`,
    )
    if (!item?.Id) throw new Error(`iqmetrix: location ${id} not found`)
    return transformLocation(item)
  }

  // ── Suppliers ────────────────────────────────────────────────────────────
  //
  // GET /Companies({CompanyId})/Relationships/Vendors
  // Returns vendor entity relationships from the entity manager.

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const companyId = this.companyId(credentials)
    if (!companyId) throw new Error('iqmetrix: companyId missing from credentials.extra')

    // Entity manager returns vendor relationships
    const res = await this.entityClient(credentials).get<VendorRelationshipsResponse>(
      `/Companies(${companyId})/Relationships/Vendors`,
      {
        $skip: ((params.page ?? 1) - 1) * (params.limit ?? DEFAULT_PAGE_SIZE),
        $top:  params.limit ?? DEFAULT_PAGE_SIZE,
      },
    )

    const relationships = Array.isArray(res)
      ? (res as RawIqmetrixSupplierEntity[])
      : (res?.Relationships?.map((r) => r.Vendor).filter(Boolean) as RawIqmetrixSupplierEntity[] ?? [])

    return relationships.map(transformSupplier)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const companyId = this.companyId(credentials)
    if (!companyId) throw new Error('iqmetrix: companyId missing from credentials.extra')

    const item = await this.entityClient(credentials).get<RawIqmetrixSupplierEntity>(
      `/Companies(${companyId})/Relationships/Vendors(${id})`,
    )
    if (!item?.Id) throw new Error(`iqmetrix: vendor ${id} not found`)
    return transformSupplier(item)
  }
}
