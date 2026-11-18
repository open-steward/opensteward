/**
 * Webflow adapter for the ecommerce vertical.
 *
 * Maps the Webflow REST API (v2) to the canonical ecommerce resources.
 * Webflow is a design-first platform — its CMS API exposes products
 * (`/sites/{siteId}/products`), orders, and collections. Order management
 * is limited compared to dedicated ecommerce platforms.
 *
 * Auth: OAuth2, REST. Base URL: https://api.webflow.com/v2/
 * Tokens are long-lived — `refreshCredentials` is a no-op.
 *
 * ~25/42 methods implemented (Webflow does not support standalone
 * customers, transactions, locations, or full discount management).
 *
 * Docs: https://developers.webflow.com/data/reference/rest-introduction
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: location    — Webflow ecommerce has no locations concept; the
 *                            platform manages a single online storefront with
 *                            no physical location or multi-warehouse model.
 * Unavailable: transaction — Webflow has no standalone transactions endpoint;
 *                            payment data (Stripe chargeId, PayPal captureId,
 *                            amounts) is embedded inside the order object but
 *                            is not exposed as a queryable transaction resource.
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product, ProductVariant } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { InventoryLevel } from '../../schema/inventory'
import type { Order } from '../../schema/order'
import type { Fulfillment } from '../../schema/fulfillment'
import type { Refund } from '../../schema/refund'
import type { WebhookEvent } from '../../schema/webhook'

import { buildAuthUrl, exchangeCode as webflowExchangeCode } from './auth'
import { WebflowClient } from './client'
import { DEFAULT_PAGE_SIZE, DEFAULT_SCOPES } from './constants'
import { verifyWebflowWebhook, parseWebflowWebhookEvents } from './webhook'

import {
  transformProduct,
  untransformProduct,
  transformVariant,
  untransformVariant,
  type RawWebflowProduct,
  type RawWebflowSku,
} from './transform/product'
import {
  transformCollection,
  untransformCollection,
  type RawWebflowCollection,
} from './transform/collection'
import {
  transformInventoryLevel,
  type RawWebflowInventory,
} from './transform/inventory'
import {
  transformOrder,
  untransformOrder,
  type RawWebflowOrder,
} from './transform/order'
import {
  transformFulfillment,
  untransformFulfillment,
} from './transform/fulfillment'
import {
  transformRefund,
  untransformRefund,
  type RawWebflowRefund,
} from './transform/refund'

export interface WebflowAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  /** Webflow site ID. Required for product/order/inventory endpoints. */
  siteId: string
  scopes?: string[]
}

export class WebflowAdapter implements EcommerceAdapter {
  readonly platform = 'webflow'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private siteId: string
  private scopes: string[]

  constructor(config: WebflowAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.siteId = config.siteId
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, (overrideScopes ?? this.scopes), state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return webflowExchangeCode(code, this.clientId, this.clientSecret, redirectUri || this.redirectUri)
  }

