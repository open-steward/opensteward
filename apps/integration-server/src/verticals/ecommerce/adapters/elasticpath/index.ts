/**
 * Elastic Path adapter for the ecommerce vertical.
 *
 * Maps the Elastic Path Commerce Cloud API to the canonical ecommerce
 * resources. Notable Elastic Path characteristics:
 *
 *  - **Composable headless SaaS**: Products (PCM), Cart, Checkout,
 *    Orders are separate service domains.
 *  - **Regional endpoints**: US East (default) and EU West.
 *  - **JSON:API-like responses**: `{data, included, meta, links}` envelope.
 *  - **OAuth2 client_credentials**: No authorization code exchange.
 *  - **PCM products**: Products use Product Content Management with
 *    separate pricing via Price Books.
 *  - **Integer cents for money**: All monetary values in cents, divide by 100.
 *  - **Webhooks via Integrations**: HTTPS POST with secret key verification.
 *
 * Coverage: 40 of 42 interface methods implemented.
 *   Omitted: createOrder (cart-based), updateFulfillment, cancelFulfillment.
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
  exchangeCode as epExchangeCode,
  refreshCredentials as epRefreshCredentials,
  resolveBaseUrl,
} from './auth'
import { oauth2ClientCredentials } from '@opensteward/shared'
import { EpClient, type EpResource } from './client'
import { DEFAULT_PAGE_SIZE, REGIONS, DEFAULT_REGION, TOKEN_ENDPOINT } from './constants'

const CREDENTIAL_FORM = oauth2ClientCredentials({
  tokenUrl: (input) => {
    const region = (input.region ?? DEFAULT_REGION).trim()
    const baseUrl = REGIONS[region]
    if (!baseUrl) throw new Error(`Unknown Elastic Path region: ${region}`)
    return `${baseUrl}${TOKEN_ENDPOINT}`
  },
  additionalFields: [
    {
      name: 'region',
      label: 'Region',
      type: 'select',
      options: Object.keys(REGIONS).map((r) => ({ value: r, label: r })),
      required: true,
    },
  ],
})
import { verifyElasticPathWebhook, parseElasticPathWebhookEvents } from './webhook'

import {
  transformProduct,
  untransformProduct,
  transformProductVariant,
  type RawEpProduct,
} from './transform/product'
import {
  transformCollection,
  untransformCollection,
  type RawEpHierarchy,
} from './transform/collection'
import { syntheticLocation, SYNTHETIC_LOCATION_ID } from './transform/location'
import {
  transformInventoryLevel,
  type RawEpInventory,
} from './transform/inventory'
import {
  transformCustomer,
  untransformCustomer,
  type RawEpCustomer,
} from './transform/customer'
import {
  transformOrder,
  untransformOrder,
  type RawEpOrder,
  type RawEpLineItem,
} from './transform/order'
import {
  transformRefund,
  type RawEpRefundTransaction,
} from './transform/refund'
import {
  transformTransaction,
  type RawEpTransaction,
} from './transform/transaction'
import {
  transformDiscount,
  untransformDiscount,
  type RawEpPromotion,
} from './transform/discount'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawEpFulfillment,
} from './transform/fulfillment'

export interface ElasticPathAdapterConfig {
  region?: string
  clientId?: string
  clientSecret?: string
}

export class ElasticPathAdapter implements EcommerceAdapter {
  readonly platform = 'elasticpath'
  readonly version = '0.1.0'

  credentialFields = CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  private configRegion: string | undefined
  private configClientId: string | undefined
  private configClientSecret: string | undefined

  constructor(config: ElasticPathAdapterConfig = {}) {
    this.configRegion = config.region
    this.configClientId = config.clientId
    this.configClientSecret = config.clientSecret
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    const baseUrl = resolveBaseUrl(this.configRegion)
    return buildAuthUrl(baseUrl)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return epExchangeCode()
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return epRefreshCredentials(credentials)
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyElasticPathWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseElasticPathWebhookEvents(payload)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): EpClient {
    const region =
      (credentials.extra?.['region'] as string | undefined) ?? this.configRegion
    const baseUrl =
      (credentials.extra?.['baseUrl'] as string | undefined) ??
      REGIONS[region ?? DEFAULT_REGION]
    const clientId =
      (credentials.extra?.['clientId'] as string | undefined) ?? this.configClientId
    const clientSecret =
      (credentials.extra?.['clientSecret'] as string | undefined) ?? this.configClientSecret

    if (!baseUrl) {
      throw new Error(
        'Elastic Path adapter is missing baseUrl — either configure a region or ' +
          'POST it to /v1/connections with credentials: {clientId, clientSecret, region}.',
      )
    }
    if (!credentials.accessToken && (!clientId || !clientSecret)) {
      throw new Error(
        'Elastic Path adapter needs either an accessToken or (clientId + clientSecret) ' +
          'to mint one. Re-create the connection with the required fields.',
      )
    }

    const mergedCreds: Credentials = {
      ...credentials,
      accessToken: credentials.accessToken || 'pending',
      extra: {
        ...credentials.extra,
        baseUrl,
        ...(region ? { region } : {}),
        ...(clientId ? { clientId } : {}),
        ...(clientSecret ? { clientSecret } : {}),
      },
    }
    return new EpClient(mergedCreds)
  }

  private pageParams(params: QueryParams): { offset: number; limit: number } {
    const page = params.page ?? 1
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    return {
      offset: (page - 1) * limit,
      limit,
    }
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const { offset, limit } = this.pageParams(params)
    const res = await this.clientFor(credentials).list<EpResource>(
      '/pcm/products',
      { offset, limit },
    )
    return res.items.map((p) => transformProduct(p as unknown as RawEpProduct))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const client = this.clientFor(credentials)
    const raw = await client.get<EpResource>(`/pcm/products/${encodeURIComponent(id)}`)
    const product = raw as unknown as RawEpProduct

    // Fetch child products (variants)
    let children: RawEpProduct[] | undefined
    try {
      const childRes = await client.list<EpResource>(
        `/pcm/products/${encodeURIComponent(id)}/children`,
        { limit: 100 },
      )
      if (childRes.items.length > 0) {
        children = childRes.items as unknown as RawEpProduct[]
      }
    } catch {
      children = undefined
    }

    return transformProduct(product, children)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const body = untransformProduct(data)
    const res = await this.clientFor(credentials).post<EpResource>('/pcm/products', body)
    return transformProduct(res as unknown as RawEpProduct)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const body = untransformProduct(data)
    const jsonApiBody = body as { data: Record<string, unknown> }
    jsonApiBody.data['id'] = id
    const res = await this.clientFor(credentials).put<EpResource>(
      `/pcm/products/${encodeURIComponent(id)}`,
      jsonApiBody,
    )
    return transformProduct(res as unknown as RawEpProduct)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`/pcm/products/${encodeURIComponent(id)}`)
  }

  // ── Variants ──────────────────────────────────────────────────────────────

  async listVariants(credentials: Credentials, params: QueryParams): Promise<ProductVariant[]> {
    const productId = (params['productId'] ?? params['product_id']) as string | undefined
    if (!productId) {
      throw new Error(
        'Elastic Path requires ?productId= for listVariants; variants are children of a parent product.',
      )
    }
    const { offset, limit } = this.pageParams(params)
    const res = await this.clientFor(credentials).list<EpResource>(
      `/pcm/products/${encodeURIComponent(productId)}/children`,
      { offset, limit },
    )
    return res.items.map((c) =>
      transformProductVariant(c as unknown as RawEpProduct, productId),
    )
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    const raw = await this.clientFor(credentials).get<EpResource>(
      `/pcm/products/${encodeURIComponent(id)}`,
    )
    // Parent relationship not directly available on the child; leave blank
    return transformProductVariant(raw as unknown as RawEpProduct, '')
  }

  // ── Collections ───────────────────────────────────────────────────────────

  async listCollections(credentials: Credentials, params: QueryParams): Promise<Collection[]> {
    const { offset, limit } = this.pageParams(params)
    const res = await this.clientFor(credentials).list<EpResource>(
      '/pcm/hierarchies',
      { offset, limit },
    )
    return res.items.map((h) => transformCollection(h as unknown as RawEpHierarchy))
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const raw = await this.clientFor(credentials).get<EpResource>(
      `/pcm/hierarchies/${encodeURIComponent(id)}`,
    )
    return transformCollection(raw as unknown as RawEpHierarchy)
  }

  async createCollection(credentials: Credentials, data: Partial<Collection>): Promise<Collection> {
    const body = untransformCollection(data)
    const res = await this.clientFor(credentials).post<EpResource>('/pcm/hierarchies', body)
    return transformCollection(res as unknown as RawEpHierarchy)
  }

  async updateCollection(
    credentials: Credentials,
    id: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const body = untransformCollection(data)
    const jsonApiBody = body as { data: Record<string, unknown> }
    jsonApiBody.data['id'] = id
    const res = await this.clientFor(credentials).put<EpResource>(
      `/pcm/hierarchies/${encodeURIComponent(id)}`,
      jsonApiBody,
    )
    return transformCollection(res as unknown as RawEpHierarchy)
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`/pcm/hierarchies/${encodeURIComponent(id)}`)
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  async listLocations(_credentials: Credentials, _params: QueryParams): Promise<Location[]> {
    return [syntheticLocation()]
  }

  async getLocation(_credentials: Credentials, id: string): Promise<Location> {
    if (id !== SYNTHETIC_LOCATION_ID) {
      throw new Error(`Elastic Path: unknown location id '${id}'`)
    }
    return syntheticLocation()
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    // Elastic Path inventory is per-product. If a productId/variantId is given,
    // fetch that single inventory record.
    const productId = (params['productId'] ?? params['product_id'] ?? params['variantId']) as
      | string
      | undefined
    if (productId) {
      try {
        const raw = await this.clientFor(credentials).get<EpResource>(
          `/v2/inventories/${encodeURIComponent(productId)}`,
        )
        return [transformInventoryLevel(raw as unknown as RawEpInventory, productId)]
      } catch {
        return []
      }
    }
    // Without a product ID, we cannot enumerate all inventory. Return empty.
    return []
  }

  async getInventoryLevel(credentials: Credentials, id: string): Promise<InventoryLevel> {
    // id is the productId (or productId:locationId composite)
    const productId = id.includes(':') ? id.split(':')[0]! : id
    const raw = await this.clientFor(credentials).get<EpResource>(
      `/v2/inventories/${encodeURIComponent(productId)}`,
    )
    return transformInventoryLevel(raw as unknown as RawEpInventory, productId)
  }

  async adjustInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; delta: number },
  ): Promise<InventoryLevel> {
    const client = this.clientFor(credentials)
    const action = data.delta >= 0 ? 'increment' : 'decrement'
    await client.post(
      `/v2/inventories/${encodeURIComponent(data.variantId)}/transactions`,
      {
        data: {
          type: 'stock-transaction',
          action,
          quantity: Math.abs(data.delta),
        },
      },
    )
    // Re-fetch to get updated levels
    const raw = await client.get<EpResource>(
      `/v2/inventories/${encodeURIComponent(data.variantId)}`,
    )
    return transformInventoryLevel(raw as unknown as RawEpInventory, data.variantId)
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    // Read-modify-write: get current, compute delta, then adjust
    const client = this.clientFor(credentials)
    let currentAvailable = 0
    try {
      const raw = await client.get<EpResource>(
        `/v2/inventories/${encodeURIComponent(data.variantId)}`,
      )
      currentAvailable = (raw as unknown as RawEpInventory).available ?? 0
    } catch {
      // No existing inventory; treat as 0
    }
    const delta = data.available - currentAvailable
    if (delta !== 0) {
      return this.adjustInventoryLevel(credentials, {
        variantId: data.variantId,
        locationId: data.locationId,
        delta,
      })
    }
    // No change needed
    const raw = await client.get<EpResource>(
      `/v2/inventories/${encodeURIComponent(data.variantId)}`,
    )
    return transformInventoryLevel(raw as unknown as RawEpInventory, data.variantId)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const { offset, limit } = this.pageParams(params)
    const res = await this.clientFor(credentials).list<EpResource>(
      '/v2/customers',
      { offset, limit },
    )
    return res.items.map((c) => transformCustomer(c as unknown as RawEpCustomer))
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const raw = await this.clientFor(credentials).get<EpResource>(
      `/v2/customers/${encodeURIComponent(id)}`,
    )
    return transformCustomer(raw as unknown as RawEpCustomer)
  }

  async createCustomer(credentials: Credentials, data: Partial<Customer>): Promise<Customer> {
    const body = untransformCustomer(data)
    const res = await this.clientFor(credentials).post<EpResource>('/v2/customers', body)
    return transformCustomer(res as unknown as RawEpCustomer)
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const body = untransformCustomer(data)
    const jsonApiBody = body as { data: Record<string, unknown> }
    jsonApiBody.data['id'] = id
    const res = await this.clientFor(credentials).put<EpResource>(
      `/v2/customers/${encodeURIComponent(id)}`,
      jsonApiBody,
    )
    return transformCustomer(res as unknown as RawEpCustomer)
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`/v2/customers/${encodeURIComponent(id)}`)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const { offset, limit } = this.pageParams(params)
    const res = await this.clientFor(credentials).list<EpResource>(
      '/v2/orders',
      { offset, limit },
    )
    return res.items.map((o) => transformOrder(o as unknown as RawEpOrder))
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = this.clientFor(credentials)
    const raw = await client.get<EpResource>(`/v2/orders/${encodeURIComponent(id)}`)
    // Fetch line items
    let lineItems: RawEpLineItem[] | undefined
    try {
      const itemRes = await client.list<EpResource>(
        `/v2/orders/${encodeURIComponent(id)}/items`,
        { limit: 100 },
      )
      lineItems = itemRes.items as unknown as RawEpLineItem[]
    } catch {
      lineItems = undefined
    }
    return transformOrder(raw as unknown as RawEpOrder, lineItems)
  }

  async updateOrder(
    credentials: Credentials,
    id: string,
    data: Partial<Order>,
  ): Promise<Order> {
    const body = untransformOrder(data)
    const jsonApiBody = body as { data: Record<string, unknown> }
    jsonApiBody.data['id'] = id
    const res = await this.clientFor(credentials).put<EpResource>(
      `/v2/orders/${encodeURIComponent(id)}`,
      jsonApiBody,
    )
    return transformOrder(res as unknown as RawEpOrder)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Order> {
    const res = await this.clientFor(credentials).put<EpResource>(
      `/v2/orders/${encodeURIComponent(id)}`,
      {
        data: {
          type: 'order',
          id,
          status: 'cancelled',
        },
      },
    )
    return transformOrder(res as unknown as RawEpOrder)
  }

  // ── Fulfillments ──────────────────────────────────────────────────────────

  /**
   * List fulfillments for an order. Requires `?orderId=` in params.
   * Elastic Path exposes fulfillments under /v2/orders/{orderId}/fulfillments.
   */
  async listFulfillments(credentials: Credentials, params: QueryParams): Promise<Fulfillment[]> {
    const orderId = (params['orderId'] ?? params['order_id']) as string | undefined
    if (!orderId) {
      throw new Error(
        'Elastic Path requires ?orderId= for listFulfillments; fulfillments are scoped to an order.',
      )
    }
    const res = await this.clientFor(credentials).list<EpResource>(
      `/v2/orders/${encodeURIComponent(orderId)}/fulfillments`,
    )
    return res.items.map((f) =>
      transformFulfillment(f as unknown as RawEpFulfillment, orderId),
    )
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    // id format: "{orderId}:{fulfillmentId}" or just fulfillmentId if orderId known
    const [orderId, fulfillmentId] = id.includes(':') ? id.split(':') : ['', id]
    if (!orderId) {
      throw new Error(
        'Elastic Path getFulfillment: pass id as "{orderId}:{fulfillmentId}" to supply the order context.',
      )
    }
    const raw = await this.clientFor(credentials).get<EpResource>(
      `/v2/orders/${encodeURIComponent(orderId)}/fulfillments/${encodeURIComponent(fulfillmentId!)}`,
    )
    return transformFulfillment(raw as unknown as RawEpFulfillment, orderId)
  }

  async createFulfillment(credentials: Credentials, data: Partial<Fulfillment>): Promise<Fulfillment> {
    if (!data.orderId) {
      throw new Error('Elastic Path createFulfillment requires orderId')
    }
    const body = untransformFulfillment(data)
    const res = await this.clientFor(credentials).post<EpResource>(
      `/v2/orders/${encodeURIComponent(data.orderId)}/fulfillments`,
      body,
    )
    return transformFulfillment(res as unknown as RawEpFulfillment, data.orderId)
  }

  // ── Refunds ───────────────────────────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const orderId = (params['orderId'] ?? params['order_id']) as string | undefined
    if (!orderId) {
      throw new Error(
        'Elastic Path requires ?orderId= for listRefunds; refunds are order transactions.',
      )
    }
    const res = await this.clientFor(credentials).list<EpResource>(
      `/v2/orders/${encodeURIComponent(orderId)}/transactions`,
    )
    return res.items
      .filter((t) => (t as unknown as RawEpRefundTransaction).transaction_type === 'refund')
      .map((t) => transformRefund(t as unknown as RawEpRefundTransaction, orderId))
  }

  async getRefund(_credentials: Credentials, _id: string): Promise<Refund> {
    // Refund ID includes orderId:transactionId format for lookup
    // Or the caller passes the transaction ID directly; we need orderId from params
    // For simplicity, treat id as the transaction id and search recent orders
    throw new Error(
      'Elastic Path getRefund requires orderId context. Use listRefunds with ?orderId= instead.',
    )
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.orderId) {
      throw new Error('Elastic Path createRefund requires orderId')
    }
    const amount = data.amount?.amount != null ? Math.round(data.amount.amount * 100) : 0
    const res = await this.clientFor(credentials).post<EpResource>(
      `/v2/orders/${encodeURIComponent(data.orderId)}/transactions`,
      {
        data: {
          type: 'transaction',
          transaction_type: 'refund',
          amount,
        },
      },
    )
    return transformRefund(res as unknown as RawEpRefundTransaction, data.orderId)
  }

  // ── Transactions ──────────────────────────────────────────────────────────

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const orderId = (params['orderId'] ?? params['order_id']) as string | undefined
    if (!orderId) {
      throw new Error(
        'Elastic Path requires ?orderId= for listTransactions.',
      )
    }
    const res = await this.clientFor(credentials).list<EpResource>(
      `/v2/orders/${encodeURIComponent(orderId)}/transactions`,
    )
    return res.items.map((t) => transformTransaction(t as unknown as RawEpTransaction, orderId))
  }

  async getTransaction(_credentials: Credentials, _id: string): Promise<Transaction> {
    throw new Error(
      'Elastic Path getTransaction requires orderId context. Use listTransactions with ?orderId= instead.',
    )
  }

  async createTransaction(credentials: Credentials, data: Partial<Transaction>): Promise<Transaction> {
    if (!data.orderId) {
      throw new Error('Elastic Path createTransaction requires orderId')
    }
    let txType = 'purchase'
    switch (data.kind) {
      case 'AUTHORIZATION':
        txType = 'authorize'
        break
      case 'CAPTURE':
        txType = 'capture'
        break
      case 'REFUND':
        txType = 'refund'
        break
      case 'SALE':
      default:
        txType = 'purchase'
        break
    }
    const amount = data.amount?.amount != null ? Math.round(data.amount.amount * 100) : 0
    const res = await this.clientFor(credentials).post<EpResource>(
      `/v2/orders/${encodeURIComponent(data.orderId)}/transactions`,
      {
        data: {
          type: 'transaction',
          transaction_type: txType,
          gateway: data.gateway ?? 'manual',
          amount,
        },
      },
    )
    return transformTransaction(res as unknown as RawEpTransaction, data.orderId)
  }

  // ── Discounts ─────────────────────────────────────────────────────────────

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const { offset, limit } = this.pageParams(params)
    const res = await this.clientFor(credentials).list<EpResource>(
      '/v2/promotions',
      { offset, limit },
    )
    return res.items.map((p) => transformDiscount(p as unknown as RawEpPromotion))
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const raw = await this.clientFor(credentials).get<EpResource>(
      `/v2/promotions/${encodeURIComponent(id)}`,
    )
    return transformDiscount(raw as unknown as RawEpPromotion)
  }

  async createDiscount(credentials: Credentials, data: Partial<Discount>): Promise<Discount> {
    const body = untransformDiscount(data)
    const res = await this.clientFor(credentials).post<EpResource>('/v2/promotions', body)
    return transformDiscount(res as unknown as RawEpPromotion)
  }

  async updateDiscount(
    credentials: Credentials,
    id: string,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const body = untransformDiscount(data)
    const jsonApiBody = body as { data: Record<string, unknown> }
    jsonApiBody.data['id'] = id
    const res = await this.clientFor(credentials).put<EpResource>(
      `/v2/promotions/${encodeURIComponent(id)}`,
      jsonApiBody,
    )
    return transformDiscount(res as unknown as RawEpPromotion)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`/v2/promotions/${encodeURIComponent(id)}`)
  }
}
