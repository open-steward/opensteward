/**
 * Peoplevox WMS adapter — inventory vertical.
 *
 * Peoplevox is a cloud WMS (now Descartes Peoplevox) used by e-commerce brands.
 * Auth: SOAP session — clientId + username + password → session token.
 * Protocol: SOAP 1.2 / IntegrationServiceV4, GetData with TemplateName.
 * Responses: CSV embedded in SOAP Detail element.
 *
 * Supported resources:
 *   - Products  (TemplateName: "Item Types")
 *   - StockLevels (derived from inventory export per-site rows)
 *   - Locations (TemplateName: "Sites")
 *   - Suppliers (TemplateName: "Supplier")
 *   - PurchaseOrders (TemplateName: "Purchase order" + line template)
 *   - StockAdjustments (TemplateName: "Item movement history", reason-filtered)
 *
 * NOT supported: StockTransfers as a first-class resource.
 *   Peoplevox captures inter-site moves via item movement history — no
 *   dedicated transfer template exists; StockTransfer methods are omitted.
 *
 * Schema-firewall: no product images, no supplier banking, no BOM,
 * no customer order data.
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
  credentialFields as pvCredentialFields,
  exchangeCredentials as pvExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import {PeoplevoxClient, type CsvRow} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'

import {transformProduct, type RawPeoplevoxItemType} from './transform/product'
import {transformStockLevel, type RawPeoplevoxInventorySite} from './transform/stock-level'
import {transformLocation, type RawPeoplevoxSite} from './transform/location'
import {transformSupplier, type RawPeoplevoxSupplier} from './transform/supplier'
import {
  transformPurchaseOrder,
  type RawPeoplevoxPurchaseOrder,
  type RawPeoplevoxPurchaseOrderLine,
} from './transform/purchase-order'
import {transformStockAdjustment, type RawPeoplevoxStockAdjustment} from './transform/stock-adjustment'

export interface PeoplevoxAdapterConfig {
  /** No OAuth config needed — session auth is credential-driven. */
  _placeholder?: never
}

/** GetData template names for each resource. */
const TEMPLATE = {
  ITEMS: 'Item Types',
  SITES: 'Sites',
  SUPPLIER: 'Supplier',
  PURCHASE_ORDER: 'Purchase order',
  PURCHASE_ORDER_LINES: 'Purchase order lines',
  ITEM_MOVEMENTS: 'Item movement history',
} as const

export class PeoplevoxAdapter implements InventoryAdapter {
  readonly platform = 'peoplevox'
  readonly version = '0.1.0'

  constructor(_config?: PeoplevoxAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return pvCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return pvExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('peoplevox uses SOAP session auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Credentials are static; the client acquires a fresh session per request.
    return credentials
  }

  private client(credentials: Credentials): PeoplevoxClient {
    return new PeoplevoxClient(credentials)
  }

  private pageParams(params: QueryParams): { pageNo: number; pageSize: number } {
    return {
      pageNo: params.page ?? 1,
      pageSize: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 1000),
    }
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const { pageNo, pageSize } = this.pageParams(params)
    const client = this.client(credentials)
    const { rows } = await client.getData(TEMPLATE.ITEMS, pageNo, pageSize)
    return rows.map((r) => transformProduct(r as unknown as RawPeoplevoxItemType))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const client = this.client(credentials)
    const { rows } = await client.getData(
      TEMPLATE.ITEMS, 1, 1, `ItemCode.Equals("${id}")`,
    )
    if (!rows.length) throw new Error(`peoplevox item not found: ${id}`)
    return transformProduct(rows[0] as unknown as RawPeoplevoxItemType)
  }

  // ── StockLevels ───────────────────────────────────────────────────────────

