/**
 * SAP Extended Warehouse Management (SAP EWM) inventory adapter.
 *
 * SAP EWM is embedded in SAP S/4HANA (on-premise and private cloud).  All
 * resources are exposed as OData v2 services under the path convention:
 *   https://<tenant>/sap/opu/odata/sap/<SERVICE_NAME>/<EntitySet>
 *
 * Auth: OAuth 2.0 client-credentials grant.
 *   Token URL: https://<tenant>/sap/bc/sec/oauth2/token
 *
 * Supported resources:
 *   - Products      (API_PRODUCT_SRV → A_Product)
 *   - StockLevels   (WAREHOUSEAVAILABLESTOCK_0001 → WarehouseAvailableStock)
 *   - Locations     (storage bins derived from stock data)
 *   - Suppliers     (API_BUSINESS_PARTNER → A_Supplier)
 *   - PurchaseOrders(WAREHOUSEINBOUNDDELIVERY_0001 → WhseInboundDeliveryHead)
 *   - StockTransfers(API_WAREHOUSE_ORDER_TASK_2 → WarehouseTask)
 *   - StockAdjust.  (API_WHSE_PHYSINVTRYITEM_2 → WhsePhysInventoryItem)
 *
 * Schema-firewall: no product images, no supplier banking, no BOM / work
 * orders, no customer order data, no manufacturing cost methods.
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
import type { WebhookEvent } from '../../schema/webhook'

import {
  credentialFields as sapEwmCredentialFields,
  exchangeCredentials as sapEwmExchangeCredentials,
  refreshCredentials as sapEwmRefreshCredentials,
  getAuthUrl,
} from './auth'
import {SapEwmClient} from './client'
import {SERVICES, DEFAULT_PAGE_SIZE} from './constants'
import {verifySapEwmWebhook, parseSapEwmWebhookEvents} from './webhook'

import {transformProduct, type RawSapEwmProduct} from './transform/product'
import {transformStockLevel, type RawSapEwmStockLevel} from './transform/stock-level'
import {transformLocation, type RawSapEwmStorageBin} from './transform/location'
import {transformSupplier, type RawSapEwmSupplier} from './transform/supplier'
import {
  transformPurchaseOrder,
  type RawSapEwmInboundDelivery,
} from './transform/purchase-order'
import {
  transformStockTransfer,
  type RawSapEwmWarehouseTask,
} from './transform/stock-transfer'
import {
  transformStockAdjustment,
  type RawSapEwmPhysInvItem,
} from './transform/stock-adjustment'

export interface SapEwmAdapterConfig {
  /** No static config needed; all connection params come from credentials. */
  defaultPageSize?: number
}

export class SapEwmAdapter implements InventoryAdapter {
  readonly platform = 'sap-ewm'
  readonly version = '0.1.0'

  private readonly pageSize: number

  constructor(config: SapEwmAdapterConfig = {}) {
    this.pageSize = config.defaultPageSize ?? DEFAULT_PAGE_SIZE
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  credentialFields(): CredentialField[] {
    return sapEwmCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return sapEwmExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrl(_state, _scopes)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('sap-ewm uses OAuth2 client-credentials; use exchangeCredentials() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return sapEwmRefreshCredentials(credentials)
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifySapEwmWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseSapEwmWebhookEvents(payload)
  }

  // ── Internal helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): SapEwmClient {
    return new SapEwmClient(credentials)
  }

  /** Build $top / $skip OData pagination params. */
  private odataPage(params: QueryParams): Record<string, unknown> {
    const top = params.limit ?? this.pageSize
    const skip = params.page != null ? (params.page - 1) * top : undefined
    return { $top: top, ...(skip != null ? { $skip: skip } : {}) }
  }

  // ── Products ───────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const client = this.client(credentials)
    const items = await client.getCollection<RawSapEwmProduct>(
      SERVICES.PRODUCT_MASTER,
      'A_Product',
      {
        ...this.odataPage(params),
        $select: [
          'Product',
          'ProductType',
          'BaseUnit',
          'GrossWeight',
          'WeightUnit',
          'Length',
          'Width',
          'Height',
          'SizeUnit',
          'MaterialGroup',
          'Division',
          'CrossPlantStatus',
          'DeletionIndicator',
          'CreationDate',
          'LastChangeDate',
        ].join(','),
        $expand: 'to_Description',
      },
    )
    return items.map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const client = this.client(credentials)
    const raw = await client.getEntity<RawSapEwmProduct>(
      SERVICES.PRODUCT_MASTER,
      'A_Product',
      `('${encodeURIComponent(id)}')`,
      { $expand: 'to_Description' },
    )
    return transformProduct(raw)
  }

