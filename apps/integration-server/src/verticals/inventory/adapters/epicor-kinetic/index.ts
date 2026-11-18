/**
 * Epicor Kinetic inventory adapter.
 *
 * Epicor Kinetic is an enterprise ERP (formerly Epicor ERP 10). The REST v2
 * API exposes business objects (BOs) as OData v4 endpoints under:
 *   https://{host}/{instance}/api/v2/odata/{company}/{Svc}/{Collection}
 *
 * Auth:   OAuth2 client_credentials via Epicor IdP (login.epicor.com).
 *         Access token + REST v2 API key required on every request.
 * Pages:  OData $top / $skip.
 * Webhooks: Not supported — Epicor Kinetic REST v2 does not publish
 *           signed outbound webhooks; omitted from this adapter.
 *
 * Supported resources:
 *   Products        → PartSvc/Parts
 *   StockLevels     → PartWhseSvc/PartWhses
 *   Locations       → WarehseSvc/Warehouses
 *   Suppliers       → VendorSvc/Vendors
 *   PurchaseOrders  → POSvc/POHeaders  (+ POSvc/PODetails lines)
 *   StockTransfers  → TFOrdHedSvc/TFOrdHeds  (+ TFOrdDtlSvc/TFOrdDtls lines)
 *   StockAdjustments → PartTranSvc/PartTrans (ADJ-QTY class transactions)
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

import {credentialFields as epicorCredentialFields, exchangeCredentials as epicorExchangeCredentials, refreshToken} from './auth'
import {EpicorKineticClient} from './client'
import {DEFAULT_PAGE_SIZE} from './constants'

import {transformProduct, type RawEpicorKineticPart} from './transform/product'
import {transformStockLevel, type RawEpicorKineticPartWhse} from './transform/stock-level'
import {transformLocation, type RawEpicorKineticWarehouse} from './transform/location'
import {transformSupplier, type RawEpicorKineticVendor} from './transform/supplier'
import {transformPurchaseOrder, type RawEpicorKineticPOHeader, type RawEpicorKineticPODetail} from './transform/purchase-order'
import {transformStockTransfer, type RawEpicorKineticTFOrdHed, type RawEpicorKineticTFOrdDtl} from './transform/stock-transfer'
import {transformStockAdjustment, type RawEpicorKineticPartTran} from './transform/stock-adjustment'

export interface EpicorKineticAdapterConfig {
  /** No static config needed — all tenant params come from credentials.extra. */
  [key: string]: unknown
}

/**
 * Adjustment-class TranTypes surfaced as StockAdjustments.
 * Excludes receipt, issue, and manufacturing transactions.
 */
const ADJ_TRAN_TYPES = ['ADJ-QTY', 'ADJ-CST', 'PIK-INV', 'BRK-INV', 'DMR-MTL', 'INS-STK']

export class EpicorKineticAdapter implements InventoryAdapter {
  readonly platform = 'epicor-kinetic'
  readonly version  = '0.1.0'

  constructor(_config?: EpicorKineticAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return epicorCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return epicorExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    throw new Error('epicor-kinetic uses OAuth2 client_credentials; use credentialFields() + exchangeCredentials()')
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('epicor-kinetic uses OAuth2 client_credentials; no authorization-code flow')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshToken(credentials)
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): EpicorKineticClient {
    return new EpicorKineticClient(credentials)
  }

  private odataParams(params: QueryParams): Record<string, unknown> {
    const top  = params.limit ?? DEFAULT_PAGE_SIZE
    const skip = params.page ? (params.page - 1) * top : 0
    return { $top: top, $skip: skip }
  }

