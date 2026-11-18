/**
 * ePages Beyond adapter for the ecommerce vertical.
 *
 * Beyond is a one-host-per-shop commerce SaaS (https://developer.epages.com/beyond-docs,
 * reference at https://api-docs.beyondshop.cloud/). This adapter implements
 * the "custom app" flow: the merchant creates a custom app in their shop's
 * Beyond Cockpit and gets a client_id/client_secret scoped to that one shop
 * — no OAuth redirect, no ePages app review (see ./connect-form.ts /
 * ./auth.ts). `auth_type: oauth2_cc` (report to central metadata).
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented:
 *   Products:    list, get, create, update, delete
 *   Variants:    list, get, update           (creation is product-level only —
 *                POST /products with variationAttributes creates every
 *                variation atomically; there is no standalone create/delete)
 *   Customers:   list, get, create, update, delete
 *   Orders:      list, get, cancel            (Beyond has no general order
 *                update — every mutation is a specific sub-operation; create
 *                is cart-based and its request body is not documented on the
 *                public reference, so createOrder is not implemented)
 *   Fulfillments: list, get, create           (shipping processes)
 *   Discounts:   list, get, create, update, delete (coupon campaigns)
 *
 * Unavailable — see ./metadata.ts for the documented reason on each:
 *   collection, location, inventory, refund, transaction
 *
 * Inventory is deliberately NOT implemented even though
 * `GET /api/products/{id}/availability` and the relative
 * adjust-available-stock endpoint genuinely exist: Beyond has no
 * stock-location resource (see ./metadata.ts on `location`), and the
 * canonical `InventoryLevel.locationId` is required — reporting a synthetic
 * location id would point every level at a location `listLocations` (also
 * unimplemented) never returns.
 *
 * Webhooks: NOT implemented despite Beyond documenting a real HMAC-SHA1
 * scheme (`X-EPAGES-SIGNATURE` over `requestUri + ":" + requestBody`,
 * https://api-docs.beyondshop.cloud/ng-auth-auth-public-api.html#signers) —
 * this repo's `verifyWebhook(payload, headers, secret)` hook has no
 * request-URI parameter, and the signature cannot be reconstructed without
 * one. Implementing it would require guessing the exact registered
 * callback URI, which this rebuild is required not to do. See the
 * top-level rebuild report.
 *
 * Pagination: `page` (0-indexed) + `size`, confirmed HAL envelope
 * (`_embedded.<resource>`, `page: {size, totalElements, totalPages, number}`)
 * — `reportUpstreamPage` is called with the confirmed total on every list.
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import { reportUpstreamPage } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product, ProductVariant } from '../../schema/product'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { Fulfillment } from '../../schema/fulfillment'
import type { Discount } from '../../schema/discount'

import { CONNECT_FORM } from './connect-form'
import { refreshClientCredentials } from './auth'
import { EpagesClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import {
  transformProduct,
  untransformProduct,
  transformVariation,
  untransformVariation,
  type RawEpagesProduct,
  type RawEpagesVariation,
} from './transform/product'
import {
  transformCustomer,
  untransformCustomer,
  type RawEpagesCustomer,
} from './transform/customer'
import { transformOrder, type RawEpagesOrder } from './transform/order'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawEpagesShippingProcess,
} from './transform/fulfillment'
import {
  transformDiscount,
  untransformDiscount,
  type RawEpagesCouponCampaign,
} from './transform/discount'

export class EpagesAdapter implements EcommerceAdapter {
  readonly platform = 'epages'
  readonly version = '0.1.0'

  // Connect Link support — see ./connect-form.ts for the fields collected
  // and the shop-host confinement (`parseEpagesShop`) enforced before the
  // client secret is ever sent anywhere.
  credentialFields = CONNECT_FORM.credentialFields
  exchangeCredentials = CONNECT_FORM.exchangeCredentials

  // ── Auth ──────────────────────────────────────────────────────────────────
  // Beyond custom apps use OAuth2 client-credentials — there is no
  // authorization-code redirect for this adapter to build (mirrors
  // ../orocommerce/index.ts).

  getAuthUrl(): string {
    return 'https://cockpit.beyondshop.cloud/settings/apps'
  }

  exchangeCode(): Promise<Credentials> {
    return Promise.reject(
      new Error(
        'ePages Beyond uses OAuth2 client-credentials — no authorization code exchange. ' +
          'Create a custom app in the shop\'s Beyond Cockpit (Apps → Custom apps) and POST ' +
          'its credentials to /v1/connections with body `{platform: "epages", ' +
          'credentials: {shop, clientId, clientSecret}}`.',
      ),
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshClientCredentials(credentials)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): EpagesClient {
    return new EpagesClient(credentials)
  }

  /**
   * The sync worker calls list methods with a 1-indexed `page` (page 1 is
   * the first page); Beyond's own `page` query param is 0-indexed
   * (confirmed: `page: {number: 0, ...}` in every list response) — convert.
   */
  private pageParams(params: QueryParams): { page: number; size: number } {
    return { page: Math.max(0, (params.page ?? 1) - 1), size: params.limit ?? DEFAULT_PAGE_SIZE }
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).listPage<RawEpagesProduct>(
      'products',
      'products',
      this.pageParams(params),
    )
    reportUpstreamPage(params, { totalCount: res.totalElements, totalPages: res.totalPages })
    return res.items.map((p) => transformProduct(p))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const client = this.client(credentials)
    const product = await client.get<RawEpagesProduct>(`products/${id}`)
    const variations = await client.listPage<RawEpagesVariation>(
      `products/${id}/variations`,
      'variations',
      {},
    )
    return transformProduct(product, variations.items)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const res = await this.client(credentials).post<RawEpagesProduct>(
      'products',
      untransformProduct(data),
    )
    return transformProduct(res)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const res = await this.client(credentials).patch<RawEpagesProduct>(
      `products/${id}`,
      untransformProduct(data),
    )
    return transformProduct(res)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`products/${id}`)
  }

  // ── Variants ──────────────────────────────────────────────────────────────
  // Creation/deletion of a single variation has no documented endpoint —
  // see the module doc comment.

  async listVariants(credentials: Credentials, params: QueryParams): Promise<ProductVariant[]> {
    const productId = params['productId'] as string | undefined
    if (!productId) {
      throw new Error('ePages Beyond requires ?productId= for listVariants (nested resource).')
    }
    const client = this.client(credentials)
    const res = await client.listPage<RawEpagesVariation>(
      `products/${productId}/variations`,
      'variations',
      this.pageParams(params),
    )
    reportUpstreamPage(params, { totalCount: res.totalElements, totalPages: res.totalPages })
    return res.items.map((v) => transformVariation(v, productId))
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    const [productId, variationId] = id.split(':')
    if (!productId || !variationId) {
      throw new Error("ePages Beyond variant id must be formatted as 'productId:variationId'")
    }
    const raw = await this.client(credentials).get<RawEpagesVariation>(
      `products/${productId}/variations/${variationId}`,
    )
    return transformVariation(raw, productId)
  }

  async updateVariant(
    credentials: Credentials,
    id: string,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const [productId, variationId] = id.split(':')
    if (!productId || !variationId) {
      throw new Error("ePages Beyond variant id must be formatted as 'productId:variationId'")
    }
    const raw = await this.client(credentials).patch<RawEpagesVariation>(
      `products/${productId}/variations/${variationId}`,
      untransformVariation(data),
    )
    return transformVariation(raw, productId)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const res = await this.client(credentials).listPage<RawEpagesCustomer>(
      'customers',
      'customers',
      this.pageParams(params),
    )
    reportUpstreamPage(params, { totalCount: res.totalElements, totalPages: res.totalPages })
    return res.items.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const raw = await this.client(credentials).get<RawEpagesCustomer>(`customers/${id}`)
    return transformCustomer(raw)
  }

  async createCustomer(credentials: Credentials, data: Partial<Customer>): Promise<Customer> {
    const res = await this.client(credentials).post<RawEpagesCustomer>(
      'customers',
      untransformCustomer(data),
    )
    return transformCustomer(res)
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const res = await this.client(credentials).put<RawEpagesCustomer>(
      `customers/${id}`,
      untransformCustomer(data),
    )
    return transformCustomer(res)
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`customers/${id}`)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const res = await this.client(credentials).listPage<RawEpagesOrder>(
      'orders',
      'orders',
      this.pageParams(params),
    )
    reportUpstreamPage(params, { totalCount: res.totalElements, totalPages: res.totalPages })
    return res.items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const raw = await this.client(credentials).get<RawEpagesOrder>(`orders/${id}`)
    return transformOrder(raw)
  }

  async cancelOrder(credentials: Credentials, id: string): Promise<Order> {
    await this.client(credentials).post(`orders/${id}/cancel`)
    return this.getOrder(credentials, id)
  }

  // ── Fulfillments (shipping processes) ───────────────────────────────────

  async listFulfillments(credentials: Credentials, params: QueryParams): Promise<Fulfillment[]> {
    const orderId = params['orderId'] as string | undefined
    if (!orderId) {
      throw new Error('ePages Beyond requires ?orderId= for listFulfillments (nested resource).')
    }
    const client = this.client(credentials)
    const res = await client.listPage<RawEpagesShippingProcess>(
      `orders/${orderId}/processes/shippings`,
      'shippings',
      this.pageParams(params),
    )
    reportUpstreamPage(params, { totalCount: res.totalElements, totalPages: res.totalPages })
    return res.items.map((s) => transformFulfillment(s, orderId))
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    const [orderId, shippingId] = id.split(':')
    if (!orderId || !shippingId) {
      throw new Error("ePages Beyond fulfillment id must be formatted as 'orderId:shippingId'")
    }
    const raw = await this.client(credentials).get<RawEpagesShippingProcess>(
      `orders/${orderId}/processes/shippings/${shippingId}`,
    )
    return transformFulfillment(raw, orderId)
  }

  async createFulfillment(
    credentials: Credentials,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    if (!data.orderId) throw new Error('ePages Beyond createFulfillment requires orderId')
    const raw = await this.client(credentials).post<RawEpagesShippingProcess>(
      `orders/${data.orderId}/processes/shippings`,
      untransformFulfillment(data),
    )
    return transformFulfillment(raw, data.orderId)
  }

  // ── Discounts (coupon campaigns) ─────────────────────────────────────────

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const res = await this.client(credentials).listPage<RawEpagesCouponCampaign>(
      'coupon-campaigns',
      'couponCampaigns',
      this.pageParams(params),
    )
    reportUpstreamPage(params, { totalCount: res.totalElements, totalPages: res.totalPages })
    return res.items.map(transformDiscount)
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const raw = await this.client(credentials).get<RawEpagesCouponCampaign>(
      `coupon-campaigns/${id}`,
    )
    return transformDiscount(raw)
  }

  async createDiscount(credentials: Credentials, data: Partial<Discount>): Promise<Discount> {
    const res = await this.client(credentials).post<RawEpagesCouponCampaign>(
      'coupon-campaigns',
      untransformDiscount(data),
    )
    return transformDiscount(res)
  }

  async updateDiscount(
    credentials: Credentials,
    id: string,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const res = await this.client(credentials).put<RawEpagesCouponCampaign>(
      `coupon-campaigns/${id}`,
      untransformDiscount(data),
    )
    return transformDiscount(res)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`coupon-campaigns/${id}`)
  }
}
