/**
 * Dooca Commerce adapter for the ecommerce vertical.
 *
 * Maps the Dooca Commerce REST API (https://api.dooca.store) to the canonical
 * ecommerce resources.
 *
 * Authentication: static Bearer tokens generated from the Dooca admin panel
 * under Aplicativos → API. The `simpleApiKey` Connect Link template is used
 * so operators can paste their token through the normal credential form.
 * There is no OAuth2 authorization-code flow and tokens do not expire.
 *
 * Supported resources:
 *   - Products (with nested variations)
 *   - Collections (product categories)
 *   - Customers
 *   - Orders (with fulfillments and refunds)
 *   - Fulfillments (as order sub-resource)
 *   - Refunds (as order sub-resource)
 *   - Discounts (coupons)
 *   - Inventory (variation stock — synthetic single location)
 *   - Locations (synthetic single default location)
 *   - Transactions (derived from embedded payment object on orders)
 *
 * Docs: https://docs.dooca.com.br/introducao/api
 */

// ── Resource coverage ──────────────────────────────────────────────────────
// Derived: transaction — no dedicated endpoint; derived from order.payment
//          embedded object (GET /orders/:id). listTransactions requires
//          order_id query param.

import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product, ProductVariant } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { Location } from '../../schema/location'
import type { InventoryLevel } from '../../schema/inventory'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { Fulfillment } from '../../schema/fulfillment'
import type { Refund } from '../../schema/refund'
import type { Transaction } from '../../schema/transaction'
import type { Discount } from '../../schema/discount'

import { DOOCA_CREDENTIAL_FORM } from './auth'
import { DoocaCommerceClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import {
  transformProduct,
  untransformProduct,
  transformVariant,
  untransformVariant,
  type RawDoocaProduct,
  type RawDoocaVariation,
} from './transform/product'
import {
  transformCollection,
  untransformCollection,
  type RawDoocaCategory,
} from './transform/collection'
import { syntheticDefaultLocation } from './transform/location'
import {
  transformInventoryLevel,
  type RawDoocaVariationStock,
} from './transform/inventory'
import {
  transformCustomer,
  untransformCustomer,
  type RawDoocaCustomer,
} from './transform/customer'
import {
  transformOrder,
  untransformOrder,
  type RawDoocaOrder,
} from './transform/order'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawDoocaFulfillment,
} from './transform/fulfillment'
import {
  transformRefund,
  untransformRefund,
  type RawDoocaRefund,
} from './transform/refund'
import {
  transformDiscount,
  untransformDiscount,
  type RawDoocaDiscount,
} from './transform/discount'
import {
  transformTransaction,
  type RawDoocaPayment,
} from './transform/transaction'

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface DoocaCommerceAdapterConfig {}

export class DoocaCommerceAdapter implements EcommerceAdapter {
  readonly platform = 'dooca-commerce'
  readonly version = '0.1.0'
  /** Honours `params.search`; see AdapterCapabilities. Declared so the
   *  router can refuse the parameter on adapters that would drop it. */
  readonly capabilities = { search: true }

  // Connect Link support — single API-token form.
  credentialFields = DOOCA_CREDENTIAL_FORM.credentialFields
  exchangeCredentials = DOOCA_CREDENTIAL_FORM.exchangeCredentials

