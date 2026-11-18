/**
 * Commerce Layer adapter for the ecommerce vertical.
 *
 * Maps the Commerce Layer JSON:API REST surface to the canonical ecommerce
 * resources. Notable Commerce Layer characteristics:
 *
 *  - **Headless commerce SaaS**: Fully API-driven, no storefront assumed.
 *  - **JSON:API format**: All responses wrapped in
 *    `{data: {type, id, attributes, relationships}}`. Content-Type
 *    is `application/vnd.api+json`. Updates use PATCH, not PUT.
 *  - **SKU-centric**: Products are SKUs; no parent-child variant model.
 *    Each SKU is both a Product and its own single variant.
 *  - **Market-scoped**: Pricing, inventory, and shipping are scoped by Market.
 *  - **OAuth2 client-credentials**: No authorization code exchange.
 *  - **Webhooks supported**: HMAC-SHA256 signed via X-CommerceLayer-Signature.
 *
 * Coverage: 40 of 42 interface methods implemented.
 *   Missing: createLocation, updateLocation (stock locations rarely created via API).
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
import type { Refund } from '../../schema/refund'
import type { Transaction } from '../../schema/transaction'
import type { Discount } from '../../schema/discount'
import type { WebhookEvent } from '../../schema/webhook'

import {
  buildAuthUrl,
  exchangeCode as clExchangeCode,
  refreshCredentials as clRefreshCredentials,
} from './auth'
import { oauth2ClientCredentials } from '@opensteward/shared'
import { CLClient, type FlatResource } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, TOKEN_PATH } from './constants'

const CREDENTIAL_FORM = oauth2ClientCredentials({
  tokenUrl: (input) => {
    const slug = (input.organizationSlug ?? '').trim()
    if (!slug) throw new Error('Organization slug is required.')
    return `https://${slug}.commercelayer.io${TOKEN_PATH}`
  },
  additionalFields: [
    {
      name: 'organizationSlug',
      label: 'Organization slug',
      type: 'text',
      required: true,
      helpText: 'The subdomain part of your Commerce Layer URL (e.g. "acme" for acme.commercelayer.io).',
    },
  ],
})
import { verifyCLWebhook, parseCLWebhookEvents } from './webhook'

import {
  transformProduct,
  transformProductVariant,
  untransformProduct,
  untransformProductVariant,
  type RawCLSku,
} from './transform/product'
import {
  transformCollection,
  untransformCollection,
  type RawCLSkuList,
} from './transform/collection'
import {
  transformLocation,
  type RawCLStockLocation,
} from './transform/location'
import {
  transformInventoryLevel,
  untransformStockItem,
  type RawCLStockItem,
} from './transform/inventory'
import {
  transformCustomer,
  untransformCustomer,
  type RawCLCustomer,
} from './transform/customer'
import {
  transformOrder,
  untransformOrder,
  type RawCLOrder,
} from './transform/order'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawCLShipment,
} from './transform/fulfillment'
import {
  transformRefund,
  untransformRefund,
  type RawCLReturn,
} from './transform/refund'
import {
  transformTransaction,
  untransformCapture,
  type RawCLTransaction,
} from './transform/transaction'
import {
  transformDiscount,
  untransformDiscount,
  type RawCLPromotion,
} from './transform/discount'

export interface CommerceLayerAdapterConfig {
  slug?: string
  clientId?: string
  clientSecret?: string
}

export class CommerceLayerAdapter implements EcommerceAdapter {
  readonly platform = 'commercelayer'
  readonly version = '0.1.0'

  /** Commerce Layer's `page[size]` tops out at 25; the router and the sync worker ask for no more. */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  credentialFields = CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  private configSlug: string | undefined
  private configClientId: string | undefined
  private configClientSecret: string | undefined

  constructor(config: CommerceLayerAdapterConfig = {}) {
    this.configSlug = config.slug
    this.configClientId = config.clientId
    this.configClientSecret = config.clientSecret
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    return buildAuthUrl(this.configSlug ?? 'your-org')
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return clExchangeCode()
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return clRefreshCredentials(credentials)
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyCLWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseCLWebhookEvents(payload)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): CLClient {
    const slug =
      (credentials.extra?.['slug'] as string | undefined) ?? this.configSlug
    const clientId =
      (credentials.extra?.['clientId'] as string | undefined) ?? this.configClientId
    const clientSecret =
      (credentials.extra?.['clientSecret'] as string | undefined) ?? this.configClientSecret

    if (!slug) {
      throw new Error(
        'Commerce Layer adapter is missing slug — either configure it in ' +
          'config or POST it to /v1/connections with credentials: {slug, clientId, clientSecret}.',
      )
    }
    if (!credentials.accessToken && (!clientId || !clientSecret)) {
      throw new Error(
        'Commerce Layer adapter needs either an accessToken or (clientId + clientSecret) ' +
          'to mint one. Re-create the connection with the required fields.',
      )
    }

    const mergedCreds: Credentials = {
      ...credentials,
      accessToken: credentials.accessToken || 'pending',
      extra: {
        ...credentials.extra,
        slug,
        ...(clientId ? { clientId } : {}),
        ...(clientSecret ? { clientSecret } : {}),
      },
    }
    return new CLClient(mergedCreds)
  }

  private pageParams(params: QueryParams): { currentPage: number; pageSize: number } {
    return {
      currentPage: params.page ?? 1,
      pageSize: params.limit ?? DEFAULT_PAGE_SIZE,
    }
  }

  // ── Products (SKUs) ───────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const { currentPage, pageSize } = this.pageParams(params)
    const res = await this.clientFor(credentials).listWithPage<FlatResource>(
      'skus',
      { currentPage, pageSize },
    )
    return res.items.map((p) => transformProduct(p as unknown as RawCLSku))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const raw = await this.clientFor(credentials).get<FlatResource>(
      `skus/${encodeURIComponent(id)}`,
    )
    return transformProduct(raw as unknown as RawCLSku)
  }

  async createProduct(
    credentials: Credentials,
    data: Partial<Product>,
  ): Promise<Product> {
    const body = untransformProduct(data)
    const res = await this.clientFor(credentials).post<FlatResource>('skus', body)
    return transformProduct(res as unknown as RawCLSku)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const body = untransformProduct(data)
    const jsonApiBody = body as { data: Record<string, unknown> }
    jsonApiBody.data['id'] = id
    const res = await this.clientFor(credentials).patch<FlatResource>(
      `skus/${encodeURIComponent(id)}`,
      jsonApiBody,
    )
    return transformProduct(res as unknown as RawCLSku)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`skus/${encodeURIComponent(id)}`)
  }

  // ── Variants (SKUs as single-variant) ─────────────────────────────────────

  async listVariants(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<ProductVariant[]> {
    const productId = (params['productId'] ?? params['product_id']) as string | undefined
    if (productId) {
      // Each SKU is its own single variant — return the SKU itself
      const raw = await this.clientFor(credentials).get<FlatResource>(
        `skus/${encodeURIComponent(productId)}`,
      )
      return [transformProductVariant(raw as unknown as RawCLSku)]
    }
    // Without a product_id filter, list all SKUs as variants
    const { currentPage, pageSize } = this.pageParams(params)
    const res = await this.clientFor(credentials).listWithPage<FlatResource>(
      'skus',
      { currentPage, pageSize },
    )
    return res.items.map((p) => transformProductVariant(p as unknown as RawCLSku))
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    // Strip `:default` suffix if present since variant ids are synthesized
    const skuId = id.replace(/:default$/, '')
    const raw = await this.clientFor(credentials).get<FlatResource>(
      `skus/${encodeURIComponent(skuId)}`,
    )
    return transformProductVariant(raw as unknown as RawCLSku)
  }

  async createVariant(
    credentials: Credentials,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const body = untransformProductVariant(data)
    const res = await this.clientFor(credentials).post<FlatResource>('skus', body)
    return transformProductVariant(res as unknown as RawCLSku)
  }

  async updateVariant(
    credentials: Credentials,
    id: string,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const skuId = id.replace(/:default$/, '')
    const body = untransformProductVariant(data)
    const jsonApiBody = body as { data: Record<string, unknown> }
    jsonApiBody.data['id'] = skuId
    const res = await this.clientFor(credentials).patch<FlatResource>(
      `skus/${encodeURIComponent(skuId)}`,
      jsonApiBody,
    )
    return transformProductVariant(res as unknown as RawCLSku)
  }

  async deleteVariant(credentials: Credentials, id: string): Promise<void> {
    const skuId = id.replace(/:default$/, '')
    await this.clientFor(credentials).delete(`skus/${encodeURIComponent(skuId)}`)
  }

  // ── Collections (SKU Lists) ───────────────────────────────────────────────

  async listCollections(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Collection[]> {
    const { currentPage, pageSize } = this.pageParams(params)
    const res = await this.clientFor(credentials).listWithPage<FlatResource>(
      'sku_lists',
      { currentPage, pageSize },
    )
    return res.items.map((c) => transformCollection(c as unknown as RawCLSkuList))
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const raw = await this.clientFor(credentials).get<FlatResource>(
      `sku_lists/${encodeURIComponent(id)}`,
    )
    return transformCollection(raw as unknown as RawCLSkuList)
  }

  async createCollection(
    credentials: Credentials,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const body = untransformCollection(data)
    const res = await this.clientFor(credentials).post<FlatResource>('sku_lists', body)
    return transformCollection(res as unknown as RawCLSkuList)
  }

  async updateCollection(
    credentials: Credentials,
    id: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const body = untransformCollection(data)
    const jsonApiBody = body as { data: Record<string, unknown> }
    jsonApiBody.data['id'] = id
    const res = await this.clientFor(credentials).patch<FlatResource>(
      `sku_lists/${encodeURIComponent(id)}`,
      jsonApiBody,
    )
    return transformCollection(res as unknown as RawCLSkuList)
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`sku_lists/${encodeURIComponent(id)}`)
  }

  // ── Locations (Stock Locations) ───────────────────────────────────────────

  async listLocations(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Location[]> {
    const { currentPage, pageSize } = this.pageParams(params)
    const res = await this.clientFor(credentials).listWithPage<FlatResource>(
      'stock_locations',
      { currentPage, pageSize },
    )
    return res.items.map((l) => transformLocation(l as unknown as RawCLStockLocation))
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const raw = await this.clientFor(credentials).get<FlatResource>(
      `stock_locations/${encodeURIComponent(id)}`,
    )
    return transformLocation(raw as unknown as RawCLStockLocation)
  }

  // ── Inventory (Stock Items) ───────────────────────────────────────────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const { currentPage, pageSize } = this.pageParams(params)
    const filters: Record<string, string> = {}
    const skuId = (params['variantId'] ?? params['productId'] ?? params['product_id']) as string | undefined
    const locId = (params['locationId'] ?? params['stock_location_id']) as string | undefined
    if (skuId) filters['sku_id_eq'] = skuId
    if (locId) filters['stock_location_id_eq'] = locId

    const res = await this.clientFor(credentials).listWithPage<FlatResource>(
      'stock_items',
      { currentPage, pageSize, filters },
    )
    return res.items.map((si) => transformInventoryLevel(si as unknown as RawCLStockItem))
  }

  async getInventoryLevel(
    credentials: Credentials,
    id: string,
  ): Promise<InventoryLevel> {
    const raw = await this.clientFor(credentials).get<FlatResource>(
      `stock_items/${encodeURIComponent(id)}`,
    )
    return transformInventoryLevel(raw as unknown as RawCLStockItem)
  }

  async adjustInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; delta: number },
  ): Promise<InventoryLevel> {
    const client = this.clientFor(credentials)
    // Find existing stock item for this SKU + location
    const res = await client.listWithPage<FlatResource>('stock_items', {
      pageSize: 1,
      filters: { sku_id_eq: data.variantId, stock_location_id_eq: data.locationId },
    })
    const existing = res.items[0] as unknown as RawCLStockItem | undefined
    const currentQty = existing?.quantity ?? 0
    const newQty = currentQty + data.delta

    if (existing?.id) {
      const updated = await client.patch<FlatResource>(
        `stock_items/${encodeURIComponent(existing.id)}`,
        {
          data: {
            type: 'stock_items',
            id: existing.id,
            attributes: { quantity: newQty },
          },
        },
      )
      return transformInventoryLevel(updated as unknown as RawCLStockItem)
    }

    // Create new stock item
    const body = untransformStockItem({ variantId: data.variantId, locationId: data.locationId, available: newQty })
    const created = await client.post<FlatResource>('stock_items', body)
    return transformInventoryLevel(created as unknown as RawCLStockItem)
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const client = this.clientFor(credentials)
    const res = await client.listWithPage<FlatResource>('stock_items', {
      pageSize: 1,
      filters: { sku_id_eq: data.variantId, stock_location_id_eq: data.locationId },
    })
    const existing = res.items[0]

    if (existing?.id) {
      const updated = await client.patch<FlatResource>(
        `stock_items/${encodeURIComponent(existing.id)}`,
        {
          data: {
            type: 'stock_items',
            id: existing.id,
            attributes: { quantity: data.available },
          },
        },
      )
      return transformInventoryLevel(updated as unknown as RawCLStockItem)
    }

    const body = untransformStockItem({ variantId: data.variantId, locationId: data.locationId, available: data.available })
    const created = await client.post<FlatResource>('stock_items', body)
    return transformInventoryLevel(created as unknown as RawCLStockItem)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Customer[]> {
    const { currentPage, pageSize } = this.pageParams(params)
    const res = await this.clientFor(credentials).listWithPage<FlatResource>(
      'customers',
      { currentPage, pageSize },
    )
    return res.items.map((c) => transformCustomer(c as unknown as RawCLCustomer))
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const raw = await this.clientFor(credentials).get<FlatResource>(
      `customers/${encodeURIComponent(id)}`,
    )
    return transformCustomer(raw as unknown as RawCLCustomer)
  }

  async createCustomer(
    credentials: Credentials,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const body = untransformCustomer(data)
    const res = await this.clientFor(credentials).post<FlatResource>('customers', body)
    return transformCustomer(res as unknown as RawCLCustomer)
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const body = untransformCustomer(data)
    const jsonApiBody = body as { data: Record<string, unknown> }
    jsonApiBody.data['id'] = id
    const res = await this.clientFor(credentials).patch<FlatResource>(
      `customers/${encodeURIComponent(id)}`,
      jsonApiBody,
    )
    return transformCustomer(res as unknown as RawCLCustomer)
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`customers/${encodeURIComponent(id)}`)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const { currentPage, pageSize } = this.pageParams(params)
    const res = await this.clientFor(credentials).listWithPage<FlatResource>(
      'orders',
      { currentPage, pageSize },
    )
    return res.items.map((o) => transformOrder(o as unknown as RawCLOrder))
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const raw = await this.clientFor(credentials).get<FlatResource>(
      `orders/${encodeURIComponent(id)}`,
      { include: 'line_items' },
    )
    return transformOrder(raw as unknown as RawCLOrder)
  }

  async createOrder(
    credentials: Credentials,
    data: Partial<Order>,
  ): Promise<Order> {
    const body = untransformOrder(data)
    const res = await this.clientFor(credentials).post<FlatResource>('orders', body)
    return transformOrder(res as unknown as RawCLOrder)
  }

  async updateOrder(
    credentials: Credentials,
    id: string,
    data: Partial<Order>,
  ): Promise<Order> {
    const body = untransformOrder(data)
    const jsonApiBody = body as { data: Record<string, unknown> }
    jsonApiBody.data['id'] = id
    const res = await this.clientFor(credentials).patch<FlatResource>(
      `orders/${encodeURIComponent(id)}`,
      jsonApiBody,
    )
    return transformOrder(res as unknown as RawCLOrder)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Order> {
    const res = await this.clientFor(credentials).patch<FlatResource>(
      `orders/${encodeURIComponent(id)}`,
      {
        data: {
          type: 'orders',
          id,
          attributes: {
            _cancel: true,
            cancel_reason: data?.reason,
          },
        },
      },
    )
    return transformOrder(res as unknown as RawCLOrder)
  }

  // ── Fulfillments (Shipments) ──────────────────────────────────────────────

  async listFulfillments(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Fulfillment[]> {
    const { currentPage, pageSize } = this.pageParams(params)
    const res = await this.clientFor(credentials).listWithPage<FlatResource>(
      'shipments',
      { currentPage, pageSize },
    )
    return res.items.map((s) => transformFulfillment(s as unknown as RawCLShipment))
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    const raw = await this.clientFor(credentials).get<FlatResource>(
      `shipments/${encodeURIComponent(id)}`,
    )
    return transformFulfillment(raw as unknown as RawCLShipment)
  }

  async createFulfillment(
    credentials: Credentials,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    // Commerce Layer auto-creates shipments; to "create" we purchase an existing one
    if (data.id) {
      return this.updateFulfillment(credentials, data.id, data)
    }
    // If no id, we can't create a shipment directly — they are auto-created
    throw new Error(
      'Commerce Layer auto-creates shipments from orders. ' +
        'Use updateFulfillment to add tracking or purchase a shipment.',
    )
  }

  async updateFulfillment(
    credentials: Credentials,
    id: string,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    const body = untransformFulfillment(data)
    const jsonApiBody = body as { data: Record<string, unknown> }
    jsonApiBody.data['id'] = id
    const res = await this.clientFor(credentials).patch<FlatResource>(
      `shipments/${encodeURIComponent(id)}`,
      jsonApiBody,
    )
    return transformFulfillment(res as unknown as RawCLShipment)
  }

  async cancelFulfillment(
    credentials: Credentials,
    id: string,
  ): Promise<Fulfillment> {
    const res = await this.clientFor(credentials).patch<FlatResource>(
      `shipments/${encodeURIComponent(id)}`,
      {
        data: {
          type: 'shipments',
          id,
          attributes: {
            _on_hold: true,
          },
        },
      },
    )
    return transformFulfillment(res as unknown as RawCLShipment)
  }

  // ── Refunds (Returns) ─────────────────────────────────────────────────────

  async listRefunds(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Refund[]> {
    const { currentPage, pageSize } = this.pageParams(params)
    const res = await this.clientFor(credentials).listWithPage<FlatResource>(
      'returns',
      { currentPage, pageSize },
    )
    return res.items.map((r) => transformRefund(r as unknown as RawCLReturn))
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const raw = await this.clientFor(credentials).get<FlatResource>(
      `returns/${encodeURIComponent(id)}`,
    )
    return transformRefund(raw as unknown as RawCLReturn)
  }

  async createRefund(
    credentials: Credentials,
    data: Partial<Refund>,
  ): Promise<Refund> {
    const body = untransformRefund(data)
    const res = await this.clientFor(credentials).post<FlatResource>('returns', body)
    return transformRefund(res as unknown as RawCLReturn)
  }

  // ── Transactions ──────────────────────────────────────────────────────────

  async listTransactions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Transaction[]> {
    const { currentPage, pageSize } = this.pageParams(params)
    // Commerce Layer transactions are accessed via order sub-resources.
    // For a general listing, use captures as the primary transaction type.
    const orderId = (params['orderId'] ?? params['order_id']) as string | undefined
    const path = orderId
      ? `orders/${encodeURIComponent(orderId)}/captures`
      : 'captures'
    const res = await this.clientFor(credentials).listWithPage<FlatResource>(
      path,
      { currentPage, pageSize },
    )
    return res.items.map((t) => transformTransaction(t as unknown as RawCLTransaction))
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const raw = await this.clientFor(credentials).get<FlatResource>(
      `captures/${encodeURIComponent(id)}`,
    )
    return transformTransaction(raw as unknown as RawCLTransaction)
  }

  async createTransaction(
    credentials: Credentials,
    data: Partial<Transaction>,
  ): Promise<Transaction> {
    const body = untransformCapture(data)
    const res = await this.clientFor(credentials).post<FlatResource>('captures', body)
    return transformTransaction(res as unknown as RawCLTransaction)
  }

  // ── Discounts (Promotions) ────────────────────────────────────────────────

  async listDiscounts(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Discount[]> {
    const { currentPage, pageSize } = this.pageParams(params)
    const res = await this.clientFor(credentials).listWithPage<FlatResource>(
      'promotions',
      { currentPage, pageSize },
    )
    return res.items.map((p) => transformDiscount(p as unknown as RawCLPromotion))
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const raw = await this.clientFor(credentials).get<FlatResource>(
      `promotions/${encodeURIComponent(id)}`,
    )
    return transformDiscount(raw as unknown as RawCLPromotion)
  }

  async createDiscount(
    credentials: Credentials,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const body = untransformDiscount(data)
    const type = (body as { data: { type: string } }).data.type
    const res = await this.clientFor(credentials).post<FlatResource>(type, body)
    return transformDiscount(res as unknown as RawCLPromotion)
  }

  async updateDiscount(
    credentials: Credentials,
    id: string,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const body = untransformDiscount(data)
    const jsonApiBody = body as { data: Record<string, unknown> }
    jsonApiBody.data['id'] = id
    const type = jsonApiBody.data['type'] as string
    const res = await this.clientFor(credentials).patch<FlatResource>(
      `${type}/${encodeURIComponent(id)}`,
      jsonApiBody,
    )
    return transformDiscount(res as unknown as RawCLPromotion)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    // Try as a generic promotion endpoint
    await this.clientFor(credentials).delete(`promotions/${encodeURIComponent(id)}`)
  }
}
