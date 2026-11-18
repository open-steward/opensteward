export type { Credentials, QueryParams } from '@opensteward/shared'
import type { Credentials, QueryParams, BaseAdapter } from '@opensteward/shared'

import type { Product } from '../schema/product'
import type { StockLevel } from '../schema/stock-level'
import type { Location } from '../schema/location'
import type { Supplier } from '../schema/supplier'
import type { PurchaseOrder } from '../schema/purchase-order'
import type { StockTransfer } from '../schema/stock-transfer'
import type { StockAdjustment } from '../schema/stock-adjustment'
import type { WebhookEvent } from '../schema/webhook'

/**
 * InventoryAdapter — extends BaseAdapter with stock-of-record methods.
 *
 * Read-only B2B. Schema-firewall: no product images, no supplier banking,
 * no manufacturing BOM / work orders, no customer order data, no cost-method
 * details.
 */
export interface InventoryAdapter extends BaseAdapter {
  parseWebhookEvents?(payload: Record<string, unknown>): WebhookEvent[]

  // ── Products ─────────────────────────────────────────────────────────────
  listProducts?(credentials: Credentials, params: QueryParams): Promise<Product[]>
  getProduct?(credentials: Credentials, id: string): Promise<Product>

  // ── StockLevels (scoped to a product OR a location) ──────────────────────
  listStockLevels?(credentials: Credentials, params: QueryParams): Promise<StockLevel[]>
  getStockLevel?(credentials: Credentials, id: string): Promise<StockLevel>

  // ── Locations ────────────────────────────────────────────────────────────
  listLocations?(credentials: Credentials, params: QueryParams): Promise<Location[]>
  getLocation?(credentials: Credentials, id: string): Promise<Location>

  // ── Suppliers ────────────────────────────────────────────────────────────
  listSuppliers?(credentials: Credentials, params: QueryParams): Promise<Supplier[]>
  getSupplier?(credentials: Credentials, id: string): Promise<Supplier>

  // ── PurchaseOrders ───────────────────────────────────────────────────────
  listPurchaseOrders?(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]>
  getPurchaseOrder?(credentials: Credentials, id: string): Promise<PurchaseOrder>

  // ── StockTransfers ───────────────────────────────────────────────────────
  listStockTransfers?(credentials: Credentials, params: QueryParams): Promise<StockTransfer[]>
  getStockTransfer?(credentials: Credentials, id: string): Promise<StockTransfer>

  // ── StockAdjustments ─────────────────────────────────────────────────────
  listStockAdjustments?(credentials: Credentials, params: QueryParams): Promise<StockAdjustment[]>
  getStockAdjustment?(credentials: Credentials, id: string): Promise<StockAdjustment>
}