  // ── Products ───────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const rows = await this.client(credentials).list<RawEpicorKineticPart>(
      '/Erp.BO.PartSvc/Parts',
      this.odataParams(params),
    )
    return rows.map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const rows = await this.client(credentials).list<RawEpicorKineticPart>(
      '/Erp.BO.PartSvc/Parts',
      { $filter: `PartNum eq '${id}'`, $top: 1 },
    )
    if (!rows[0]) throw new Error(`epicor-kinetic: Part '${id}' not found`)
    return transformProduct(rows[0])
  }

  // ── Stock Levels ───────────────────────────────────────────────────────────

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const rows = await this.client(credentials).list<RawEpicorKineticPartWhse>(
      '/Erp.BO.PartWhseSvc/PartWhses',
      this.odataParams(params),
    )
    return rows.map(transformStockLevel)
  }

  async getStockLevel(credentials: Credentials, id: string): Promise<StockLevel> {
    // id format: "PartNum:WarehouseCode"
    const [partNum, warehouseCode] = id.split(':')
    const rows = await this.client(credentials).list<RawEpicorKineticPartWhse>(
      '/Erp.BO.PartWhseSvc/PartWhses',
      { $filter: `PartNum eq '${partNum}' and WarehouseCode eq '${warehouseCode}'`, $top: 1 },
    )
    if (!rows[0]) throw new Error(`epicor-kinetic: PartWhse '${id}' not found`)
    return transformStockLevel(rows[0])
  }

  // ── Locations ──────────────────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const rows = await this.client(credentials).list<RawEpicorKineticWarehouse>(
      '/Erp.BO.WarehseSvc/Warehouses',
      this.odataParams(params),
    )
    return rows.map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const rows = await this.client(credentials).list<RawEpicorKineticWarehouse>(
      '/Erp.BO.WarehseSvc/Warehouses',
      { $filter: `WarehouseCode eq '${id}'`, $top: 1 },
    )
    if (!rows[0]) throw new Error(`epicor-kinetic: Warehouse '${id}' not found`)
    return transformLocation(rows[0])
  }

  // ── Suppliers ──────────────────────────────────────────────────────────────

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const rows = await this.client(credentials).list<RawEpicorKineticVendor>(
      '/Erp.BO.VendorSvc/Vendors',
      this.odataParams(params),
    )
    return rows.map(transformSupplier)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const rows = await this.client(credentials).list<RawEpicorKineticVendor>(
      '/Erp.BO.VendorSvc/Vendors',
      { $filter: `VendorNum eq ${id}`, $top: 1 },
    )
    if (!rows[0]) throw new Error(`epicor-kinetic: Vendor '${id}' not found`)
    return transformSupplier(rows[0])
  }

  // ── Purchase Orders ────────────────────────────────────────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client   = this.client(credentials)
    const oParams  = this.odataParams(params)
    const headers  = await client.list<RawEpicorKineticPOHeader>('/Erp.BO.POSvc/POHeaders', oParams)

    // Fetch lines for each PO header in parallel (up to 5 at a time).
    const CONCURRENCY = 5
    for (let i = 0; i < headers.length; i += CONCURRENCY) {
      const slice = headers.slice(i, i + CONCURRENCY)
      await Promise.all(slice.map(async (hdr) => {
        const lines = await client.list<RawEpicorKineticPODetail>(
          '/Erp.BO.POSvc/PODetails',
          { $filter: `PONum eq ${hdr.PONum}` },
        )
        hdr._lines = lines
      }))
    }

    return headers.map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client  = this.client(credentials)
    const headers = await client.list<RawEpicorKineticPOHeader>(
      '/Erp.BO.POSvc/POHeaders',
      { $filter: `PONum eq ${id}`, $top: 1 },
    )
    if (!headers[0]) throw new Error(`epicor-kinetic: PO '${id}' not found`)
    const lines = await client.list<RawEpicorKineticPODetail>(
      '/Erp.BO.POSvc/PODetails',
      { $filter: `PONum eq ${id}` },
    )
    headers[0]._lines = lines
    return transformPurchaseOrder(headers[0])
  }

  // ── Stock Transfers ────────────────────────────────────────────────────────

  async listStockTransfers(credentials: Credentials, params: QueryParams): Promise<StockTransfer[]> {
    const client  = this.client(credentials)
    const oParams = this.odataParams(params)
    const headers = await client.list<RawEpicorKineticTFOrdHed>('/Erp.BO.TFOrdHedSvc/TFOrdHeds', oParams)

    const CONCURRENCY = 5
    for (let i = 0; i < headers.length; i += CONCURRENCY) {
      const slice = headers.slice(i, i + CONCURRENCY)
      await Promise.all(slice.map(async (hdr) => {
        const lines = await client.list<RawEpicorKineticTFOrdDtl>(
          '/Erp.BO.TFOrdDtlSvc/TFOrdDtls',
          { $filter: `TFOrdNum eq '${hdr.TFOrdNum}'` },
        )
        hdr._lines = lines
      }))
    }

    return headers.map(transformStockTransfer)
  }

  async getStockTransfer(credentials: Credentials, id: string): Promise<StockTransfer> {
    const client  = this.client(credentials)
    const headers = await client.list<RawEpicorKineticTFOrdHed>(
      '/Erp.BO.TFOrdHedSvc/TFOrdHeds',
      { $filter: `TFOrdNum eq '${id}'`, $top: 1 },
    )
    if (!headers[0]) throw new Error(`epicor-kinetic: Transfer Order '${id}' not found`)
    const lines = await client.list<RawEpicorKineticTFOrdDtl>(
      '/Erp.BO.TFOrdDtlSvc/TFOrdDtls',
      { $filter: `TFOrdNum eq '${id}'` },
    )
    headers[0]._lines = lines
    return transformStockTransfer(headers[0])
  }

  // ── Stock Adjustments ──────────────────────────────────────────────────────

  async listStockAdjustments(credentials: Credentials, params: QueryParams): Promise<StockAdjustment[]> {
    const filter = ADJ_TRAN_TYPES.map((t) => `TranType eq '${t}'`).join(' or ')
    const rows = await this.client(credentials).list<RawEpicorKineticPartTran>(
      '/Erp.BO.PartTranSvc/PartTrans',
      { ...this.odataParams(params), $filter: filter },
    )
    return rows.map(transformStockAdjustment)
  }

  async getStockAdjustment(credentials: Credentials, id: string): Promise<StockAdjustment> {
    const rows = await this.client(credentials).list<RawEpicorKineticPartTran>(
      '/Erp.BO.PartTranSvc/PartTrans',
      { $filter: `TranNum eq ${id}`, $top: 1 },
    )
    if (!rows[0]) throw new Error(`epicor-kinetic: PartTran '${id}' not found`)
    return transformStockAdjustment(rows[0])
  }
}
