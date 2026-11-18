import { simpleApiKey } from '@opensteward/shared'
/**
 * Bagy adapter for the ecommerce vertical.
 *
 * Maps the Bagy REST API (`https://{api_address}/web_api`) to the canonical
 * ecommerce resources. Bagy uses OAuth 2.0 with the `access_token` passed as
 * a query parameter. The `api_address` (store URL) is returned during the
 * authorisation flow and stored in `credentials.extra.apiAddress`.
 *
 * Supported resources: products, variants, collections (categories), customers,
 * orders, discounts (coupons), inventory (via variant stock), locations
 * (synthetic — Bagy has no locations API).
 *
 * Unsupported (auto-501): fulfillments, refunds, transactions.
 *
 * Docs: https://developers.bagy.com.br/
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: fulfillment — Bagy has no dedicated fulfillment endpoint; fulfillment state is captured only via the order status field (enviado/entregue).
// Unavailable: refund — Bagy has no refunds endpoint; no refund resource exists in the documented API.
// Unverified:  transaction — /payments endpoint confirmed to exist in Bagy API but response field names are not accessible from public documentation (knowledge base requires authentication).

import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product, ProductVariant } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { Location } from '../../schema/location'
import type { InventoryLevel } from '../../schema/inventory'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { Discount } from '../../schema/discount'

import { buildAuthUrl, exchangeCode as bagyExchangeCode, refreshAccessToken } from './auth'
import { BagyClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import {
  transformProduct,
  untransformProduct,
  transformVariant,
  untransformVariant,
  type RawBagyProduct,
  type RawBagyVariant,
} from './transform/product'
import {
  transformCollection,
  untransformCollection,
  type RawBagyCategory,
} from './transform/collection'
import { syntheticDefaultLocation } from './transform/location'
import {
  transformInventoryLevel,
  type RawBagyVariantStock,
} from './transform/inventory'
import {
  transformCustomer,
  untransformCustomer,
  type RawBagyCustomer,
} from './transform/customer'
import {
  transformOrder,
  untransformOrder,
  type RawBagyOrder,
} from './transform/order'
import {
  transformDiscount,
  untransformDiscount,
  type RawBagyCoupon,
} from './transform/discount'

export interface BagyAdapterConfig {
  /** OAuth consumer key — optional (may come from per-connection credentials). */
  consumerKey?: string
  /** OAuth consumer secret — optional. */
  consumerSecret?: string
  /**
   * Store API address (domain), e.g. `www.mystore.com.br`.
   * Required when using constructor-level credentials. May be overridden per
   * connection via `credentials.extra.apiAddress`.
   */
  apiAddress?: string
}

const SIMPLE_API_KEY_FORM = simpleApiKey({
  label: 'Access token',
  helpText:
    'Generate your access token via the Bagy OAuth flow (POST /auth with your consumer key and secret).',
})

export class BagyAdapter implements EcommerceAdapter {
  // Connect Link support: accept a pre-issued access token directly.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'bagy'
  readonly version = '0.1.0'

  /** Bagy's `limit` tops out at 50; the router and the sync worker ask for no more. */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  private consumerKey: string | undefined
  private consumerSecret: string | undefined
  private apiAddress: string

  constructor(config: BagyAdapterConfig = {}) {
    this.consumerKey = config.consumerKey
    this.consumerSecret = config.consumerSecret
    this.apiAddress = config.apiAddress ?? ''
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // Return the Bagy OAuth authorise URL. Requires the domain + consumer key
    // to be configured at the adapter level.
    if (this.apiAddress && this.consumerKey) {
      return buildAuthUrl(this.apiAddress, this.consumerKey, '')
    }
    return `https://your-store.bagy.com.br/auth.php?response_type=code&consumer_key=YOUR_CONSUMER_KEY`
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    if (!this.consumerKey || !this.consumerSecret || !this.apiAddress) {
      throw new Error(
        'BagyAdapter.exchangeCode requires consumerKey, consumerSecret, and apiAddress ' +
          'to be set in the adapter config.',
      )
    }
    return bagyExchangeCode(this.apiAddress, code, this.consumerKey, this.consumerSecret)
  }

