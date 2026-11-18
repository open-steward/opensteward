import { simpleApiKey } from '@opensteward/shared'
/**
 * CS-Cart adapter for the ecommerce vertical.
 *
 * Maps the CS-Cart REST API (`{baseUrl}/api/`) to the canonical ecommerce
 * resources. CS-Cart is a self-hosted PHP ecommerce platform that uses HTTP
 * Basic auth combining the admin email with an API key — there is no
 * OAuth code-exchange flow.
 *
 * Required credentials:
 *  - `accessToken`       = CS-Cart API key
 *  - `extra.baseUrl`     = store base URL (e.g. `https://mystore.example.com`)
 *  - `extra.email`       = admin email (used as Basic auth username)
 *
 * Implemented resources:
 *  products, collections (categories), orders, customers, fulfillments
 *  (shipments), inventory levels. Variant, location and discount reads refuse
 *  (see "Resource coverage" below).
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product, ProductVariant } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { Location } from '../../schema/location'
import type { InventoryLevel } from '../../schema/inventory'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { Fulfillment } from '../../schema/fulfillment'
import type { Discount } from '../../schema/discount'

import {
  getAuthUrl as csCartGetAuthUrl,
  exchangeCode as csCartExchangeCode,
  refreshCredentials as csCartRefreshCredentials,
} from './auth'
import { CsCartClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import { transformProduct, untransformProduct, type CsCartProduct } from './transform/product'
import { transformOrder, type CsCartOrder } from './transform/order'
import { transformCustomer, untransformCustomer, type CsCartUser } from './transform/customer'
import { transformFulfillment, type CsCartShipment } from './transform/fulfillment'
import { transformInventoryLevel, type CsCartStockItem } from './transform/inventory'
import {
  transformCollection,
  untransformCollection,
  type CsCartCategory,
} from './transform/collection'
import { transformDiscount, untransformDiscount, type CsCartPromotion } from './transform/discount'

// ── Resource coverage ──────────────────────────────────────────────────────────
// Unavailable: refund      — CS-Cart has no REST API endpoint for refunds.
//                            Returns are handled by the optional RMA add-on which
//                            has no documented REST surface; the orders object
//                            exposes only a bare credit_memo_id reference field
//                            with no associated CRUD endpoint.
// Unavailable: transaction — CS-Cart has no REST API endpoint for payment
//                            transactions. The /api/payments endpoint covers
//                            payment method configurations only. The payment_info
//                            field on orders is an opaque, undocumented array
//                            with no associated transaction-level endpoint.

// Refused (501 before any request), from the Supported Entities list at
// https://docs.cs-cart.com/latest/developer_guide/api/entities/index.html:
//   location — no warehouse or location entity is listed; GET /api/warehouses
//              is not a documented route.
//   discount — no Promotions entity is listed; promotions appear only as
//              order/cart fields. Reads refuse; the write methods still call
//              the undocumented /api/promotions route.
//   variant  — Product Variations (GET /api/product_variations, "Fields are
//              inherited from Products") carry "price float The base product
//              price in your store’s primary currency", but no documented
//              field, entity or credential gives that currency's code, and
//              the canonical Money requires one (and its minor-unit scale).
//              Option combinations (/api/combinations) carry no price at all.

const API_ENTITIES_URL = 'https://docs.cs-cart.com/latest/developer_guide/api/entities/index.html'
const ORDERS_URL = 'https://docs.cs-cart.com/latest/developer_guide/api/entities/orders.html'
const VARIATIONS_URL =
  'https://docs.cs-cart.com/latest/developer_guide/api/entities/product_variations.html'

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

const NO_LOCATION_ENTITY = `the REST API documents no warehouse or location entity (Supported Entities: ${API_ENTITIES_URL})`
const NO_LOCATIONS = `CS-Cart cannot list locations: ${NO_LOCATION_ENTITY}`
const NO_LOCATION = `CS-Cart cannot get a location: ${NO_LOCATION_ENTITY}`
const NO_PROMOTION_ENTITY =
  `the REST API documents no Promotions entity (Supported Entities: ${API_ENTITIES_URL}); ` +
  `promotions appear only as order fields: "promotion_ids string A string of promotion IDs separated by commas." (${ORDERS_URL})`
const NO_DISCOUNTS = `CS-Cart cannot list discounts: ${NO_PROMOTION_ENTITY}`
const NO_DISCOUNT = `CS-Cart cannot get a discount: ${NO_PROMOTION_ENTITY}`
const NO_VARIANT_CURRENCY =
  'variant prices are documented only as "The base product price in your store’s primary currency" ' +
  `(Product Variations inherit Products fields, ${VARIATIONS_URL}), and no documented field, entity or ` +
  'credential gives that currency code, which a canonical variant price requires'
const NO_VARIANTS = `CS-Cart cannot list variants: ${NO_VARIANT_CURRENCY}`
const NO_VARIANT = `CS-Cart cannot get a variant: ${NO_VARIANT_CURRENCY}`

// ── Adapter class ─────────────────────────────────────────────────────────────
const SIMPLE_API_KEY_FORM = simpleApiKey()

export class CsCartAdapter implements EcommerceAdapter {
  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'cscart'
  readonly version = '0.1.0'

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    return csCartGetAuthUrl(_state)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return csCartExchangeCode(_code, _redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return csCartRefreshCredentials(credentials)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): CsCartClient {
    return new CsCartClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      items_per_page: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    if (params.page != null) out['page'] = params.page
    return out
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.clientFor(credentials).listWithPage<CsCartProduct>(
      'products',
      'products',
      this.listParams(params),
    )
    return res.items.map((p) => transformProduct(p))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const raw = await this.clientFor(credentials).get<CsCartProduct>(`products/${id}`)
    return transformProduct(raw)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const raw = await this.clientFor(credentials).post<CsCartProduct>(
      'products',
      untransformProduct(data),
    )
    return transformProduct(raw)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const raw = await this.clientFor(credentials).put<CsCartProduct>(
      `products/${id}`,
      untransformProduct(data),
    )
    return transformProduct(raw)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`products/${id}`)
  }

  // ── Variants (Combinations) ───────────────────────────────────────────────

  async listVariants(_credentials: Credentials, _params: QueryParams): Promise<ProductVariant[]> {
    throw notSupported(NO_VARIANTS)
  }

  async getVariant(_credentials: Credentials, _id: string): Promise<ProductVariant> {
    throw notSupported(NO_VARIANT)
  }

  // ── Collections (Categories) ──────────────────────────────────────────────

  async listCollections(credentials: Credentials, params: QueryParams): Promise<Collection[]> {
    const res = await this.clientFor(credentials).listWithPage<CsCartCategory>(
      'categories',
      'categories',
      this.listParams(params),
    )
    return res.items.map(transformCollection)
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const raw = await this.clientFor(credentials).get<CsCartCategory>(`categories/${id}`)
    return transformCollection(raw)
  }

  async createCollection(credentials: Credentials, data: Partial<Collection>): Promise<Collection> {
    const raw = await this.clientFor(credentials).post<CsCartCategory>(
      'categories',
      untransformCollection(data),
    )
    return transformCollection(raw)
  }

  // ── Locations (Warehouses) ────────────────────────────────────────────────

  async listLocations(_credentials: Credentials, _params: QueryParams): Promise<Location[]> {
    throw notSupported(NO_LOCATIONS)
  }

  async getLocation(_credentials: Credentials, _id: string): Promise<Location> {
    throw notSupported(NO_LOCATION)
  }

  // ── Inventory Levels ──────────────────────────────────────────────────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    // CS-Cart has no dedicated inventory endpoint — inventory is a field on
    // each product. We read the product list and synthesize levels.
    const res = await this.clientFor(credentials).listWithPage<CsCartStockItem>(
      'products',
      'products',
      this.listParams(params),
    )
    return res.items.map((p) => {
      const variantId = p.product_id != null ? String(p.product_id) : ''
      return transformInventoryLevel(p, variantId)
    })
  }

  async getInventoryLevel(credentials: Credentials, id: string): Promise<InventoryLevel> {
    // id is expected to be `productId:default` or `productId:combinationId:default`
    const parts = id.split(':')
    const productId = parts[0]
    if (!productId) throw new Error(`Invalid inventory level id: '${id}'`)

    const combinationId = parts.length >= 3 ? parts[1] : undefined
    if (combinationId) {
      const raw = await this.clientFor(credentials).get<CsCartStockItem>(
        `products/${productId}/combinations/${combinationId}`,
      )
      return transformInventoryLevel(raw, `${productId}:${combinationId}`)
    }

    const raw = await this.clientFor(credentials).get<CsCartStockItem>(`products/${productId}`)
    return transformInventoryLevel(raw, productId)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const res = await this.clientFor(credentials).listWithPage<CsCartUser>(
      'users',
      'users',
      this.listParams(params),
    )
    return res.items.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const raw = await this.clientFor(credentials).get<CsCartUser>(`users/${id}`)
    return transformCustomer(raw)
  }

  async createCustomer(credentials: Credentials, data: Partial<Customer>): Promise<Customer> {
    const raw = await this.clientFor(credentials).post<CsCartUser>(
      'users',
      untransformCustomer(data),
    )
    return transformCustomer(raw)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const res = await this.clientFor(credentials).listWithPage<CsCartOrder>(
      'orders',
      'orders',
      this.listParams(params),
    )
    return res.items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const raw = await this.clientFor(credentials).get<CsCartOrder>(`orders/${id}`)
    return transformOrder(raw)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Order> {
    // CS-Cart uses status `D` (Declined) as the closest analogue to cancelled.
    const raw = await this.clientFor(credentials).put<CsCartOrder>(`orders/${id}`, {
      status: 'D',
    })
    return transformOrder(raw)
  }

  // ── Fulfillments (Shipments) ──────────────────────────────────────────────

  async listFulfillments(credentials: Credentials, params: QueryParams): Promise<Fulfillment[]> {
    const res = await this.clientFor(credentials).listWithPage<CsCartShipment>(
      'shipments',
      'shipments',
      this.listParams(params),
    )
    return res.items.map(transformFulfillment)
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    const raw = await this.clientFor(credentials).get<CsCartShipment>(`shipments/${id}`)
    return transformFulfillment(raw)
  }

  // ── Discounts (Promotions) ────────────────────────────────────────────────

  async listDiscounts(_credentials: Credentials, _params: QueryParams): Promise<Discount[]> {
    throw notSupported(NO_DISCOUNTS)
  }

  async getDiscount(_credentials: Credentials, _id: string): Promise<Discount> {
    throw notSupported(NO_DISCOUNT)
  }

  async createDiscount(credentials: Credentials, data: Partial<Discount>): Promise<Discount> {
    const raw = await this.clientFor(credentials).post<CsCartPromotion>(
      'promotions',
      untransformDiscount(data),
    )
    return transformDiscount(raw)
  }

  async updateDiscount(
    credentials: Credentials,
    id: string,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const raw = await this.clientFor(credentials).put<CsCartPromotion>(
      `promotions/${id}`,
      untransformDiscount(data),
    )
    return transformDiscount(raw)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`promotions/${id}`)
  }
}
