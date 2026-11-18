/**
 * EverShop adapter for the ecommerce vertical.
 *
 * EverShop is a self-hosted Node.js ecommerce platform with a REST API.
 * Authentication is via short-lived JWTs obtained by POSTing admin
 * email + password to `POST /api/user/tokens`.
 *
 * Supported resources: Products, Categories (Collections), Customers,
 * Orders, Fulfillments (shipments), Discounts (coupons).
 *
 * Docs: https://evershop.io/docs/api/overview
 */

// ── Resource coverage ──────────────────────────────────────────────────────────
// Unavailable: inventory    — EverShop has no inventory-level REST API; stock is
//                             an inline field (qty/manage_stock) on the product
//                             resource, not a separate addressable resource.
// Unavailable: location     — EverShop has no warehouse/location concept or REST
//                             API; the platform is single-location by design.
// Unavailable: refund       — EverShop has no refund REST API; the only
//                             post-payment operation is setting payment_status to
//                             "refunded" on the order.
// Unavailable: transaction  — EverShop has no transaction REST API; payment data
//                             is limited to payment_method and payment_status
//                             fields on the order object.

import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product, ProductVariant } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { Fulfillment } from '../../schema/fulfillment'
import type { Discount } from '../../schema/discount'

import { buildAuthUrl, refreshAdminToken } from './auth'
import { EverShopClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import {
  transformProduct,
  untransformProduct,
  type RawEverShopProduct,
} from './transform/product'
import {
  transformCollection,
  untransformCollection,
  type RawEverShopCategory,
} from './transform/collection'
import {
  transformCustomer,
  untransformCustomer,
  type RawEverShopCustomer,
} from './transform/customer'
import {
  transformOrder,
  type RawEverShopOrder,
} from './transform/order'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawEverShopShipment,
} from './transform/fulfillment'
import {
  transformDiscount,
  untransformDiscount,
  type RawEverShopCoupon,
} from './transform/discount'

export interface EverShopAdapterConfig {
  /**
   * Root URL of the EverShop installation, e.g. `https://shop.example.com`.
   * Must NOT include a trailing slash or the `/api` segment.
   */
  baseUrl: string
}

export class EvershopAdapter implements EcommerceAdapter {
  readonly platform = 'evershop'
  readonly version = '0.1.0'

  private baseUrl: string

  constructor(config: EverShopAdapterConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '')
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  /**
   * Returns the store's admin login page — EverShop is self-hosted and has
   * no hosted OAuth authorization URL.
   */
  getAuthUrl(_state: string): string {
    return buildAuthUrl(this.baseUrl)
  }