  constructor(_config: DoocaCommerceAdapterConfig = {}) {}

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // Dooca has no OAuth authorize URL — token is created manually in the
    // admin panel. Return informational URL.
    return 'https://app.dooca.com.br/configuracoes/api'
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error(
      'Dooca Commerce does not use OAuth code exchange. ' +
        'Generate an API token in your Dooca admin under Aplicativos → API, ' +
        'then POST it to /v1/connections with body ' +
        '`{platform: "dooca-commerce", credentials: {accessToken: "<your-token>"}}`.',
    )
  }

  /**
   * Dooca API tokens are static and do not expire. Returning the credentials
   * unchanged is correct.
   */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): DoocaCommerceClient {
    return new DoocaCommerceClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      per_page: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    if (params.page != null) out['page'] = params.page
    if (params.updatedAfter) out['updated_at'] = params.updatedAfter.toISOString()
    if (params.search) out['name'] = params.search
    return out
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.clientFor(credentials).listWithPage<RawDoocaProduct>(
      'products',
      this.listParams(params),
    )
    return res.items.map((p) => transformProduct(p))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.clientFor(credentials).get<RawDoocaProduct>(`products/${id}`)
    return transformProduct(res)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const res = await this.clientFor(credentials).post<RawDoocaProduct>(
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
    const res = await this.clientFor(credentials).put<RawDoocaProduct>(
      `products/${id}`,
      untransformProduct(data),
    )
    return transformProduct(res)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`products/${id}`)
  }

  // ── Variants ──────────────────────────────────────────────────────────────

  async listVariants(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<ProductVariant[]> {
    const productId = params['productId'] ?? params['product_id']
    if (productId == null) {
      throw new Error(
        'Dooca Commerce requires ?product_id= for listVariants; variations are nested under products.',
      )
    }
    // Fetch the parent product and return its nested variations.
    const product = await this.clientFor(credentials).get<RawDoocaProduct>(
      `products/${String(productId)}`,
    )
    return (product.variations ?? []).map((v) => {
      const withPid = { ...v, product_id: product.id }
      return transformVariant(withPid as RawDoocaVariation)
    })
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    // id format: `productId:variationId` or plain `variationId`
    const parts = id.split(':')
    if (parts.length === 2) {
      const [productId, variantId] = parts as [string, string]
      const product = await this.clientFor(credentials).get<RawDoocaProduct>(
        `products/${productId}`,
      )
      const variation = (product.variations ?? []).find(
        (v) => String(v.id) === variantId,
      )
      if (!variation) throw new Error(`Variation ${variantId} not found on product ${productId}`)
      return transformVariant({ ...variation, product_id: product.id })
    }
    // Fallback: try fetching directly via variations endpoint.
    const res = await this.clientFor(credentials).get<RawDoocaVariation>(`variations/${id}`)
    return transformVariant(res)
  }

  async updateVariant(
    credentials: Credentials,
    id: string,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const parts = id.split(':')
    const [productId, variantId] = parts.length === 2
      ? parts as [string, string]
      : [undefined, id]
    const res = await this.clientFor(credentials).put<RawDoocaVariation>(
      `variations/${variantId}`,
      untransformVariant(data),
    )
    return transformVariant({ ...res, product_id: productId ?? res.product_id })
  }

  // ── Collections ───────────────────────────────────────────────────────────

  async listCollections(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Collection[]> {
    const res = await this.clientFor(credentials).listWithPage<RawDoocaCategory>(
      'categories',
      this.listParams(params),
    )
    return res.items.map(transformCollection)
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const res = await this.clientFor(credentials).get<RawDoocaCategory>(`categories/${id}`)
    return transformCollection(res)
  }

  async createCollection(
    credentials: Credentials,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const res = await this.clientFor(credentials).post<RawDoocaCategory>(
      'categories',
      untransformCollection(data),
    )
    return transformCollection(res)
  }

  async updateCollection(
    credentials: Credentials,
    id: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const res = await this.clientFor(credentials).put<RawDoocaCategory>(
      `categories/${id}`,
      untransformCollection(data),
    )
    return transformCollection(res)
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`categories/${id}`)
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  async listLocations(
    _credentials: Credentials,
    _params: QueryParams,
  ): Promise<Location[]> {
    return [syntheticDefaultLocation()]
  }

  async getLocation(_credentials: Credentials, id: string): Promise<Location> {
    if (id !== 'default') {
      throw new Error(`Dooca Commerce has no native locations; unknown location id '${id}'`)
    }
    return syntheticDefaultLocation()
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  async adjustInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; delta: number },
  ): Promise<InventoryLevel> {
    // variantId is expected as `productId:variationId`
    const [productId, variationId] = data.variantId.split(':')
    if (!productId || !variationId) {
      throw new Error(
        'Dooca Commerce adjustInventoryLevel requires composite variantId `productId:variationId`',
      )
    }
    const current = await this.clientFor(credentials).get<RawDoocaVariationStock>(
      `variations/${variationId}`,
    )
    const newQty = (current.balance ?? 0) + data.delta
    const updated = await this.clientFor(credentials).put<RawDoocaVariationStock>(
      `variations/${variationId}`,
      { balance: newQty },
    )
    return transformInventoryLevel(updated, productId)
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const [productId, variationId] = data.variantId.split(':')
    if (!productId || !variationId) {
      throw new Error(
        'Dooca Commerce setInventoryLevel requires composite variantId `productId:variationId`',
      )
    }
    const updated = await this.clientFor(credentials).put<RawDoocaVariationStock>(
      `variations/${variationId}`,
      { balance: data.available },
    )
    return transformInventoryLevel(updated, productId)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const res = await this.clientFor(credentials).listWithPage<RawDoocaCustomer>(
      'customers',
      this.listParams(params),
    )
    return res.items.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.clientFor(credentials).get<RawDoocaCustomer>(`customers/${id}`)
    return transformCustomer(res)
  }

  async createCustomer(
    credentials: Credentials,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const res = await this.clientFor(credentials).post<RawDoocaCustomer>(
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
    const res = await this.clientFor(credentials).put<RawDoocaCustomer>(
      `customers/${id}`,
      untransformCustomer(data),
    )
    return transformCustomer(res)
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`customers/${id}`)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const extra: Record<string, unknown> = { ...this.listParams(params) }
    // Remove 'name' search param for orders (search is not the same field)
    delete extra['name']
    if (params.search) extra['q'] = params.search
    const res = await this.clientFor(credentials).listWithPage<RawDoocaOrder>(
      'orders',
      extra,
    )
    return res.items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const res = await this.clientFor(credentials).get<RawDoocaOrder>(`orders/${id}`)
    return transformOrder(res)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const res = await this.clientFor(credentials).post<RawDoocaOrder>(
      'orders',
      untransformOrder(data),
    )
    return transformOrder(res)
  }

  async updateOrder(
    credentials: Credentials,
    id: string,
    data: Partial<Order>,
  ): Promise<Order> {
    const res = await this.clientFor(credentials).put<RawDoocaOrder>(
      `orders/${id}`,
      untransformOrder(data),
    )
    return transformOrder(res)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Order> {
    const res = await this.clientFor(credentials).put<RawDoocaOrder>(`orders/${id}`, {
      status: 'canceled',
    })
    return transformOrder(res)
  }

  // ── Fulfillments ──────────────────────────────────────────────────────────

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    // id is the order_id — Dooca fulfillment is keyed by order
    const order = await this.clientFor(credentials).get<RawDoocaOrder>(`orders/${id}`)
    const ful = order.fulfillment as RawDoocaFulfillment | undefined
    if (!ful) throw new Error(`No fulfillment found for order ${id}`)
    return transformFulfillment({ ...ful, order_id: order.id })
  }

  async listFulfillments(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Fulfillment[]> {
    const orderId = params['order_id'] ?? params['orderId']
    if (!orderId) {
      throw new Error('listFulfillments requires `order_id` in query params')
    }
    const order = await this.clientFor(credentials).get<RawDoocaOrder>(
      `orders/${String(orderId)}`,
    )
    const ful = order.fulfillment as RawDoocaFulfillment | undefined
    if (!ful) return []
    return [transformFulfillment({ ...ful, order_id: order.id })]
  }

  async createFulfillment(
    credentials: Credentials,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    if (!data.orderId) throw new Error('createFulfillment requires orderId')
    const res = await this.clientFor(credentials).post<RawDoocaFulfillment>(
      `orders/${data.orderId}/fulfillment`,
      untransformFulfillment(data),
    )
    return transformFulfillment({ ...res, order_id: data.orderId })
  }

  async updateFulfillment(
    credentials: Credentials,
    id: string,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    // id is orderId; update the shipped state with tracking info
    const orderId = data.orderId ?? id
    const body = untransformFulfillment(data)
    const res = await this.clientFor(credentials).put<RawDoocaFulfillment>(
      `orders/${orderId}/fulfillment/shipped`,
      body,
    )
    return transformFulfillment({ ...res, order_id: orderId })
  }

  // ── Refunds ───────────────────────────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const orderId = params['order_id'] ?? params['orderId']
    if (orderId == null) {
      throw new Error('listRefunds requires `order_id` in query params')
    }
    const oid = String(orderId)
    const res = await this.clientFor(credentials).listWithPage<RawDoocaRefund>(
      `orders/${oid}/refunds`,
      this.listParams(params),
    )
    return res.items.map((r) => transformRefund(r, oid))
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const [orderId, refundId] = id.split(':')
    if (!orderId || !refundId) {
      throw new Error('Invalid refund id format: expected `orderId:refundId`')
    }
    const res = await this.clientFor(credentials).get<RawDoocaRefund>(
      `orders/${orderId}/refunds/${refundId}`,
    )
    return transformRefund(res, orderId)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.orderId) throw new Error('createRefund requires orderId')
    const res = await this.clientFor(credentials).post<RawDoocaRefund>(
      `orders/${data.orderId}/refunds`,
      untransformRefund(data),
    )
    return transformRefund(res, data.orderId)
  }

  // ── Transactions ──────────────────────────────────────────────────────────
  //
  // Dooca has no dedicated /transactions endpoint. Payment data is embedded in
  // the order response under the `payment` object. listTransactions requires
  // `order_id` in query params; getTransaction expects id as `orderId:paymentId`.

  async listTransactions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Transaction[]> {
    const orderId = params['order_id'] ?? params['orderId']
    if (orderId == null) {
      throw new Error('listTransactions requires `order_id` in query params')
    }
    const order = await this.clientFor(credentials).get<RawDoocaOrder>(
      `orders/${String(orderId)}`,
    )
    const payment = order.payment as RawDoocaPayment | null | undefined
    if (!payment) return []
    return [transformTransaction({ ...payment, order_id: order.id }, String(order.id))]
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    // id format: `orderId` or `orderId:paymentId` — always fetch the order
    const orderId = id.includes(':') ? id.split(':')[0]! : id
    const order = await this.clientFor(credentials).get<RawDoocaOrder>(`orders/${orderId}`)
    const payment = order.payment as RawDoocaPayment | null | undefined
    if (!payment) throw new Error(`No payment found for order ${orderId}`)
    return transformTransaction({ ...payment, order_id: order.id }, String(order.id))
  }

  // ── Discounts ─────────────────────────────────────────────────────────────

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const res = await this.clientFor(credentials).listWithPage<RawDoocaDiscount>(
      'discounts',
      this.listParams(params),
    )
    return res.items.map(transformDiscount)
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const res = await this.clientFor(credentials).get<RawDoocaDiscount>(`discounts/${id}`)
    return transformDiscount(res)
  }

  async createDiscount(
    credentials: Credentials,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const res = await this.clientFor(credentials).post<RawDoocaDiscount>(
      'discounts',
      untransformDiscount(data),
    )
    return transformDiscount(res)
  }

  async updateDiscount(
    credentials: Credentials,
    id: string,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const res = await this.clientFor(credentials).put<RawDoocaDiscount>(
      `discounts/${id}`,
      untransformDiscount(data),
    )
    return transformDiscount(res)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`discounts/${id}`)
  }
}