  // ── Stock Levels ───────────────────────────────────────────────────────────

  async listStockLevels(credentials: Credentials, params: QueryParams): Promise<StockLevel[]> {
    const client = this.client(credentials)
    const items = await client.getCollection<RawSapEwmStockLevel>(
      SERVICES.AVAILABLE_STOCK,
      'WarehouseAvailableStock',
      this.odataPage(params),
    )
    return items.map(transformStockLevel)
  }

  async getStockLevel(_credentials: Credentials, id: string): Promise<StockLevel> {
    // SAP EWM available stock is only accessible as a bulk collection;
    // individual bin records can be retrieved via compound key but require
    // all key fields (warehouse + storageType + storageBin + product + batch…).
    // Callers should use listStockLevels with $filter instead.
    throw new Error(
      `sap-ewm: stock-level is bulk-only; use listStockLevels with $filter. id=${id}`,
    )
  }

  // ── Locations ──────────────────────────────────────────────────────────────
  //
  // SAP EWM does not have a dedicated "list storage bins" OData endpoint in the
  // standard released APIs.  We derive unique location records from the
  // WarehouseAvailableStock entity (which always carries EWMWarehouse /
  // EWMStorageType / EWMStorageBin) and de-duplicate by composite key.

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const client = this.client(credentials)
    const stockItems = await client.getCollection<RawSapEwmStockLevel>(
      SERVICES.AVAILABLE_STOCK,
      'WarehouseAvailableStock',
      {
        ...this.odataPage(params),
        $select: 'EWMWarehouse,EWMStorageType,EWMStorageBin',
      },
    )