  /**
   * EverShop does not use OAuth code exchange. Throws with instructions so
   * callers fail loudly.
   */
  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error(
      'EverShop does not use OAuth code exchange. ' +
        'Supply credentials via POST /v1/connections with body ' +
        '`{ platform: "evershop", credentials: { baseUrl, email, password } }` — ' +
        'the adapter calls POST /api/user/tokens to obtain a JWT.',
    )
  }

  /**
   * EverShop JWTs expire after 15 minutes by default. Exchange the stored
   * refresh token for a new access token transparently.
   */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshAdminToken(credentials)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): EverShopClient {
    // Inject the configured baseUrl if the caller did not embed it in
    // credentials.extra (e.g. during the initial token fetch).
    const credBaseUrl = credentials.extra?.['baseUrl'] as string | undefined
    if (!credBaseUrl) {
      return new EverShopClient({
        ...credentials,
        extra: { ...credentials.extra, baseUrl: this.baseUrl },
      })
    }
    return new EverShopClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    const page = params['page'] ?? params['cursor']
    if (page) out['page'] = page
    if (params.updatedAfter) {
      out['updated_at_min'] = params.updatedAfter.toISOString()
    }
    return out
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).listWithPage<RawEverShopProduct>(
      '/products',
      this.listParams(params),
    )
    return res.items.map((p) => transformProduct(p))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const raw = await this.client(credentials).get<RawEverShopProduct>(`/products/${id}`)
    return transformProduct(raw)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const raw = await this.client(credentials).post<RawEverShopProduct>(
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
    const raw = await this.client(credentials).patch<RawEverShopProduct>(
      `/products/${id}`,
      untransformProduct(data),
    )
    return transformProduct(raw)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).deleteReturning<RawEverShopProduct>(`/products/${id}`)
  }

  // ── Variants ──────────────────────────────────────────────────────────────
  // EverShop manages variants via variant groups; there is no standalone
  // list-variants endpoint. Return the inline variants from the parent product.

  async listVariants(credentials: Credentials, params: QueryParams): Promise<ProductVariant[]> {
    const productId = (params['productId'] ?? params['product_id']) as string | undefined
    if (!productId) {
      throw new Error('EverShop listVariants requires `productId` in query params')
    }
    const product = await this.getProduct(credentials, productId)
    return product.variants ?? []
  }

  // ── Collections (Categories) ──────────────────────────────────────────────

  async listCollections(credentials: Credentials, params: QueryParams): Promise<Collection[]> {
    const res = await this.client(credentials).listWithPage<RawEverShopCategory>(
      '/categories',
      this.listParams(params),
    )
    return res.items.map(transformCollection)
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const raw = await this.client(credentials).get<RawEverShopCategory>(`/categories/${id}`)
    return transformCollection(raw)
  }

  async createCollection(
    credentials: Credentials,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const raw = await this.client(credentials).post<RawEverShopCategory>(
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
    const raw = await this.client(credentials).patch<RawEverShopCategory>(
      `/categories/${id}`,
      untransformCollection(data),
    )
    return transformCollection(raw)
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).deleteReturning<RawEverShopCategory>(`/categories/${id}`)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const res = await this.client(credentials).listWithPage<RawEverShopCustomer>(
      '/customers',
      this.listParams(params),
    )
    return res.items.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const raw = await this.client(credentials).get<RawEverShopCustomer>(`/customers/${id}`)
    return transformCustomer(raw)
  }

  async createCustomer(credentials: Credentials, data: Partial<Customer>): Promise<Customer> {
    const raw = await this.client(credentials).post<RawEverShopCustomer>(
      '/customers',
      untransformCustomer(data),
    )
    return transformCustomer(raw)
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const raw = await this.client(credentials).patch<RawEverShopCustomer>(
      `/customers/${id}`,
      untransformCustomer(data),
    )
    return transformCustomer(raw)
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).deleteReturning<RawEverShopCustomer>(`/customers/${id}`)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const res = await this.client(credentials).listWithPage<RawEverShopOrder>(
      '/orders',
      this.listParams(params),
    )
    return res.items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const raw = await this.client(credentials).get<RawEverShopOrder>(`/orders/${id}`)
    return transformOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    // EverShop creates orders from carts; pass `cart_id` in data.metadata.
    const cartId = (data.metadata?.['cart_id'] ?? data.metadata?.['cartId']) as string | undefined
    if (!cartId) {
      throw new Error(
        'EverShop createOrder requires `cart_id` in data.metadata ' +
          '(EverShop creates orders from carts — supply the cart UUID)',
      )
    }
    const raw = await this.client(credentials).post<RawEverShopOrder>('/orders', {
      cart_id: cartId,
    })
    return transformOrder(raw)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Order> {
    // EverShop has no dedicated cancel endpoint. Set the payment_status to
    // 'cancelled' via PATCH on the order resource.
    await this.client(credentials).patch<unknown>(`/orders/${id}`, {
      payment_status: 'cancelled',
    })
    return this.getOrder(credentials, id)
  }

  // ── Fulfillments (Shipments) ──────────────────────────────────────────────

  async listFulfillments(credentials: Credentials, params: QueryParams): Promise<Fulfillment[]> {
    const orderId = (params['orderId'] ?? params['order_id']) as string | undefined
    if (!orderId) {
      throw new Error('EverShop listFulfillments requires `orderId` in query params')
    }
    const res = await this.client(credentials).listWithPage<RawEverShopShipment>(
      `/orders/${orderId}/shipments`,
      this.listParams(params),
    )
    return res.items.map((s) => transformFulfillment({ ...s, order_uuid: orderId }))
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    // Composite id format: `orderId:shipmentId`
    const [orderId, shipmentId] = id.split(':')
    if (!orderId || !shipmentId) {
      throw new Error('EverShop: fulfillment id must be in format `orderId:shipmentId`')
    }
    const raw = await this.client(credentials).get<RawEverShopShipment>(
      `/orders/${orderId}/shipments/${shipmentId}`,
    )
    return transformFulfillment({ ...raw, order_uuid: orderId })
  }

  async createFulfillment(
    credentials: Credentials,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    if (!data.orderId) throw new Error('EverShop createFulfillment requires orderId')
    const raw = await this.client(credentials).post<RawEverShopShipment>(
      `/orders/${data.orderId}/shipments`,
      untransformFulfillment(data),
    )
    return transformFulfillment({ ...raw, order_uuid: data.orderId })
  }

  async updateFulfillment(
    credentials: Credentials,
    id: string,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    const [orderId, shipmentId] = id.split(':')
    if (!orderId || !shipmentId) {
      throw new Error('EverShop: fulfillment id must be in format `orderId:shipmentId`')
    }
    const raw = await this.client(credentials).patch<RawEverShopShipment>(
      `/orders/${orderId}/shipments/${shipmentId}`,
      untransformFulfillment(data),
    )
    return transformFulfillment({ ...raw, order_uuid: orderId })
  }

  // ── Discounts (Coupons) ───────────────────────────────────────────────────

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const res = await this.client(credentials).listWithPage<RawEverShopCoupon>(
      '/coupons',
      this.listParams(params),
    )
    return res.items.map(transformDiscount)
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const raw = await this.client(credentials).get<RawEverShopCoupon>(`/coupons/${id}`)
    return transformDiscount(raw)
  }

  async createDiscount(credentials: Credentials, data: Partial<Discount>): Promise<Discount> {
    const raw = await this.client(credentials).post<RawEverShopCoupon>(
      '/coupons',
      untransformDiscount(data),
    )
    return transformDiscount(raw)
  }

  async updateDiscount(
    credentials: Credentials,
    id: string,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const raw = await this.client(credentials).patch<RawEverShopCoupon>(
      `/coupons/${id}`,
      untransformDiscount(data),
    )
    return transformDiscount(raw)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).deleteReturning<RawEverShopCoupon>(`/coupons/${id}`)
  }
}