  /**
   * Bagy access tokens expire after ~24 hours. We use the stored `refreshToken`
   * to get a new `access_token` from `/auth?refresh_token=...`.
   */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    const refreshToken = credentials.refreshToken
    if (!refreshToken) return credentials

    const apiAddress =
      (credentials.extra?.['apiAddress'] as string | undefined) ?? this.apiAddress
    const consumerKey =
      (credentials.extra?.['consumerKey'] as string | undefined) ?? this.consumerKey ?? ''
    const consumerSecret =
      (credentials.extra?.['consumerSecret'] as string | undefined) ??
      this.consumerSecret ??
      ''

    if (!apiAddress) return credentials
    return refreshAccessToken(apiAddress, refreshToken, consumerKey, consumerSecret)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): BagyClient {
    const apiAddress =
      (credentials.extra?.['apiAddress'] as string | undefined) ?? this.apiAddress
    return new BagyClient(credentials, apiAddress)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      limit: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    }
    if (params['page'] != null) out['page'] = params['page']
    if (params.updatedAfter) out['modified_from'] = params.updatedAfter.toISOString()
    return out
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).listWithPage<RawBagyProduct>(
      'products',
      'Products',
      this.listParams(params),
    )
    return res.items.map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).get<{ Product: RawBagyProduct }>(
      `products/${id}`,
    )
    return transformProduct(res.Product)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const res = await this.client(credentials).post<{ Product: RawBagyProduct }>(
      'products',
      untransformProduct(data),
    )
    return transformProduct(res.Product)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const res = await this.client(credentials).put<{ Product: RawBagyProduct }>(
      `products/${id}`,
      untransformProduct(data),
    )
    return transformProduct(res.Product)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`products/${id}`)
  }

  // ── Variants ──────────────────────────────────────────────────────────────

  async listVariants(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<ProductVariant[]> {
    // Bagy's `/variants` endpoint lists all variants across products.
    // If a productId is given, filter the results client-side via product detail.
    const productId = (params['productId'] ?? params['product_id']) as string | undefined

    if (productId) {
      const res = await this.client(credentials).get<{ Product: RawBagyProduct }>(
        `products/${productId}`,
      )
      return (res.Product.Variant ?? []).map((v) => transformVariant(v, productId))
    }

    const res = await this.client(credentials).listWithPage<RawBagyVariant>(
      'variants',
      'Variants',
      this.listParams(params),
    )
    return res.items.map((v) => transformVariant(v))
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    const res = await this.client(credentials).get<{ Variant: RawBagyVariant }>(
      `variants/${id}`,
    )
    return transformVariant(res.Variant)
  }

  async updateVariant(
    credentials: Credentials,
    id: string,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const res = await this.client(credentials).put<{ Variant: RawBagyVariant }>(
      `variants/${id}`,
      untransformVariant(data),
    )
    return transformVariant(res.Variant)
  }

  // ── Collections (Categories) ──────────────────────────────────────────────

  async listCollections(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Collection[]> {
    const res = await this.client(credentials).listWithPage<RawBagyCategory>(
      'categories',
      'Categories',
      this.listParams(params),
    )
    return res.items.map(transformCollection)
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const res = await this.client(credentials).get<{ Category: RawBagyCategory }>(
      `categories/${id}`,
    )
    return transformCollection(res.Category)
  }

  async createCollection(
    credentials: Credentials,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const res = await this.client(credentials).post<{ Category: RawBagyCategory }>(
      'categories',
      untransformCollection(data),
    )
    return transformCollection(res.Category)
  }

  async updateCollection(
    credentials: Credentials,
    id: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const res = await this.client(credentials).put<{ Category: RawBagyCategory }>(
      `categories/${id}`,
      untransformCollection(data),
    )
    return transformCollection(res.Category)
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`categories/${id}`)
  }

  // ── Locations (synthetic) ─────────────────────────────────────────────────

  async listLocations(_credentials: Credentials, _params: QueryParams): Promise<Location[]> {
    return [syntheticDefaultLocation(this.apiAddress)]
  }

  async getLocation(_credentials: Credentials, id: string): Promise<Location> {
    if (id !== 'default') {
      throw new Error(`Bagy has no native locations; unknown location id '${id}'`)
    }
    return syntheticDefaultLocation(this.apiAddress)
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    // Bagy inventory is on variants. If a productId is given, fetch that
    // product's variants; otherwise page through the variants endpoint.
    const productId = (params['productId'] ?? params['product_id']) as string | undefined

    if (productId) {
      const res = await this.client(credentials).get<{ Product: RawBagyProduct }>(
        `products/${productId}`,
      )
      return (res.Product.Variant ?? []).map((v) =>
        transformInventoryLevel(v as unknown as RawBagyVariantStock, productId),
      )
    }

    const res = await this.client(credentials).listWithPage<RawBagyVariantStock>(
      'variants',
      'Variants',
      this.listParams(params),
    )
    return res.items.map((v) =>
      transformInventoryLevel(v, v.product_id != null ? String(v.product_id) : undefined),
    )
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    // Bagy updates stock via PUT /variants/{id} with a `stock` field.
    const updated = await this.client(credentials).put<{ Variant: RawBagyVariantStock }>(
      `variants/${data.variantId}`,
      { stock: data.available },
    )
    return transformInventoryLevel(updated.Variant)
  }

  async adjustInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; delta: number },
  ): Promise<InventoryLevel> {
    // Fetch current stock, then apply the delta.
    const current = await this.client(credentials).get<{ Variant: RawBagyVariantStock }>(
      `variants/${data.variantId}`,
    )
    const currentStock = Number(current.Variant.stock ?? 0)
    const newStock = Math.max(0, currentStock + data.delta)
    return this.setInventoryLevel(credentials, {
      variantId: data.variantId,
      locationId: data.locationId,
      available: newStock,
    })
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const res = await this.client(credentials).listWithPage<RawBagyCustomer>(
      'customers',
      'Customers',
      this.listParams(params),
    )
    return res.items.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.client(credentials).get<{ Customer: RawBagyCustomer }>(
      `customers/${id}`,
    )
    return transformCustomer(res.Customer)
  }

  async createCustomer(
    credentials: Credentials,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const res = await this.client(credentials).post<{ Customer: RawBagyCustomer }>(
      'customers',
      untransformCustomer(data),
    )
    return transformCustomer(res.Customer)
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const res = await this.client(credentials).put<{ Customer: RawBagyCustomer }>(
      `customers/${id}`,
      untransformCustomer(data),
    )
    return transformCustomer(res.Customer)
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`customers/${id}`)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const res = await this.client(credentials).listWithPage<RawBagyOrder>(
      'orders',
      'Orders',
      this.listParams(params),
    )
    return res.items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const res = await this.client(credentials).get<{ Order: RawBagyOrder }>(
      `orders/${id}`,
    )
    return transformOrder(res.Order)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const res = await this.client(credentials).post<{ Order: RawBagyOrder }>(
      'orders',
      untransformOrder(data),
    )
    return transformOrder(res.Order)
  }

  async updateOrder(
    credentials: Credentials,
    id: string,
    data: Partial<Order>,
  ): Promise<Order> {
    const res = await this.client(credentials).put<{ Order: RawBagyOrder }>(
      `orders/${id}`,
      untransformOrder(data),
    )
    return transformOrder(res.Order)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Order> {
    const res = await this.client(credentials).put<{ Order: RawBagyOrder }>(
      `orders/${id}/cancel`,
      {},
    )
    return transformOrder(res.Order)
  }

  // ── Discounts (Coupons) ───────────────────────────────────────────────────

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const res = await this.client(credentials).listWithPage<RawBagyCoupon>(
      'coupons',
      'Coupons',
      this.listParams(params),
    )
    return res.items.map(transformDiscount)
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const res = await this.client(credentials).get<{ Coupon: RawBagyCoupon }>(`coupons/${id}`)
    return transformDiscount(res.Coupon)
  }

  async createDiscount(
    credentials: Credentials,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const res = await this.client(credentials).post<{ Coupon: RawBagyCoupon }>(
      'coupons',
      untransformDiscount(data),
    )
    return transformDiscount(res.Coupon)
  }

  async updateDiscount(
    credentials: Credentials,
    id: string,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const res = await this.client(credentials).put<{ Coupon: RawBagyCoupon }>(
      `coupons/${id}`,
      untransformDiscount(data),
    )
    return transformDiscount(res.Coupon)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`coupons/${id}`)
  }
}