  /**
   * Export inventory using the Inventory report which provides per-site rows
   * with ItemCode, SiteName (Name), SiteReference (Reference), OnHand,
   * Available, Allocated.
   *
   * The Peoplevox GetData "Item Types" template includes aggregate OnHand/
   * Allocated/Available columns. We derive per-site levels from the "Inventory"
   * report (GetReportData) — mapped here as flat CSV rows.
   */
  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const { pageNo, pageSize } = this.pageParams(params)
    const client = this.client(credentials)
    // "Inventory" is the report that gives per-site stock position.
    // Rows have: ItemCode, ItemName, SiteName, SiteReference, OnHand, Available, Allocated
    const { rows } = await client.getData('Inventory', pageNo, pageSize)
    return rows.map((r) => transformStockLevel(r as unknown as RawPeoplevoxInventorySite))
  }

  async getStockLevel(_credentials: Credentials, id: string): Promise<StockLevel> {
    throw new Error(
      `peoplevox stock-level fetch is bulk-only; call listStockLevels. id=${id}`,
    )
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const { pageNo, pageSize } = this.pageParams(params)
    const client = this.client(credentials)
    const { rows } = await client.getData(TEMPLATE.SITES, pageNo, pageSize)
    return rows.map((r) => transformLocation(r as unknown as RawPeoplevoxSite))
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const client = this.client(credentials)
    const { rows } = await client.getData(
      TEMPLATE.SITES, 1, 1, `Reference.Equals("${id}")`,
    )
    if (!rows.length) throw new Error(`peoplevox site not found: ${id}`)
    return transformLocation(rows[0] as unknown as RawPeoplevoxSite)
  }

  // ── Suppliers ─────────────────────────────────────────────────────────────

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const { pageNo, pageSize } = this.pageParams(params)
    const client = this.client(credentials)
    const { rows } = await client.getData(TEMPLATE.SUPPLIER, pageNo, pageSize)
    return rows.map((r) => transformSupplier(r as unknown as RawPeoplevoxSupplier))
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const client = this.client(credentials)
    const { rows } = await client.getData(
      TEMPLATE.SUPPLIER, 1, 1, `Reference.Equals("${id}")`,
    )
    if (!rows.length) throw new Error(`peoplevox supplier not found: ${id}`)
    return transformSupplier(rows[0] as unknown as RawPeoplevoxSupplier)
  }

  // ── PurchaseOrders ────────────────────────────────────────────────────────

  /**
   * Fetch purchase order headers and lines separately, then merge.
   * Both GetData calls use distinct templates; we join on PurchaseOrderNumber.
   */
  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const { pageNo, pageSize } = this.pageParams(params)
    const client = this.client(credentials)

    const [headersRes, linesRes] = await Promise.all([
      client.getData(TEMPLATE.PURCHASE_ORDER, pageNo, pageSize),
      client.getData(TEMPLATE.PURCHASE_ORDER_LINES, pageNo, pageSize * 10),
    ])

    const linesByPo = new Map<string, CsvRow[]>()
    for (const row of linesRes.rows) {
      const poNum = row['PurchaseOrderNumber'] ?? ''
      if (!linesByPo.has(poNum)) linesByPo.set(poNum, [])
      linesByPo.get(poNum)!.push(row)
    }

    return headersRes.rows.map((h) => {
      const raw = h as unknown as RawPeoplevoxPurchaseOrder
      raw.Lines = (linesByPo.get(h['PurchaseOrderNumber'] ?? '') ?? []) as unknown as RawPeoplevoxPurchaseOrderLine[]
      return transformPurchaseOrder(raw)
    })
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = this.client(credentials)
    const [headersRes, linesRes] = await Promise.all([
      client.getData(TEMPLATE.PURCHASE_ORDER, 1, 1, `PurchaseOrderNumber.Equals("${id}")`),
      client.getData(TEMPLATE.PURCHASE_ORDER_LINES, 1, 1000, `PurchaseOrderNumber.Equals("${id}")`),
    ])
    if (!headersRes.rows.length) throw new Error(`peoplevox purchase order not found: ${id}`)
    const raw = headersRes.rows[0] as unknown as RawPeoplevoxPurchaseOrder
    raw.Lines = linesRes.rows as unknown as RawPeoplevoxPurchaseOrderLine[]
    return transformPurchaseOrder(raw)
  }

  // ── StockAdjustments ─────────────────────────────────────────────────────

  async listStockAdjustments(credentials: Credentials, params: QueryParams): Promise<StockAdjustment[]> {
    const { pageNo, pageSize } = this.pageParams(params)
    const client = this.client(credentials)
    const { rows } = await client.getData(TEMPLATE.ITEM_MOVEMENTS, pageNo, pageSize)
    // Filter to rows that represent adjustments (Register_Reason present, or
    // From/To is a virtual adjustment node rather than a real site transfer).
    const adjRows = rows.filter((r) => Boolean(r['Register_Reason']))
    return adjRows.map((r) => transformStockAdjustment(r as unknown as RawPeoplevoxStockAdjustment))
  }

  async getStockAdjustment(_credentials: Credentials, id: string): Promise<StockAdjustment> {
    throw new Error(
      `peoplevox stock-adjustment fetch is bulk-only; call listStockAdjustments. id=${id}`,
    )
  }
}
