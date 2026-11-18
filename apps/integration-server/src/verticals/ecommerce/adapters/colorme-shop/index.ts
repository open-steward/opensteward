/**
 * ColorMe Shop (カラーミーショップ) adapter for the ecommerce vertical.
 *
 * Maps the ColorMe Shop v1 REST API (https://api.shop-pro.jp/v1/spec/open_api.json)
 * to the canonical ecommerce resources. Global OAuth host, one Connect app
 * for every shop — see auth.ts for the exact documented flow.
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import { reportUpstreamPage } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product, ProductVariant } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { Discount } from '../../schema/discount'

import { buildAuthUrl, exchangeCode as colormeExchangeCode } from './auth'
import { ColormeShopClient } from './client'
import { DEFAULT_SCOPES } from './constants'

import {
  transformProduct,
  untransformProduct,
  transformVariant,
  untransformVariant,
  splitVariantId,
  type RawColormeProduct,
  type RawColormeVariant,
} from './transform/product'
import { transformCollection, untransformCollection, type RawColormeGroup } from './transform/collection'
import { transformCustomer, untransformCustomer, type RawColormeCustomer } from './transform/customer'
import { transformOrder, untransformOrder, type RawColormeSale } from './transform/order'
import { transformDiscount, untransformDiscount, type RawColormeCoupon } from './transform/discount'

export interface ColormeShopAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

export class ColormeShopAdapter implements EcommerceAdapter {
  readonly platform = 'colorme-shop'
  readonly version = '0.1.0'

  /** products/stocks/variants cap at 50; sales/customers at 100 — see constants.ts. */
  readonly capabilities = { maxPageSize: 50 }

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: ColormeShopAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return colormeExchangeCode(code, redirectUri, this.clientId, this.clientSecret)
  }

  /** ColorMe access tokens never expire and no refresh token is issued (see auth.ts) — a true no-op. */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): ColormeShopClient {
    return new ColormeShopClient(credentials)
  }

  /** `page`/`limit` only — the sync worker never sends more. */
  private listParams(params: QueryParams): { page?: number; limit?: number } {
    return { page: params.page, limit: params.limit }
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).list<RawColormeProduct>(
      'products',
      'products',
      this.listParams(params),
    )
    return res.items.map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).get<{ product: RawColormeProduct }>(`products/${id}`)
    return transformProduct(res.product)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const res = await this.client(credentials).post<{ product: RawColormeProduct }>('products', {
      product: untransformProduct(data),
    })
    return transformProduct(res.product)
  }

  async updateProduct(credentials: Credentials, id: string, data: Partial<Product>): Promise<Product> {
    const res = await this.client(credentials).put<{ product: RawColormeProduct }>(`products/${id}`, {
      product: untransformProduct(data),
    })
    return transformProduct(res.product)
  }

  // ── Variants ──────────────────────────────────────────────────────────────
  //
  // Every variant endpoint is scoped under its parent product
  // (`/products/{product_id}/variants/...`), so the canonical variant id is
  // the composite `${productId}:${variantId}` — see transform/product.ts.

  async listVariants(credentials: Credentials, params: QueryParams): Promise<ProductVariant[]> {
    const productId = params['productId'] ?? params['product_id']
    const client = this.client(credentials)
    if (productId) {
      const res = await client.list<RawColormeVariant>(
        `products/${String(productId)}/variants`,
        'variants',
        this.listParams(params),
      )
      return res.items.map((v) => transformVariant(v))
    }
    // No store-wide variants list is documented — flatten from a page of
    // products, whose embedded `variants[]` carry the same shape.
    //
    // The page's end is the products' end, not how many variants it held: a
    // product without options has none. This adapter declares `maxPageSize`,
    // so an unreported page of 50 products with 10 variants would read to the
    // sync worker as the last page — it would stop there, vouch for it, and
    // remove every cached variant of the products it never asked for.
    const res = await client.list<RawColormeProduct>('products', 'products', this.listParams(params))
    reportUpstreamPage(params, { hasMore: res.hasMore })
    return res.items.flatMap((p) => (p.variants ?? []).map((v) => transformVariant(v, p.options)))
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    const { productId, variantId } = splitVariantId(id)
    const res = await this.client(credentials).get<{ variant: RawColormeVariant }>(
      `products/${productId}/variants/${variantId}`,
    )
    return transformVariant(res.variant)
  }

  async updateVariant(credentials: Credentials, id: string, data: Partial<ProductVariant>): Promise<ProductVariant> {
    const { productId, variantId } = splitVariantId(id)
    const res = await this.client(credentials).put<{ variant: RawColormeVariant }>(
      `products/${productId}/variants/${variantId}`,
      { variant: untransformVariant(data) },
    )
    return transformVariant(res.variant)
  }

  // ── Collections (→ groups; categories are not exposed — see transform/collection.ts) ──

  async listCollections(credentials: Credentials, params: QueryParams): Promise<Collection[]> {
    const res = await this.client(credentials).list<RawColormeGroup>('groups', 'groups', this.listParams(params))
    return res.items.map(transformCollection)
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const res = await this.client(credentials).get<{ group: RawColormeGroup }>(`groups/${id}`)
    return transformCollection(res.group)
  }

  async createCollection(credentials: Credentials, data: Partial<Collection>): Promise<Collection> {
    const res = await this.client(credentials).post<{ group: RawColormeGroup }>('groups', {
      group: untransformCollection(data),
    })
    return transformCollection(res.group)
  }

  async updateCollection(credentials: Credentials, id: string, data: Partial<Collection>): Promise<Collection> {
    const res = await this.client(credentials).put<{ group: RawColormeGroup }>(`groups/${id}`, {
      group: untransformCollection(data),
    })
    return transformCollection(res.group)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const res = await this.client(credentials).list<RawColormeCustomer>(
      'customers',
      'customers',
      this.listParams(params),
    )
    return res.items.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.client(credentials).get<{ customer: RawColormeCustomer }>(`customers/${id}`)
    return transformCustomer(res.customer)
  }

  async createCustomer(credentials: Credentials, data: Partial<Customer>): Promise<Customer> {
    const res = await this.client(credentials).post<{ customer: RawColormeCustomer }>('customers', {
      customer: untransformCustomer(data),
    })
    return transformCustomer(res.customer)
  }

  async updateCustomer(credentials: Credentials, id: string, data: Partial<Customer>): Promise<Customer> {
    const res = await this.client(credentials).put<{ customer: RawColormeCustomer }>(`customers/${id}`, {
      customer: untransformCustomer(data),
    })
    return transformCustomer(res.customer)
  }

  // ── Orders (→ sales) ──────────────────────────────────────────────────────
  //
  // createOrder is unavailable — see transform/order.ts header for why.

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const res = await this.client(credentials).list<RawColormeSale>('sales', 'sales', this.listParams(params))
    return res.items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const res = await this.client(credentials).get<{ sale: RawColormeSale }>(`sales/${id}`)
    return transformOrder(res.sale)
  }

  async updateOrder(credentials: Credentials, id: string, data: Partial<Order>): Promise<Order> {
    const res = await this.client(credentials).put<{ sale: RawColormeSale }>(`sales/${id}`, {
      sale: untransformOrder(data),
    })
    return transformOrder(res.sale)
  }

  async cancelOrder(credentials: Credentials, id: string): Promise<Order> {
    const res = await this.client(credentials).put<{ sale: RawColormeSale }>(`sales/${id}/cancel`)
    return transformOrder(res.sale)
  }

  // ── Discounts (→ shop_coupons) ────────────────────────────────────────────

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const res = await this.client(credentials).list<RawColormeCoupon>(
      'shop_coupons',
      'shop_coupons',
      this.listParams(params),
    )
    return res.items.map(transformDiscount)
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const res = await this.client(credentials).get<{ shop_coupon: RawColormeCoupon }>(`shop_coupons/${id}`)
    return transformDiscount(res.shop_coupon)
  }

  async createDiscount(credentials: Credentials, data: Partial<Discount>): Promise<Discount> {
    const res = await this.client(credentials).post<{ shop_coupon: RawColormeCoupon }>('shop_coupons', {
      shop_coupon: untransformDiscount(data),
    })
    return transformDiscount(res.shop_coupon)
  }

  async updateDiscount(credentials: Credentials, id: string, data: Partial<Discount>): Promise<Discount> {
    const res = await this.client(credentials).put<{ shop_coupon: RawColormeCoupon }>(`shop_coupons/${id}`, {
      shop_coupon: untransformDiscount(data),
    })
    return transformDiscount(res.shop_coupon)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`shop_coupons/${id}`)
  }
}
