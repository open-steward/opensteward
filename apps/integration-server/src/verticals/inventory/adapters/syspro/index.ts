/**
 * SYSPRO inventory adapter.
 *
 * SYSPRO 8 exposes a read-only OData 4.0 service:
 *   https://{host}/SYSPRO8OData/SYSPROOData/{companyId}/{EntitySet}
 *
 * Auth: HTTP Basic — Base64(operator:password).
 *   ISV/runtime product code: username becomes {operator}#RunTimeProductCode#{code}.
 *
 * Supported resources: products, stock-levels, locations, suppliers,
 *   purchase-orders, stock-adjustments, stock-transfers.
 * Webhooks: not supported (OData is polling-only).
 *
 * Pagination: OData $top / $skip. Default page size 100, server max 5 000.
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

import {credentialFields as sysproCredentialFields, exchangeCredentials as sysproExchangeCredentials, getAuthUrlUnsupported} from './auth'
import {SysproClient} from './client'
import {DEFAULT_PAGE_SIZE, ODATA_TOP, ODATA_SKIP, ODATA_EXPAND, ODATA_FILTER} from './constants'
import {verifySysproWebhook, parseSysproWebhookEvents} from './webhook'

import {transformProduct, type RawSysproProduct} from './transform/product'
import {transformStockLevel, type RawSysproStockLevel} from './transform/stock-level'
import {transformLocation, type RawSysproLocation} from './transform/location'
import {transformSupplier, type RawSysproSupplier} from './transform/supplier'
import {transformPurchaseOrder, type RawSysproPurchaseOrder} from './transform/purchase-order'
import {transformStockAdjustment, type RawSysproStockAdjustment} from './transform/stock-adjustment'
import {
  transformStockTransfer,
  groupTransferRows,
  type RawSysproTransferRow,
} from './transform/stock-transfer'
export type SysproAdapterConfig = Record<string, never>

export class SysproAdapter implements InventoryAdapter {
  readonly platform = 'syspro'
  readonly version = '0.1.0'

  constructor(_config: SysproAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return sysproCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return sysproExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('syspro uses Basic auth via credentialFields(); exchangeCode is not supported')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Basic auth credentials do not expire.
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifySysproWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): never[] {
    return parseSysproWebhookEvents(payload)
  }

  private client(credentials: Credentials): SysproClient {
    return new SysproClient(credentials)
  }

  private odataParams(params: QueryParams): Record<string, unknown> {
    const top  = params.limit ?? DEFAULT_PAGE_SIZE
    const skip = params.page !== undefined ? (params.page - 1) * top : undefined
    return {
      [ODATA_TOP]:  top,
      ...(skip !== undefined ? { [ODATA_SKIP]: skip } : {}),
    }
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const rows = await this.client(credentials).getCollection<RawSysproProduct>(
      'InvMaster',
      this.odataParams(params),
    )
    return rows.map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const row = await this.client(credentials).getEntity<RawSysproProduct>(
      `InvMaster('${encodeURIComponent(id)}')`,
    )
    return transformProduct(row)
  }

  // ── Stock Levels ──────────────────────────────────────────────────────────

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const rows = await this.client(credentials).getCollection<RawSysproStockLevel>(
      'InvWarehouse',
      this.odataParams(params),
    )
    return rows.map(transformStockLevel)
  }

  async getStockLevel(credentials: Credentials, id: string): Promise<StockLevel> {
    // Composite key: stockCode:warehouse — split on last ':'
    const colon = id.lastIndexOf(':')
    if (colon < 1) throw new Error(`syspro getStockLevel: id must be "StockCode:Warehouse", got "${id}"`)
    const stockCode = id.slice(0, colon)
    const warehouse = id.slice(colon + 1)
    const row = await this.client(credentials).getEntity<RawSysproStockLevel>(
      `InvWarehouse(StockCode='${encodeURIComponent(stockCode)}',Warehouse='${encodeURIComponent(warehouse)}')`,
    )
    return transformStockLevel(row)
  }

  // ── Locations (Warehouses) ────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const rows = await this.client(credentials).getCollection<RawSysproLocation>(
      'InvWhControl',
      this.odataParams(params),
    )
    return rows.map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const row = await this.client(credentials).getEntity<RawSysproLocation>(
      `InvWhControl('${encodeURIComponent(id)}')`,
    )
    return transformLocation(row)
  }

  // ── Suppliers ─────────────────────────────────────────────────────────────

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const rows = await this.client(credentials).getCollection<RawSysproSupplier>(
      'ApSupplier',
      this.odataParams(params),
    )
    return rows.map(transformSupplier)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const row = await this.client(credentials).getEntity<RawSysproSupplier>(
      `ApSupplier('${encodeURIComponent(id)}')`,
    )
    return transformSupplier(row)
  }

  // ── Purchase Orders ───────────────────────────────────────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const rows = await this.client(credentials).getCollection<RawSysproPurchaseOrder>(
      'PorMasterHdr',
      {
        ...this.odataParams(params),
        [ODATA_EXPAND]: 'PorMasterDetail',
      },
    )
    return rows.map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const row = await this.client(credentials).getEntity<RawSysproPurchaseOrder>(
      `PorMasterHdr('${encodeURIComponent(id)}')`,
      { [ODATA_EXPAND]: 'PorMasterDetail' },
    )
    return transformPurchaseOrder(row)
  }

  // ── Stock Adjustments ─────────────────────────────────────────────────────

  async listStockAdjustments(credentials: Credentials, params: QueryParams): Promise<StockAdjustment[]> {
    // Adjustments are inventory movements that are NOT transfers (type != 'TRF').
    const rows = await this.client(credentials).getCollection<RawSysproStockAdjustment>(
      'InvMovements',
      {
        ...this.odataParams(params),
        [ODATA_FILTER]: "MovementType ne 'TRF'",
      },
    )
    return rows.map(transformStockAdjustment)
  }

  async getStockAdjustment(credentials: Credentials, id: string): Promise<StockAdjustment> {
    const row = await this.client(credentials).getEntity<RawSysproStockAdjustment>(
      `InvMovements(${encodeURIComponent(id)})`,
    )
    return transformStockAdjustment(row)
  }

  // ── Stock Transfers ───────────────────────────────────────────────────────

  async listStockTransfers(credentials: Credentials, params: QueryParams): Promise<StockTransfer[]> {
    // Transfers are inventory movements with MovementType = 'TRF'.
    // Each transfer journal appears as two rows (issue + receipt); group them.
    const rows = await this.client(credentials).getCollection<RawSysproTransferRow>(
      'InvMovements',
      {
        ...this.odataParams(params),
        [ODATA_FILTER]: "MovementType eq 'TRF'",
      },
    )
    return groupTransferRows(rows).map(transformStockTransfer)
  }

  async getStockTransfer(credentials: Credentials, id: string): Promise<StockTransfer> {
    // Fetch both legs of the transfer by source journal number.
    const rows = await this.client(credentials).getCollection<RawSysproTransferRow>(
      'InvMovements',
      {
        [ODATA_FILTER]: `SourceJournal eq ${encodeURIComponent(id)} and MovementType eq 'TRF'`,
      },
    )
    const transfers = groupTransferRows(rows)
    if (transfers.length === 0) {
      throw new Error(`syspro stock-transfer ${id} not found`)
    }
    return transformStockTransfer(transfers[0]!)
  }
}
