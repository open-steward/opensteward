export type { Credentials, QueryParams } from '@opensteward/shared'
import type { Credentials, QueryParams, BaseAdapter } from '@opensteward/shared'

import type { Product, ProductVariant } from '../schema/product'
import type { Collection } from '../schema/collection'
import type { Location } from '../schema/location'
import type { InventoryLevel } from '../schema/inventory'
import type { Customer } from '../schema/customer'
import type { Order } from '../schema/order'
import type { Fulfillment } from '../schema/fulfillment'
import type { Refund } from '../schema/refund'
import type { Transaction } from '../schema/transaction'
import type { Discount } from '../schema/discount'
import type { WebhookEvent } from '../schema/webhook'

/**
 * EcommerceAdapter — extends BaseAdapter with ecommerce-specific resource methods.
 *
 * Auth and webhook methods are inherited from BaseAdapter. All resource methods
 * are optional so platform adapters can stub whatever their platform doesn't
 * support (the registry returns 501 for missing methods automatically).
 *
 * Reference implementation: `src/adapters/shopify/`.
 */
export interface EcommerceAdapter extends BaseAdapter {
  // Webhooks (refined return type)
  parseWebhookEvents?(payload: Record<string, unknown>): WebhookEvent[]

  // ── Products ───────────────────────────────────────────────────────────────
  listProducts?(credentials: Credentials, params: QueryParams): Promise<Product[]>
  getProduct?(credentials: Credentials, id: string): Promise<Product>
  createProduct?(credentials: Credentials, data: Partial<Product>): Promise<Product>
  updateProduct?(credentials: Credentials, id: string, data: Partial<Product>): Promise<Product>
  deleteProduct?(credentials: Credentials, id: string): Promise<void>

  // ── Variants ───────────────────────────────────────────────────────────────
  listVariants?(credentials: Credentials, params: QueryParams): Promise<ProductVariant[]>
  getVariant?(credentials: Credentials, id: string): Promise<ProductVariant>
  createVariant?(credentials: Credentials, data: Partial<ProductVariant>): Promise<ProductVariant>
  updateVariant?(credentials: Credentials, id: string, data: Partial<ProductVariant>): Promise<ProductVariant>
  deleteVariant?(credentials: Credentials, id: string): Promise<void>

  // ── Collections ────────────────────────────────────────────────────────────
  listCollections?(credentials: Credentials, params: QueryParams): Promise<Collection[]>
  getCollection?(credentials: Credentials, id: string): Promise<Collection>
  createCollection?(credentials: Credentials, data: Partial<Collection>): Promise<Collection>
  updateCollection?(credentials: Credentials, id: string, data: Partial<Collection>): Promise<Collection>
  deleteCollection?(credentials: Credentials, id: string): Promise<void>

  // ── Locations ──────────────────────────────────────────────────────────────
  listLocations?(credentials: Credentials, params: QueryParams): Promise<Location[]>
  getLocation?(credentials: Credentials, id: string): Promise<Location>

  // ── Inventory ──────────────────────────────────────────────────────────────
  listInventoryLevels?(credentials: Credentials, params: QueryParams): Promise<InventoryLevel[]>
  getInventoryLevel?(credentials: Credentials, id: string): Promise<InventoryLevel>
  /** Apply a delta (e.g. +5, -2) to available stock at a location. */
  adjustInventoryLevel?(
    credentials: Credentials,
    data: { variantId: string; locationId: string; delta: number },
  ): Promise<InventoryLevel>
  /** Overwrite available stock with an absolute value. */
  setInventoryLevel?(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel>

  // ── Customers ──────────────────────────────────────────────────────────────
  listCustomers?(credentials: Credentials, params: QueryParams): Promise<Customer[]>
  getCustomer?(credentials: Credentials, id: string): Promise<Customer>
  createCustomer?(credentials: Credentials, data: Partial<Customer>): Promise<Customer>
  updateCustomer?(credentials: Credentials, id: string, data: Partial<Customer>): Promise<Customer>
  deleteCustomer?(credentials: Credentials, id: string): Promise<void>

  // ── Orders ─────────────────────────────────────────────────────────────────
  listOrders?(credentials: Credentials, params: QueryParams): Promise<Order[]>
  getOrder?(credentials: Credentials, id: string): Promise<Order>
  createOrder?(credentials: Credentials, data: Partial<Order>): Promise<Order>
  updateOrder?(credentials: Credentials, id: string, data: Partial<Order>): Promise<Order>
  /** Cancel an order (orders are historical — no `delete`). */
  cancelOrder?(credentials: Credentials, id: string, data?: { reason?: string }): Promise<Order>

  // ── Fulfillments ──────────────────────────────────────────────────────────
  listFulfillments?(credentials: Credentials, params: QueryParams): Promise<Fulfillment[]>
  getFulfillment?(credentials: Credentials, id: string): Promise<Fulfillment>
  createFulfillment?(credentials: Credentials, data: Partial<Fulfillment>): Promise<Fulfillment>
  updateFulfillment?(credentials: Credentials, id: string, data: Partial<Fulfillment>): Promise<Fulfillment>
  cancelFulfillment?(credentials: Credentials, id: string): Promise<Fulfillment>

  // ── Refunds ────────────────────────────────────────────────────────────────
  listRefunds?(credentials: Credentials, params: QueryParams): Promise<Refund[]>
  getRefund?(credentials: Credentials, id: string): Promise<Refund>
  createRefund?(credentials: Credentials, data: Partial<Refund>): Promise<Refund>

  // ── Transactions ───────────────────────────────────────────────────────────
  listTransactions?(credentials: Credentials, params: QueryParams): Promise<Transaction[]>
  getTransaction?(credentials: Credentials, id: string): Promise<Transaction>
  createTransaction?(credentials: Credentials, data: Partial<Transaction>): Promise<Transaction>

  // ── Discounts ──────────────────────────────────────────────────────────────
  listDiscounts?(credentials: Credentials, params: QueryParams): Promise<Discount[]>
  getDiscount?(credentials: Credentials, id: string): Promise<Discount>
  createDiscount?(credentials: Credentials, data: Partial<Discount>): Promise<Discount>
  updateDiscount?(credentials: Credentials, id: string, data: Partial<Discount>): Promise<Discount>
  deleteDiscount?(credentials: Credentials, id: string): Promise<void>
}