  /**
   * Webflow access tokens are long-lived and do not rotate. Returning them
   * unchanged here is correct.
   */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyWebflowWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    const triggerType = payload['triggerType'] as string | undefined
    return parseWebflowWebhookEvents(payload, triggerType)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): WebflowClient {
    return new WebflowClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    if (params.page != null) {
      out.offset = ((params.page - 1) * (params.limit ?? DEFAULT_PAGE_SIZE))
    }
    return out
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).listWithPagination<RawWebflowProduct>(
      `/sites/${this.siteId}/products`,
      'items',
      this.listParams(params),
    )
    return res.items.map((p) => transformProduct(p))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).get<RawWebflowProduct>(
      `/sites/${this.siteId}/products/${id}`,
    )
    return transformProduct(res)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const body = untransformProduct(data)
    const res = await this.client(credentials).post<RawWebflowProduct>(
      `/sites/${this.siteId}/products`,
      body,
    )
    return transformProduct(res)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const body = untransformProduct(data)
    const res = await this.client(credentials).patch<RawWebflowProduct>(
      `/sites/${this.siteId}/products/${id}`,
      body,
    )
    return transformProduct(res)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/sites/${this.siteId}/products/${id}`)
  }

  // ── Variants (SKUs) ───────────────────────────────────────────────────────

  async listVariants(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<ProductVariant[]> {
    const productId = params['productId'] ?? params['product_id']
    if (productId) {
      const product = await this.client(credentials).get<RawWebflowProduct>(
        `/sites/${this.siteId}/products/${String(productId)}`,
      )
      return (product.skus ?? []).map((s) =>
        transformVariant(s, String(productId), product.fieldData?.['sku-properties']),
      )
    }
    // Fallback: fetch all products, flatten SKUs
    const res = await this.client(credentials).listWithPagination<RawWebflowProduct>(
      `/sites/${this.siteId}/products`,
      'items',
      this.listParams(params),
    )
    return res.items.flatMap((p) =>
      (p.skus ?? []).map((s) =>
        transformVariant(s, p.id, p.fieldData?.['sku-properties']),
      ),
    )
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    // Webflow requires product context. Composite id format: `productId:skuId`
    const [productId, skuId] = id.split(':')
    if (!productId || !skuId) {
      throw new Error('Invalid variant id format: expected `productId:skuId`')
    }
    const product = await this.client(credentials).get<RawWebflowProduct>(
      `/sites/${this.siteId}/products/${productId}`,
    )
    const sku = (product.skus ?? []).find((s) => s.id === skuId)
    if (!sku) throw new Error(`SKU ${skuId} not found on product ${productId}`)
    return transformVariant(sku, productId, product.fieldData?.['sku-properties'])
  }

  async createVariant(
    credentials: Credentials,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    if (!data.productId) throw new Error('createVariant requires productId')
    const body = untransformVariant(data)
    const res = await this.client(credentials).post<RawWebflowSku>(
      `/sites/${this.siteId}/products/${data.productId}/skus`,
      body,
    )
    return transformVariant(res, data.productId)
  }

  async updateVariant(
    credentials: Credentials,
    id: string,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const [productId, skuId] = id.split(':')
    if (!productId || !skuId) {
      throw new Error('Invalid variant id format: expected `productId:skuId`')
    }
    const body = untransformVariant(data)
    const res = await this.client(credentials).patch<RawWebflowSku>(
      `/sites/${this.siteId}/products/${productId}/skus/${skuId}`,
      body,
    )
    return transformVariant(res, productId)
  }

  // ── Collections ───────────────────────────────────────────────────────────

  async listCollections(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Collection[]> {
    const res = await this.client(credentials).listWithPagination<RawWebflowCollection>(
      `/sites/${this.siteId}/collections`,
      'collections',
      this.listParams(params),
    )
    return res.items.map(transformCollection)
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const res = await this.client(credentials).get<RawWebflowCollection>(
      `/collections/${id}`,
    )
    return transformCollection(res)
  }

  async createCollection(
    credentials: Credentials,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const res = await this.client(credentials).post<RawWebflowCollection>(
      `/sites/${this.siteId}/collections`,
      untransformCollection(data),
    )
    return transformCollection(res)
  }

  async updateCollection(
    credentials: Credentials,
    id: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const res = await this.client(credentials).patch<RawWebflowCollection>(
      `/collections/${id}`,
      untransformCollection(data),
    )
    return transformCollection(res)
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/collections/${id}`)
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const productId = params['productId'] ?? params['product_id']
    if (!productId) {
      throw new Error('listInventoryLevels requires `productId` in query params')
    }
    const product = await this.client(credentials).get<RawWebflowProduct>(
      `/sites/${this.siteId}/products/${String(productId)}`,
    )
    return (product.skus ?? []).map((sku) =>
      transformInventoryLevel(
        { quantity: (sku.fieldData as Record<string, unknown>)?.['quantity'] as number | undefined } as RawWebflowInventory,
        sku.id,
        this.siteId,
      ),
    )
  }

  async getInventoryLevel(credentials: Credentials, id: string): Promise<InventoryLevel> {
    // Composite id: `skuId:siteId`
    const [skuId] = id.split(':')
    if (!skuId) throw new Error('Invalid inventory level id format')
    const res = await this.client(credentials).get<RawWebflowInventory>(
      `/sites/${this.siteId}/inventory/${skuId}`,
    )
    return transformInventoryLevel(res, skuId, this.siteId)
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const res = await this.client(credentials).patch<RawWebflowInventory>(
      `/sites/${this.siteId}/inventory/${data.variantId}`,
      { quantity: data.available, inventoryType: 'finite' },
    )
    return transformInventoryLevel(res, data.variantId, this.siteId)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const res = await this.client(credentials).listWithPagination<RawWebflowOrder>(
      `/sites/${this.siteId}/orders`,
      'orders',
      this.listParams(params),
    )
    return res.items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const res = await this.client(credentials).get<RawWebflowOrder>(
      `/sites/${this.siteId}/orders/${id}`,
    )
    return transformOrder(res)
  }

  async updateOrder(
    credentials: Credentials,
    id: string,
    data: Partial<Order>,
  ): Promise<Order> {
    const body = untransformOrder(data)
    const res = await this.client(credentials).patch<RawWebflowOrder>(
      `/sites/${this.siteId}/orders/${id}`,
      body,
    )
    return transformOrder(res)
  }

  // ── Fulfillments ──────────────────────────────────────────────────────────

  async createFulfillment(
    credentials: Credentials,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    if (!data.orderId) throw new Error('createFulfillment requires orderId')
    const body = untransformFulfillment(data)
    const res = await this.client(credentials).post<RawWebflowOrder>(
      `/sites/${this.siteId}/orders/${data.orderId}/fulfill`,
      body,
    )
    return transformFulfillment({
      id: data.orderId,
      orderId: data.orderId,
      status: 'fulfilled',
      fulfilledOn: res.fulfilledOn as string | undefined,
      createdOn: res.createdOn as string | undefined,
    })
  }

  // ── Refunds ───────────────────────────────────────────────────────────────

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.orderId) throw new Error('createRefund requires orderId')
    const body = untransformRefund(data)
    const res = await this.client(credentials).post<RawWebflowOrder>(
      `/sites/${this.siteId}/orders/${data.orderId}/refund`,
      body,
    )
    return transformRefund({
      id: data.orderId,
      orderId: data.orderId,
      reason: data.reason,
      refundedOn: res.refundedOn as string | undefined,
      createdOn: res.createdOn as string | undefined,
    } as RawWebflowRefund)
  }
}