    // De-duplicate bins
    const seen = new Set<string>()
    const locations: Location[] = []
    for (const item of stockItems) {
      if (!item.EWMStorageBin) continue
      const key = `${item.EWMWarehouse}:${item.EWMStorageType ?? ''}:${item.EWMStorageBin}`
      if (seen.has(key)) continue
      seen.add(key)
      locations.push(
        transformLocation(item as unknown as RawSapEwmStorageBin),
      )
    }
    return locations
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    // id is expected to be "<EWMWarehouse>:<EWMStorageType>:<EWMStorageBin>"
    const parts = id.split(':')
    if (parts.length < 3) {
      throw new Error(`sap-ewm: location id must be "<warehouse>:<storageType>:<bin>", got "${id}"`)
    }
    const [warehouse, storageType, bin] = parts as [string, string, string]
    const client = this.client(credentials)
    const items = await client.getCollection<RawSapEwmStockLevel>(
      SERVICES.AVAILABLE_STOCK,
      'WarehouseAvailableStock',
      {
        $top: 1,
        $select: 'EWMWarehouse,EWMStorageType,EWMStorageBin',
        $filter: `EWMWarehouse eq '${warehouse}' and EWMStorageType eq '${storageType}' and EWMStorageBin eq '${bin}'`,
      },
    )
    if (!items.length) throw new Error(`sap-ewm: location ${id} not found`)
    return transformLocation(items[0] as unknown as RawSapEwmStorageBin)
  }

  // ── Suppliers ──────────────────────────────────────────────────────────────

  async listSuppliers(credentials: Credentials, params: QueryParams): Promise<Supplier[]> {
    const client = this.client(credentials)
    const items = await client.getCollection<RawSapEwmSupplier>(
      SERVICES.BUSINESS_PARTNER,
      'A_Supplier',
      {
        ...this.odataPage(params),
        $select: [
          'Supplier',
          'PurchasingOrganization',
          'SupplierAccountGroup',
          'PaymentTerms',
          'PurchaseOrderCurrency',
          'PlannedDeliveryDurationInDays',
          'IsMarkedForDeletion',
        ].join(','),
        // to_BusinessPartner carries BP name, phone, country — NOT to_SupplierCompany
        // (to_SupplierCompany holds per-company-code financials, not the supplier name)
        $expand: 'to_BusinessPartner',
      },
    )
    return items.map(transformSupplier)
  }

  async getSupplier(credentials: Credentials, id: string): Promise<Supplier> {
    const client = this.client(credentials)
    const raw = await client.getEntity<RawSapEwmSupplier>(
      SERVICES.BUSINESS_PARTNER,
      'A_Supplier',
      `('${encodeURIComponent(id)}')`,
      { $expand: 'to_BusinessPartner' },
    )
    return transformSupplier(raw)
  }

  // ── Purchase Orders (Inbound Deliveries) ───────────────────────────────────

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = this.client(credentials)
    const items = await client.getCollection<RawSapEwmInboundDelivery>(
      SERVICES.INBOUND_DELIVERY,
      'WhseInboundDeliveryHead',
      {
        ...this.odataPage(params),
        $expand: 'to_WhseInbDeliveryItem',
      },
    )
    return items.map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = this.client(credentials)
    const raw = await client.getEntity<RawSapEwmInboundDelivery>(
      SERVICES.INBOUND_DELIVERY,
      'WhseInboundDeliveryHead',
      `(InboundDelivery='${encodeURIComponent(id)}')`,
      { $expand: 'to_WhseInbDeliveryItem' },
    )
    return transformPurchaseOrder(raw)
  }

  // ── Stock Transfers (Warehouse Tasks) ──────────────────────────────────────

  async listStockTransfers(credentials: Credentials, params: QueryParams): Promise<StockTransfer[]> {
    const client = this.client(credentials)
    const items = await client.getCollection<RawSapEwmWarehouseTask>(
      SERVICES.WAREHOUSE_ORDER,
      'WarehouseTask',
      this.odataPage(params),
    )
    return items.map(transformStockTransfer)
  }

  async getStockTransfer(credentials: Credentials, id: string): Promise<StockTransfer> {
    // id = "<WarehouseNumber>:<WarehouseOrder>:<WarehouseTask>"
    const parts = id.split(':')
    if (parts.length < 3) {
      throw new Error(`sap-ewm: stock-transfer id must be "<warehouse>:<order>:<task>", got "${id}"`)
    }
    const [warehouseNumber, warehouseOrder, warehouseTask] = parts as [string, string, string]
    const client = this.client(credentials)
    const raw = await client.getEntity<RawSapEwmWarehouseTask>(
      SERVICES.WAREHOUSE_ORDER,
      'WarehouseTask',
      `(WarehouseNumber='${warehouseNumber}',WarehouseOrder='${warehouseOrder}',WarehouseTask='${warehouseTask}')`,
    )
    return transformStockTransfer(raw)
  }

  // ── Stock Adjustments (Physical Inventory) ─────────────────────────────────

  async listStockAdjustments(credentials: Credentials, params: QueryParams): Promise<StockAdjustment[]> {
    const client = this.client(credentials)
    const items = await client.getCollection<RawSapEwmPhysInvItem>(
      SERVICES.PHYSICAL_INVENTORY,
      'WhsePhysInventoryItem',
      this.odataPage(params),
    )
    return items.map(transformStockAdjustment)
  }

  async getStockAdjustment(credentials: Credentials, id: string): Promise<StockAdjustment> {
    // id = "<PhysicalInventoryDocument>:<FiscalYear>:<PhysicalInventoryItem>"
    const parts = id.split(':')
    if (parts.length < 3) {
      throw new Error(
        `sap-ewm: stock-adjustment id must be "<doc>:<fiscalYear>:<item>", got "${id}"`,
      )
    }
    const [doc, fy, item] = parts as [string, string, string]
    const client = this.client(credentials)
    const raw = await client.getEntity<RawSapEwmPhysInvItem>(
      SERVICES.PHYSICAL_INVENTORY,
      'WhsePhysInventoryItem',
      `(PhysicalInventoryDocument='${doc}',FiscalYear='${fy}',PhysicalInventoryItem='${item}')`,
    )
    return transformStockAdjustment(raw)
  }
}
