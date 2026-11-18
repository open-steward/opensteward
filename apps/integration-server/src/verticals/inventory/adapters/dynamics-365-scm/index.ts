/**
 * Microsoft Dynamics 365 Supply Chain Management adapter — inventory vertical.
 *
 * Auth: OAuth 2.0 client-credentials (Microsoft Entra / Azure AD).
 *   Customers supply tenantHost, aadTenantId, clientId, clientSecret,
 *   environmentId, and organizationId via credentialFields().
 *
 * Two API surfaces in use:
 *   OData /data/*  — products (ReleasedProductsV2), locations (InventWarehouses),
 *                    vendors (VendorsV2), purchase orders (PurchaseOrderHeadersV2),
 *                    transfer orders (TransferOrderHeaders), inventory journals
 *                    (InventJournalTables)
 *   IV service     — one on-hand stock level (getStockLevel) via Inventory
 *                    Visibility indexquery; listStockLevels refuses, since the
 *                    query needs product or site/location ids
 *
 * Pagination: OData $top / $skip (server max 10,000).
 * All OData responses are wrapped in { value: T[] } (standard OData V4 envelope).
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

import { credentialFields, exchangeCredentials, refreshAccessTokens } from './auth'
import { D365ODataClient, D365IvClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import { verifyDynamics365ScmWebhook, parseDynamics365ScmWebhookEvents } from './webhook'

import { transformProduct, type RawD365Product } from './transform/product'
import { transformStockLevel, type RawD365IvStockLevel } from './transform/stock-level'
import { transformLocation, type RawD365Warehouse } from './transform/location'
import { transformSupplier, type RawD365Vendor } from './transform/supplier'
import { transformPurchaseOrder, type RawD365PurchaseOrder } from './transform/purchase-order'
import { transformStockTransfer, type RawD365TransferOrder } from './transform/stock-transfer'
import { transformStockAdjustment, type RawD365InventJournal } from './transform/stock-adjustment'

export interface Dynamics365ScmAdapterConfig {
  /** No config required at construction time; all tenant details come from Credentials.extra. */
  clientId?: string
  clientSecret?: string
}

/** Standard OData V4 list response envelope. */
interface ODataListResponse<T> {
  value?: T[]
  '@odata.nextLink'?: string
}

export class Dynamics365ScmAdapter implements InventoryAdapter {
  readonly platform = 'dynamics-365-scm'
  readonly version = '0.1.0'

  constructor(_config: Dynamics365ScmAdapterConfig = {}) {}

