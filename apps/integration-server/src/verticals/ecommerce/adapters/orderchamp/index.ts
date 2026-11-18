/**
 * Orderchamp adapter for the ecommerce vertical.
 *
 * A B2B wholesale marketplace; the public API is supplier-side only (a
 * brand manages its own catalog/inventory and fulfils marketplace-created
 * orders). Auth is a private-app static token (`Authorization: Bearer`),
 * not OAuth — see ./connect-form.ts. Single fixed GraphQL endpoint, so
 * (unlike Marketplacer) there is no per-customer host to validate.
 *
 * Docs: https://developers.orderchamp.com/
 */

import { createHash } from 'node:crypto'
import type { Credentials, PagedResult, QueryParams } from '@opensteward/shared'
import { cursorPagerKey, pageByCursor, reportUpstreamPage } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product, ProductVariant } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { Order } from '../../schema/order'
import type { Fulfillment } from '../../schema/fulfillment'
import type { Refund } from '../../schema/refund'

import { CONNECT_FORM } from './connect-form'
import { buildAuthUrl, exchangeCode as orderchampExchangeCode } from './auth'
import { OrderchampClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { LIST_PRODUCTS, GET_PRODUCT, CREATE_PRODUCT, UPDATE_PRODUCT, DELETE_PRODUCT, LIST_VARIANTS, GET_VARIANT, CREATE_VARIANT, UPDATE_VARIANT, DELETE_VARIANT, LIST_COLLECTIONS, GET_COLLECTION, LIST_ORDERS, GET_ORDER, CANCEL_ORDER, CREATE_SHIPMENT, SHIPMENT_SHIPPED, CREATE_REFUND } from './documents'

import {
  transformProduct,
  transformVariant,
  untransformProduct,
  untransformVariant,
  type RawOrderchampProduct,
  type RawOrderchampVariant,
} from './transform/product'
import { transformCollection, type RawOrderchampCollection } from './transform/collection'
import { transformOrder, type RawOrderchampOrder } from './transform/order'
import { untransformRefund, transformRefund, type RawOrderchampRefund } from './transform/refund'
import {
  untransformFulfillment,
  transformFulfillment,
  untransformShipmentShipped,
  type RawOrderchampShipment,
} from './transform/fulfillment'

interface Connection<T> {
  edges: Array<{ node: T }>
  pageInfo: { hasNextPage: boolean; endCursor: string | null }
}

interface UserError {
  field?: string[] | string | null
  message: string
}

function assertNoUserErrors(errors: UserError[] | null | undefined, mutation: string): void {
  if (!errors || errors.length === 0) return
  const detail = errors
    .map((e) => `${e.field ? `${Array.isArray(e.field) ? e.field.join('.') : e.field}: ` : ''}${e.message}`)
    .join('; ')
  throw new Error(`Orderchamp ${mutation} rejected the request: ${detail}`)
}

export class OrderchampAdapter implements EcommerceAdapter {
  readonly platform = 'orderchamp'
  readonly version = '0.1.0'
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  // Connect Link support — see ./connect-form.ts.
  credentialFields = CONNECT_FORM.credentialFields
  exchangeCredentials = CONNECT_FORM.exchangeCredentials

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(): string {
    return buildAuthUrl()
  }

  async exchangeCode(): Promise<Credentials> {
    return orderchampExchangeCode()
  }

  /** Private app tokens are not documented to expire on a schedule. */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): OrderchampClient {
    return new OrderchampClient(credentials)
  }

  /**
   * Stable per-connection scope for cursor keys. Orderchamp has a single
   * fixed endpoint (no per-customer host to key on, unlike Marketplacer),
   * and no confirmed "who am I" query to resolve a real account id without
   * an extra round trip — a one-way hash of the access token is stable and
   * unique per connection without the cache key ever holding the token
   * itself.
   */
  private pagerScope(credentials: Credentials): string {
    return `orderchamp:${createHash('sha256').update(credentials.accessToken).digest('hex').slice(0, 16)}`
  }

  private limitFor(params: QueryParams): number {
    return Math.min(Number(params.limit ?? DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE)
  }

  private async cursorPage<T>(
    credentials: Credentials,
    collectionKey: string,
    params: QueryParams,
    run: (first: number, after: string | undefined) => Promise<Connection<T>>,
  ): Promise<PagedResult<T>> {
    const first = this.limitFor(params)
    const explicitCursor = params['cursor'] ?? params['after']
    if (explicitCursor) {
      const res = await run(first, String(explicitCursor))
      return { items: res.edges.map((e) => e.node), hasMore: res.pageInfo.hasNextPage }
    }
    return pageByCursor<T, string>(
      cursorPagerKey(this.pagerScope(credentials), collectionKey, { first }),
      params.page,
      async (after) => {
        const res = await run(first, after)
        return {
          items: res.edges.map((e) => e.node),
          next: res.pageInfo.hasNextPage ? (res.pageInfo.endCursor ?? undefined) : undefined,
        }
      },
    )
  }

  private async cursorList<T>(
    credentials: Credentials,
    collectionKey: string,
    params: QueryParams,
    run: (first: number, after: string | undefined) => Promise<Connection<T>>,
  ): Promise<T[]> {
    const page = await this.cursorPage(credentials, collectionKey, params, run)
    reportUpstreamPage(params, { hasMore: page.hasMore })
    return page.items
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const client = this.client(credentials)
    const rows = await this.cursorList<RawOrderchampProduct>(credentials, 'products', params, async (first, after) => {
      const data = await client.request<{ products: Connection<RawOrderchampProduct> }>(LIST_PRODUCTS, {
        first,
        after,
      })
      return data.products
    })
    return rows.map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const data = await this.client(credentials).request<{ product: RawOrderchampProduct | null }>(GET_PRODUCT, {
      id,
    })
    if (!data.product) throw new Error(`Orderchamp product ${id} was not found`)
    return transformProduct(data.product)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const input = untransformProduct(data)
    const res = await this.client(credentials).request<{
      productCreate: { product: RawOrderchampProduct | null; userErrors: UserError[] }
    }>(CREATE_PRODUCT, { input })
    assertNoUserErrors(res.productCreate.userErrors, 'productCreate')
    if (!res.productCreate.product) throw new Error('productCreate returned no product and no errors')
    return transformProduct(res.productCreate.product)
  }

  async updateProduct(credentials: Credentials, id: string, data: Partial<Product>): Promise<Product> {
    const input = { id, ...untransformProduct(data) }
    const res = await this.client(credentials).request<{
      productUpdate: { product: RawOrderchampProduct | null; userErrors: UserError[] }
    }>(UPDATE_PRODUCT, { input })
    assertNoUserErrors(res.productUpdate.userErrors, 'productUpdate')
    if (!res.productUpdate.product) throw new Error('productUpdate returned no product and no errors')
    return transformProduct(res.productUpdate.product)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    const res = await this.client(credentials).request<{ productDelete: { userErrors: UserError[] } }>(
      DELETE_PRODUCT,
      { input: { id } },
    )
    assertNoUserErrors(res.productDelete.userErrors, 'productDelete')
  }

  // ── Variants ──────────────────────────────────────────────────────────────

  async listVariants(credentials: Credentials, params: QueryParams): Promise<ProductVariant[]> {
    const productId = params['productId'] ?? params['product_id']
    if (!productId) {
      throw new Error('Orderchamp requires ?productId= for listVariants.')
    }
    const client = this.client(credentials)
    const rows = await this.cursorList<RawOrderchampVariant>(
      credentials,
      `productVariants:${String(productId)}`,
      params,
      async (first, after) => {
        const data = await client.request<{ productVariants: Connection<RawOrderchampVariant> }>(LIST_VARIANTS, {
          first,
          after,
          productId: String(productId),
        })
        return data.productVariants
      },
    )
    return rows.map((r) => transformVariant(r, String(productId)))
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    // Composite id: this adapter's price mapping needs the parent productId,
    // which a bare `productVariant` node is not confirmed to expose itself.
    const [productId, variantId] = id.split(':')
    if (!productId || !variantId) {
      throw new Error('Invalid variant id format: expected `productId:variantId`')
    }
    const data = await this.client(credentials).request<{ productVariant: RawOrderchampVariant | null }>(
      GET_VARIANT,
      { id: variantId },
    )
    if (!data.productVariant) throw new Error(`Orderchamp variant ${variantId} was not found`)
    return transformVariant(data.productVariant, productId)
  }

  async createVariant(credentials: Credentials, data: Partial<ProductVariant>): Promise<ProductVariant> {
    if (!data.productId) throw new Error('createVariant requires productId (the Orderchamp product id)')
    const input = untransformVariant(data)
    const res = await this.client(credentials).request<{
      productVariantCreate: { productVariant: RawOrderchampVariant | null; userErrors: UserError[] }
    }>(CREATE_VARIANT, { input })
    assertNoUserErrors(res.productVariantCreate.userErrors, 'productVariantCreate')
    if (!res.productVariantCreate.productVariant) {
      throw new Error('productVariantCreate returned no variant and no errors')
    }
    return transformVariant(res.productVariantCreate.productVariant, data.productId)
  }

  async updateVariant(
    credentials: Credentials,
    id: string,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    if (!data.productId) {
      throw new Error('updateVariant requires productId (the Orderchamp product id) to map the response back.')
    }
    const input = untransformVariant({ ...data, id })
    const res = await this.client(credentials).request<{
      productVariantUpdate: { productVariant: RawOrderchampVariant | null; userErrors: UserError[] }
    }>(UPDATE_VARIANT, { input })
    assertNoUserErrors(res.productVariantUpdate.userErrors, 'productVariantUpdate')
    if (!res.productVariantUpdate.productVariant) {
      throw new Error('productVariantUpdate returned no variant and no errors')
    }
    return transformVariant(res.productVariantUpdate.productVariant, data.productId)
  }

  async deleteVariant(credentials: Credentials, id: string): Promise<void> {
    const res = await this.client(credentials).request<{
      productVariantDelete: { userErrors: UserError[] }
    }>(DELETE_VARIANT, { input: { productVariantId: id } })
    assertNoUserErrors(res.productVariantDelete.userErrors, 'productVariantDelete')
  }

  // ── Collections — read-only ──────────────────────────────────────────────

  async listCollections(credentials: Credentials, params: QueryParams): Promise<Collection[]> {
    const client = this.client(credentials)
    const rows = await this.cursorList<RawOrderchampCollection>(
      credentials,
      'productCollections',
      params,
      async (first, after) => {
        const data = await client.request<{ productCollections: Connection<RawOrderchampCollection> }>(
          LIST_COLLECTIONS,
          { first, after },
        )
        return data.productCollections
      },
    )
    return rows.map(transformCollection)
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const data = await this.client(credentials).request<{ productCollection: RawOrderchampCollection | null }>(
      GET_COLLECTION,
      { id },
    )
    if (!data.productCollection) throw new Error(`Orderchamp collection ${id} was not found`)
    return transformCollection(data.productCollection)
  }

  // ── Orders — read + cancel ────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = this.client(credentials)
    const rows = await this.cursorList<RawOrderchampOrder>(credentials, 'orders', params, async (first, after) => {
      const data = await client.request<{ orders: Connection<RawOrderchampOrder> }>(LIST_ORDERS, { first, after })
      return data.orders
    })
    return rows.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const data = await this.client(credentials).request<{ order: RawOrderchampOrder | null }>(GET_ORDER, { id })
    if (!data.order) throw new Error(`Orderchamp order ${id} was not found`)
    return transformOrder(data.order)
  }

  async cancelOrder(credentials: Credentials, id: string): Promise<Order> {
    const res = await this.client(credentials).request<{
      orderCancel: { order: RawOrderchampOrder | null; userErrors: UserError[] }
    }>(CANCEL_ORDER, { input: { orderId: id } })
    assertNoUserErrors(res.orderCancel.userErrors, 'orderCancel')
    if (!res.orderCancel.order) throw new Error('orderCancel returned no order and no errors')
    return transformOrder(res.orderCancel.order)
  }

  // ── Refunds — create-only ────────────────────────────────────────────────

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    const input = untransformRefund(data)
    const res = await this.client(credentials).request<{
      orderProductRefundCreate: { orderProductRefund: RawOrderchampRefund | null; userErrors: UserError[] }
    }>(CREATE_REFUND, { input })
    assertNoUserErrors(res.orderProductRefundCreate.userErrors, 'orderProductRefundCreate')
    if (!res.orderProductRefundCreate.orderProductRefund) {
      throw new Error('orderProductRefundCreate returned no refund and no errors')
    }
    return transformRefund(res.orderProductRefundCreate.orderProductRefund, input)
  }

  // ── Fulfillments (Shipments) — create + mark-shipped ────────────────────

  async createFulfillment(credentials: Credentials, data: Partial<Fulfillment>): Promise<Fulfillment> {
    const input = untransformFulfillment(data)
    const res = await this.client(credentials).request<{
      shipmentCreate: { shipment: RawOrderchampShipment | null; userErrors: UserError[] }
    }>(CREATE_SHIPMENT, { input })
    assertNoUserErrors(res.shipmentCreate.userErrors, 'shipmentCreate')
    if (!res.shipmentCreate.shipment) throw new Error('shipmentCreate returned no shipment and no errors')
    return transformFulfillment(res.shipmentCreate.shipment, input)
  }

  async updateFulfillment(
    credentials: Credentials,
    id: string,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    if (!data.orderId) {
      throw new Error('updateFulfillment requires orderId (the Orderchamp Order id) to map the response back.')
    }
    const input = untransformShipmentShipped(id, data)
    const res = await this.client(credentials).request<{
      shipmentShipped: { shipment: RawOrderchampShipment | null; userErrors: UserError[] }
    }>(SHIPMENT_SHIPPED, { input })
    assertNoUserErrors(res.shipmentShipped.userErrors, 'shipmentShipped')
    if (!res.shipmentShipped.shipment) throw new Error('shipmentShipped returned no shipment and no errors')
    return transformFulfillment(res.shipmentShipped.shipment, {
      orderId: data.orderId,
      products: (data.lineItems ?? []).map((li) => ({ orderProductId: li.lineItemId, quantity: li.quantity })),
    })
  }
}
