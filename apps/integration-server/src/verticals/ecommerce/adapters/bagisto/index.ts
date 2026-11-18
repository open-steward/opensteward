import { simpleApiKey } from '@opensteward/shared'
/**
 * Bagisto adapter for the ecommerce vertical.
 *
 * Maps the Bagisto REST API (`/api/v1`) to the canonical ecommerce resources.
 * Bagisto is a self-hosted Laravel ecommerce framework that supports Bearer
 * token auth (OAuth2 password grant or personal access tokens). There is no
 * authorization-code flow — credentials are configured directly.
 *
 * Required credentials:
 *  - `accessToken` = Bearer token (PAT or OAuth2 password-grant token)
 *  - `extra.baseUrl` = full base URL of the Bagisto store
 *    (e.g. `https://mystore.example.com`)
 *  - `extra.clientId` = OAuth2 client ID (optional, for token refresh)
 *  - `extra.clientSecret` = OAuth2 client secret (optional, for token refresh)
 *
 * Implemented resources: products, variants (embedded in products), collections
 * (categories), orders, customers, fulfillments (shipments), and inventory levels.
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product, ProductVariant } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { Discount } from '../../schema/discount'
import type { InventoryLevel } from '../../schema/inventory'
import type { Location } from '../../schema/location'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { Fulfillment } from '../../schema/fulfillment'
import type { Refund } from '../../schema/refund'
import type { Transaction } from '../../schema/transaction'

import {
  getAuthUrl as bagistoGetAuthUrl,
  exchangeCode as bagistoExchangeCode,
  refreshCredentials as bagistoRefreshCredentials,
} from './auth'
import { BagistoClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import {
  transformProduct,
  transformProductVariant,
  untransformProduct,
  type BagistoProduct,
  type BagistoProductVariant,
} from './transform/product'
import { transformOrder, type BagistoOrder } from './transform/order'
import { transformCustomer, untransformCustomer, type BagistoCustomer } from './transform/customer'
import { transformFulfillment, type BagistoShipment } from './transform/fulfillment'
import { transformInventoryLevel, type BagistoInventory } from './transform/inventory'
import { transformCollection, untransformCollection, type BagistoCategory } from './transform/collection'
import { transformDiscount, untransformDiscount, type BagistoCartRule } from './transform/discount'
import { transformLocation, type BagistoInventorySource } from './transform/location'
import { transformRefund, type BagistoRefund } from './transform/refund'
import { transformTransaction, type BagistoInvoice } from './transform/transaction'

const SIMPLE_API_KEY_FORM = simpleApiKey()


export class BagistoAdapter implements EcommerceAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'bagisto'
  readonly version = '0.1.0'
  /** Honours `params.search`; see AdapterCapabilities. Declared so the
   *  router can refuse the parameter on adapters that would drop it. */
  readonly capabilities = { search: true }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    return bagistoGetAuthUrl(_state)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return bagistoExchangeCode(_code, _redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return bagistoRefreshCredentials(credentials)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): BagistoClient {
    return new BagistoClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    if (params.page != null) out['page'] = params.page
    if (params.search) out['name'] = params.search
    return out
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.clientFor(credentials).listWithPage<BagistoProduct>(
      '/products',
      this.listParams(params),
    )
    return res.items.map((p) => transformProduct(p))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const raw = await this.clientFor(credentials).getSingle<BagistoProduct>(`/products/${id}`)
    return transformProduct(raw)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const raw = await this.clientFor(credentials).post<BagistoProduct>(
      '/products',
      untransformProduct(data),
    )
    return transformProduct(raw)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const raw = await this.clientFor(credentials).put<BagistoProduct>(
      `/products/${id}`,
      untransformProduct(data),
    )
    return transformProduct(raw)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`/products/${id}`)
  }

  // ── Variants ──────────────────────────────────────────────────────────────
  //
  // Bagisto variants are embedded in the configurable product object.
  // We fetch the parent product and return its variants array.

  async listVariants(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<ProductVariant[]> {
    const productId = params['productId'] as string | undefined
    if (!productId) {
      throw new Error(
        'Bagisto requires ?productId= for listVariants; variants are nested under a parent product.',
      )
    }
    const raw = await this.clientFor(credentials).getSingle<BagistoProduct>(
      `/products/${productId}`,
    )
    return (raw.variants ?? []).map((v: BagistoProductVariant) =>
      transformProductVariant(v, productId),
    )
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    // id format: `productId:variantId`
    const [productId, variantId] = id.split(':')
    if (!productId || !variantId) {
      throw new Error('Invalid Bagisto variant id: expected `productId:variantId`')
    }
    const raw = await this.clientFor(credentials).getSingle<BagistoProduct>(
      `/products/${productId}`,
    )
    const variant = (raw.variants ?? []).find(
      (v: BagistoProductVariant) => String(v.id) === variantId,
    )
    if (!variant) {
      throw new Error(`Bagisto variant ${variantId} not found on product ${productId}`)
    }
    return transformProductVariant(variant, productId)
  }

  async updateVariant(
    credentials: Credentials,
    id: string,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const [productId, variantId] = id.split(':')
    if (!productId || !variantId) {
      throw new Error('Invalid Bagisto variant id: expected `productId:variantId`')
    }
    // Bagisto updates variants via the parent product endpoint.
    const body: Record<string, unknown> = {}
    if (data.price?.amount != null) body['price'] = data.price.amount.toFixed(2)
    if (data.sku) body['sku'] = data.sku

    const raw = await this.clientFor(credentials).put<BagistoProduct>(
      `/products/${productId}`,
      { variants: [{ id: Number(variantId), ...body }] },
    )
    const variant = (raw.variants ?? []).find(
      (v: BagistoProductVariant) => String(v.id) === variantId,
    )
    if (!variant) {
      throw new Error(`Bagisto variant ${variantId} not found on product ${productId}`)
    }
    return transformProductVariant(variant, productId)
  }

  // ── Collections (categories) ──────────────────────────────────────────────

  async listCollections(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Collection[]> {
    const res = await this.clientFor(credentials).listWithPage<BagistoCategory>(
      '/categories',
      this.listParams(params),
    )
    return res.items.map(transformCollection)
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const raw = await this.clientFor(credentials).getSingle<BagistoCategory>(
      `/categories/${id}`,
    )
    return transformCollection(raw)
  }

  async createCollection(
    credentials: Credentials,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const raw = await this.clientFor(credentials).post<BagistoCategory>(
      '/categories',
      untransformCollection(data),
    )
    return transformCollection(raw)
  }

  async updateCollection(
    credentials: Credentials,
    id: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const raw = await this.clientFor(credentials).put<BagistoCategory>(
      `/categories/${id}`,
      untransformCollection(data),
    )
    return transformCollection(raw)
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`/categories/${id}`)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const res = await this.clientFor(credentials).listWithPage<BagistoOrder>(
      '/orders',
      this.listParams(params),
    )
    return res.items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const raw = await this.clientFor(credentials).getSingle<BagistoOrder>(`/orders/${id}`)
    return transformOrder(raw)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Order> {
    // Bagisto cancel endpoint: POST /api/v1/orders/{id}/cancel
    const raw = await this.clientFor(credentials).post<BagistoOrder>(
      `/orders/${id}/cancel`,
    )
    return transformOrder(raw)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const res = await this.clientFor(credentials).listWithPage<BagistoCustomer>(
      '/customers',
      this.listParams(params),
    )
    return res.items.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const raw = await this.clientFor(credentials).getSingle<BagistoCustomer>(
      `/customers/${id}`,
    )
    return transformCustomer(raw)
  }

  async createCustomer(
    credentials: Credentials,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const raw = await this.clientFor(credentials).post<BagistoCustomer>(
      '/customers',
      untransformCustomer(data),
    )
    return transformCustomer(raw)
  }

  // ── Fulfillments (shipments) ──────────────────────────────────────────────

  async listFulfillments(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Fulfillment[]> {
    const res = await this.clientFor(credentials).listWithPage<BagistoShipment>(
      '/shipments',
      this.listParams(params),
    )
    return res.items.map(transformFulfillment)
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    const raw = await this.clientFor(credentials).getSingle<BagistoShipment>(
      `/shipments/${id}`,
    )
    return transformFulfillment(raw)
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const res = await this.clientFor(credentials).listWithPage<BagistoInventory>(
      '/inventories',
      this.listParams(params),
    )
    return res.items.map(transformInventoryLevel)
  }

  async getInventoryLevel(credentials: Credentials, id: string): Promise<InventoryLevel> {
    // id = `${productId}:default:${locationId}` or `${productId}:default:default`
    const inventoryId = id.split(':')[2] ?? id.split(':')[0] ?? id
    const raw = await this.clientFor(credentials).getSingle<BagistoInventory>(
      `/inventories/${inventoryId}`,
    )
    return transformInventoryLevel(raw)
  }

  // ── Locations (inventory sources) ─────────────────────────────────────────

  async listLocations(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Location[]> {
    const res = await this.clientFor(credentials).listWithPage<BagistoInventorySource>(
      '/inventory-sources',
      this.listParams(params),
    )
    return res.items.map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const raw = await this.clientFor(credentials).getSingle<BagistoInventorySource>(
      `/inventory-sources/${id}`,
    )
    return transformLocation(raw)
  }

  // ── Discounts (cart rules) ────────────────────────────────────────────────

  async listDiscounts(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Discount[]> {
    const res = await this.clientFor(credentials).listWithPage<BagistoCartRule>(
      '/cart-rules',
      this.listParams(params),
    )
    return res.items.map(transformDiscount)
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const raw = await this.clientFor(credentials).getSingle<BagistoCartRule>(
      `/cart-rules/${id}`,
    )
    return transformDiscount(raw)
  }

  async createDiscount(
    credentials: Credentials,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const raw = await this.clientFor(credentials).post<BagistoCartRule>(
      '/cart-rules',
      untransformDiscount(data),
    )
    return transformDiscount(raw)
  }

  async updateDiscount(
    credentials: Credentials,
    id: string,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const raw = await this.clientFor(credentials).put<BagistoCartRule>(
      `/cart-rules/${id}`,
      untransformDiscount(data),
    )
    return transformDiscount(raw)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`/cart-rules/${id}`)
  }

  // ── Refunds ───────────────────────────────────────────────────────────────

  async listRefunds(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Refund[]> {
    const res = await this.clientFor(credentials).listWithPage<BagistoRefund>(
      '/refunds',
      this.listParams(params),
    )
    return res.items.map((r) => transformRefund(r))
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const raw = await this.clientFor(credentials).getSingle<BagistoRefund>(`/refunds/${id}`)
    return transformRefund(raw)
  }

  async createRefund(
    credentials: Credentials,
    data: Partial<Refund>,
  ): Promise<Refund> {
    if (!data.orderId) throw new Error('Bagisto createRefund requires orderId')
    const raw = await this.clientFor(credentials).post<BagistoRefund>(
      `/orders/${data.orderId}/refunds`,
      data,
    )
    return transformRefund(raw, data.orderId)
  }

  // ── Transactions (invoices) ───────────────────────────────────────────────

  async listTransactions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Transaction[]> {
    const res = await this.clientFor(credentials).listWithPage<BagistoInvoice>(
      '/invoices',
      this.listParams(params),
    )
    return res.items.map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const raw = await this.clientFor(credentials).getSingle<BagistoInvoice>(`/invoices/${id}`)
    return transformTransaction(raw)
  }
}