  credentialFields(): CredentialField[] {
    return credentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return exchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    throw new Error(
      'dynamics-365-scm uses OAuth2 client-credentials; use credentialFields() instead',
    )
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error(
      'dynamics-365-scm uses OAuth2 client-credentials; use credentialFields() instead',
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshAccessTokens(credentials)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyDynamics365ScmWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>) {
    return parseDynamics365ScmWebhookEvents(payload)
  }

  private odata(credentials: Credentials): D365ODataClient {
    return new D365ODataClient(credentials)
  }

  private iv(credentials: Credentials): D365IvClient {
    return new D365IvClient(credentials)
  }

  /** Build OData $top / $skip query params. */
  private odataPage(params: QueryParams): Record<string, unknown> {
    const top = params.limit ?? DEFAULT_PAGE_SIZE
    const skip = params.page && params.page > 1 ? (params.page - 1) * top : 0
    return { $top: top, ...(skip > 0 ? { $skip: skip } : {}) }
  }

  // ── Products ─────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.odata(credentials).get<ODataListResponse<RawD365Product>>(
      '/ReleasedProductsV2',
      this.odataPage(params),
    )
    return (res.value ?? []).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    // OData singleton: key is ItemNumber (string, must be URL-encoded)
    const res = await this.odata(credentials).getById<RawD365Product>(
      `/ReleasedProductsV2('${encodeURIComponent(id)}')`,
    )
    return transformProduct(res)
  }

  // ── Stock Levels (Inventory Visibility) ──────────────────────────────────

  /**
   * Refused before any request. The Inventory Visibility on-hand query
   * (POST /api/environment/{environmentId}/onhand/indexquery) cannot ask for
   * all stock: under the "By location" partition rule an empty productId needs
   * siteId and locationId, and under "By product ID" productId is required
   * (https://learn.microsoft.com/en-us/dynamics365/supply-chain/inventory/inventory-visibility-api).
   * The list contract carries no product, site or location, and the method
   * used to send all three empty, a body neither rule allows, then served
   * the same first slice for every page.
   */
  async listStockLevels(_credentials: Credentials, _params: QueryParams): Promise<StockLevel[]> {
    throw Object.assign(
      new Error(
        'Dynamics 365 SCM cannot list stock levels: the Inventory Visibility on-hand query needs ' +
          'product ids or site and location ids ("If it\'s an empty array, the system will return ' +
          'all products for the specified sites and locations. In this case, siteId and locationId ' +
          'shouldn\'t be empty." / "productId should be an array with at least one value."), and a ' +
          'list call carries neither.',
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }

  async getStockLevel(credentials: Credentials, id: string): Promise<StockLevel> {
    // id is expected as "productId:siteId:locationId"
    const parts = id.split(':')
    const productId = parts[0] ?? id
    const siteId = parts[1] ?? ''
    const locationId = parts[2] ?? ''
    const organizationId = String(credentials.extra?.['organizationId'] ?? '')

    const body = {
      filters: {
        organizationId: [organizationId],
        productId: [productId],
        ...(siteId ? { siteId: [siteId] } : {}),
        ...(locationId ? { locationId: [locationId] } : {}),
      },
      groupByValues: ['siteId', 'locationId'],
      returnNegative: false,
    }

    const res = await this.iv(credentials).queryOnHand<
      { Value?: RawD365IvStockLevel[] } | RawD365IvStockLevel[]
    >(body)
    const items: RawD365IvStockLevel[] = Array.isArray(res)
      ? res
      : ((res as { Value?: RawD365IvStockLevel[] }).Value ?? [])

    if (items.length === 0) throw new Error(`dynamics-365-scm: no stock level found for id=${id}`)
    return transformStockLevel(items[0]!)
  }

  // ── Locations (InventWarehouses) ──────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const res = await this.odata(credentials).get<ODataListResponse<RawD365Warehouse>>(
      '/InventWarehouses',
      this.odataPage(params),
    )
    return (res.value ?? []).map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const res = await this.odata(credentials).getById<RawD365Warehouse>(
      `/InventWarehouses('${encodeURIComponent(id)}')`,
    )
    return transformLocation(res)
  }

  // ── Suppliers (VendorsV2) ─────────────────────────────────────────────────

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const res = await this.odata(credentials).get<ODataListResponse<RawD365Vendor>>(
      '/VendorsV2',
      this.odataPage(params),
    )
    return (res.value ?? []).map(transformSupplier)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const res = await this.odata(credentials).getById<RawD365Vendor>(
      `/VendorsV2('${encodeURIComponent(id)}')`,
    )
    return transformSupplier(res)
  }

  // ── Purchase Orders (PurchaseOrderHeadersV2 + lines) ──────────────────────

  async listPurchaseOrders(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PurchaseOrder[]> {
    const res = await this.odata(credentials).get<ODataListResponse<RawD365PurchaseOrder>>(
      '/PurchaseOrderHeadersV2',
      { ...this.odataPage(params), $expand: 'PurchaseOrderLines' },
    )
    return (res.value ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const res = await this.odata(credentials).getById<RawD365PurchaseOrder>(
      `/PurchaseOrderHeadersV2('${encodeURIComponent(id)}')?$expand=PurchaseOrderLines`,
    )
    return transformPurchaseOrder(res)
  }

  // ── Stock Transfers (TransferOrderHeaders + lines) ────────────────────────

  async listStockTransfers(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<StockTransfer[]> {
    const res = await this.odata(credentials).get<ODataListResponse<RawD365TransferOrder>>(
      '/TransferOrderHeaders',
      { ...this.odataPage(params), $expand: 'TransferOrderLines' },
    )
    return (res.value ?? []).map(transformStockTransfer)
  }

  async getStockTransfer(credentials: Credentials, id: string): Promise<StockTransfer> {
    const res = await this.odata(credentials).getById<RawD365TransferOrder>(
      `/TransferOrderHeaders('${encodeURIComponent(id)}')?$expand=TransferOrderLines`,
    )
    return transformStockTransfer(res)
  }

  // ── Stock Adjustments (InventJournalTables + lines) ───────────────────────

  async listStockAdjustments(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<StockAdjustment[]> {
    const res = await this.odata(credentials).get<ODataListResponse<RawD365InventJournal>>(
      '/InventJournalTables',
      {
        ...this.odataPage(params),
        $expand: 'InventJournalLines',
        // Limit to movement/adjustment/count journals
        $filter:
          "JournalType eq 'Movement' or JournalType eq 'StockCount' or JournalType eq 'Adjustment'",
      },
    )
    return (res.value ?? []).map(transformStockAdjustment)
  }

  async getStockAdjustment(credentials: Credentials, id: string): Promise<StockAdjustment> {
    const res = await this.odata(credentials).getById<RawD365InventJournal>(
      `/InventJournalTables('${encodeURIComponent(id)}')?$expand=InventJournalLines`,
    )
    return transformStockAdjustment(res)
  }
}
