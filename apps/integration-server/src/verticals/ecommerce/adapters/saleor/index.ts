/**
 * Saleor adapter for the ecommerce vertical.
 *
 * Maps the Saleor GraphQL API to the canonical ecommerce resources.
 * Saleor uses long-lived App tokens — `refreshCredentials` is a no-op.
 *
 * This is the first pure-GraphQL adapter in the monorepo. All API
 * communication uses plain `axios.post` against the single `/graphql/`
 * endpoint.
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  pageLocally,
  reportUpstreamPage,
} from '@opensteward/shared'
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

import { buildAuthUrl, exchangeCode as saleorExchangeCode } from './auth'
import { SaleorClient } from './client'
import { SALEOR_FORM } from './connect-form'
import { DEFAULT_CHANNEL, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { verifySaleorWebhook, parseSaleorWebhookEvents } from './webhook'

import { transformProduct, untransformProduct, type RawSaleorProduct } from './transform/product'
import { transformVariant, untransformVariant, type RawSaleorVariant } from './transform/variant'
import {
  transformCollection,
  untransformCollection,
  type RawSaleorCollection,
} from './transform/collection'
import { transformLocation, type RawSaleorWarehouse } from './transform/location'
import { transformInventoryLevel, type RawSaleorStock } from './transform/inventory'
import {
  transformCustomer,
  untransformCustomer,
  type RawSaleorCustomer,
} from './transform/customer'
import { transformOrder, untransformOrder, type RawSaleorOrder } from './transform/order'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawSaleorFulfillment,
} from './transform/fulfillment'
import { transformRefund, untransformRefund, type RawSaleorRefundEvent } from './transform/refund'
import {
  transformTransaction,
  untransformTransaction,
  type RawSaleorTransaction,
} from './transform/transaction'
import { transformDiscount, untransformDiscount, type RawSaleorVoucher } from './transform/discount'

// ── Selections ──────────────────────────────────────────────────────────────
//
// Each field below is on its type in docs.saleor.io/api-reference (and in
// saleor/graphql/schema.graphql). Product.variants is the plain, argument-less
// `[ProductVariant!]` list; Voucher has no `created`; User has no `phone`.

const PRODUCT_FIELDS = `
  id name description slug
  productType { id name }
  attributes { attribute { id name slug } values { id name slug } }
  variants {
    id name sku
    pricing(address: {}) { price { gross { amount currency } } }
    weight { value unit }
    product { id }
  }
  media { id url alt }
  created updatedAt
`

const ADDRESS_FIELDS = `streetAddress1 streetAddress2 city countryArea postalCode country { code }`

const CUSTOMER_FIELDS = `
  id email firstName lastName
  defaultShippingAddress { ${ADDRESS_FIELDS} }
  addresses { ${ADDRESS_FIELDS} }
  dateJoined updatedAt
`

const ORDER_FIELDS = `
  id number status
  user { id email }
  userEmail
  total { gross { amount currency } }
  subtotal { gross { amount currency } }
  shippingPrice { gross { amount currency } }
  billingAddress { ${ADDRESS_FIELDS} }
  shippingAddress { ${ADDRESS_FIELDS} }
  lines {
    id productName productSku quantity
    unitPrice { gross { amount currency } }
    variant { id product { id } }
  }
  fulfillments { id status trackingNumber }
  voucherCode
  created updatedAt
`

const VOUCHER_FIELDS = `
  id name code
  discountValueType discountValue
  currency type
  usageLimit used
  startDate endDate
  applyOncePerOrder
  minSpent { amount currency }
  products(first: 100) { edges { node { id } } pageInfo { hasNextPage } }
  collections(first: 100) { edges { node { id } } pageInfo { hasNextPage } }
`

const TRANSACTION_FIELDS = `
  id createdAt pspReference
  order { id }
  events { type amount { amount currency } createdAt }
`

export interface SaleorAdapterConfig {
  /** Full GraphQL endpoint URL, e.g. `https://mystore.saleor.cloud/graphql/` */
  apiUrl: string
  /** Pre-provisioned App token. */
  appToken: string
  /** Channel slug for pricing and availability (defaults to `default-channel`). */
  channelSlug?: string
}

/** Saleor answers a lookup of an unknown id with `null`, not an error. */
function notFound(resource: string, id: string): Error {
  return Object.assign(new Error(`Saleor ${resource} ${id} not found`), {
    statusCode: 404,
    code: 'NOT_FOUND',
  })
}

export class SaleorAdapter implements EcommerceAdapter {
  // Connect Link support — GraphQL API URL, App token, optional channel slug (see ./connect-form).
  credentialFields = SALEOR_FORM.credentialFields
  exchangeCredentials = SALEOR_FORM.exchangeCredentials

  readonly platform = 'saleor'
  readonly version = '0.1.0'
  /** docs.saleor.io/api-usage/pagination: "The system only allows fetching up to 100 objects in a single query." */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  private apiUrl: string
  private appToken: string
  private channelSlug: string

  constructor(config: SaleorAdapterConfig) {
    this.apiUrl = config.apiUrl
    this.appToken = config.appToken
    this.channelSlug = config.channelSlug ?? DEFAULT_CHANNEL
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(this.apiUrl, state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return saleorExchangeCode(code, this.apiUrl, this.channelSlug)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifySaleorWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    const event =
      (payload['__event'] as string | undefined) ?? (payload['event'] as string | undefined)
    return parseSaleorWebhookEvents(payload, event)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): SaleorClient {
    return new SaleorClient(credentials)
  }

  private channel(credentials: Credentials): string {
    const extra = (credentials.extra ?? {}) as Record<string, string>
    return extra['channelSlug'] ?? this.channelSlug
  }

  private pageSize(params: QueryParams): number {
    return params.limit ?? DEFAULT_PAGE_SIZE
  }

  /**
   * The caller's page of a root connection, by Relay cursor.
   *
   * `first` is the caller's limit, clamped to Saleor's 100; the cursor that
   * starts page N is the `endCursor` of page N-1, which the shared cursor pager
   * walks and remembers. `hasMore` is Saleor's `pageInfo.hasNextPage`.
   * `vars` are the query's filters (the channel), and are part of the key.
   */
  private async connectionList<T>(
    credentials: Credentials,
    params: QueryParams,
    dataKey: string,
    gql: string,
    vars: Record<string, unknown>,
  ): Promise<T[]> {
    const client = this.clientFor(credentials)
    const asked = params.limit ?? DEFAULT_PAGE_SIZE
    if (!Number.isFinite(asked) || asked < 1) {
      throw Object.assign(new Error(`limit must be a whole number ≥ 1 (got ${asked})`), {
        statusCode: 400,
        code: 'VALIDATION',
      })
    }
    const first = Math.min(Math.floor(asked), MAX_PAGE_SIZE)
    const key = cursorPagerKey(connectionScope(client.endpoint, credentials), dataKey, {
      ...vars,
      first,
    })
    const page = await pageByCursor<T, string>(key, params.page, (after) =>
      client.connectionPage<T>(gql, { ...vars, first, after: after ?? null }, dataKey),
    )
    reportUpstreamPage(
      params,
      first < asked ? { hasMore: page.hasMore, pageSize: first } : { hasMore: page.hasMore },
    )
    return page.items
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const channel = this.channel(credentials)
    const gql = `
      query Products($first: Int!, $after: String, $channel: String) {
        products(first: $first, after: $after, channel: $channel) {
          edges { node { ${PRODUCT_FIELDS} } }
          pageInfo { hasNextPage endCursor }
        }
      }
    `
    const items = await this.connectionList<RawSaleorProduct>(
      credentials,
      params,
      'products',
      gql,
      { channel },
    )
    return items.map((raw) => transformProduct(raw))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const client = this.clientFor(credentials)
    const channel = this.channel(credentials)
    const gql = `
      query Product($id: ID!, $channel: String) {
        product(id: $id, channel: $channel) { ${PRODUCT_FIELDS} }
      }
    `
    const data = await client.query<{ product: RawSaleorProduct | null }>(gql, { id, channel })
    if (!data.product) throw notFound('product', id)
    return transformProduct(data.product)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const client = this.clientFor(credentials)
    const input = untransformProduct(data)
    const gql = `
      mutation ProductCreate($input: ProductCreateInput!) {
        productCreate(input: $input) {
          product {
            id name description slug isPublished
            productType { id name }
            variants(first: 100) { edges { node { id name sku product { id } } } }
            media { id url alt }
            created updatedAt
          }
          errors { field message code }
        }
      }
    `
    const res = await client.mutate<{ productCreate: { product: RawSaleorProduct } }>(gql, {
      input,
    })
    return transformProduct(res.productCreate.product)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const client = this.clientFor(credentials)
    const input = untransformProduct(data)
    const gql = `
      mutation ProductUpdate($id: ID!, $input: ProductInput!) {
        productUpdate(id: $id, input: $input) {
          product {
            id name description slug isPublished
            productType { id name }
            variants(first: 100) { edges { node { id name sku product { id } } } }
            media { id url alt }
            created updatedAt
          }
          errors { field message code }
        }
      }
    `
    const res = await client.mutate<{ productUpdate: { product: RawSaleorProduct } }>(gql, {
      id,
      input,
    })
    return transformProduct(res.productUpdate.product)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    const client = this.clientFor(credentials)
    const gql = `
      mutation ProductDelete($id: ID!) {
        productDelete(id: $id) {
          errors { field message code }
        }
      }
    `
    await client.mutate(gql, { id })
  }

  // ── Variants ──────────────────────────────────────────────────────────────

  async listVariants(credentials: Credentials, params: QueryParams): Promise<ProductVariant[]> {
    const client = this.clientFor(credentials)
    const channel = this.channel(credentials)
    const gql = `
      query ProductVariants($first: Int!, $after: String, $channel: String) {
        productVariants(first: $first, after: $after, channel: $channel) {
          edges {
            node {
              id name sku
              pricing(address: {}) { price { gross { amount currency } } }
              weight { value unit }
              product { id }
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    `
    const items = await client.paginateConnection<RawSaleorVariant>(
      gql,
      { first: this.pageSize(params), channel },
      'productVariants',
    )
    return items.map((raw) => transformVariant(raw, channel))
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    const client = this.clientFor(credentials)
    const channel = this.channel(credentials)
    const gql = `
      query ProductVariant($id: ID!, $channel: String) {
        productVariant(id: $id, channel: $channel) {
          id name sku
          pricing(address: {}) { price { gross { amount currency } } }
          weight { value unit }
          product { id }
        }
      }
    `
    const data = await client.query<{ productVariant: RawSaleorVariant }>(gql, { id, channel })
    return transformVariant(data.productVariant, channel)
  }

  async createVariant(
    credentials: Credentials,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const client = this.clientFor(credentials)
    const channel = this.channel(credentials)
    const input = {
      ...untransformVariant(data),
      product: data.productId,
    }
    const gql = `
      mutation ProductVariantCreate($input: ProductVariantCreateInput!) {
        productVariantCreate(input: $input) {
          productVariant {
            id name sku
            pricing(address: {}) { price { gross { amount currency } } }
            weight { value unit }
            product { id }
          }
          errors { field message code }
        }
      }
    `
    const res = await client.mutate<{ productVariantCreate: { productVariant: RawSaleorVariant } }>(
      gql,
      { input },
    )
    return transformVariant(res.productVariantCreate.productVariant, channel)
  }

  async updateVariant(
    credentials: Credentials,
    id: string,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const client = this.clientFor(credentials)
    const channel = this.channel(credentials)
    const input = untransformVariant(data)
    const gql = `
      mutation ProductVariantUpdate($id: ID!, $input: ProductVariantInput!) {
        productVariantUpdate(id: $id, input: $input) {
          productVariant {
            id name sku
            pricing(address: {}) { price { gross { amount currency } } }
            weight { value unit }
            product { id }
          }
          errors { field message code }
        }
      }
    `
    const res = await client.mutate<{ productVariantUpdate: { productVariant: RawSaleorVariant } }>(
      gql,
      { id, input },
    )
    return transformVariant(res.productVariantUpdate.productVariant, channel)
  }

  async deleteVariant(credentials: Credentials, id: string): Promise<void> {
    const client = this.clientFor(credentials)
    const gql = `
      mutation ProductVariantDelete($id: ID!) {
        productVariantDelete(id: $id) {
          errors { field message code }
        }
      }
    `
    await client.mutate(gql, { id })
  }

  // ── Collections ───────────────────────────────────────────────────────────

  async listCollections(credentials: Credentials, params: QueryParams): Promise<Collection[]> {
    const client = this.clientFor(credentials)
    const channel = this.channel(credentials)
    const gql = `
      query Collections($first: Int!, $channel: String!, $after: String) {
        collections(first: $first, channel: $channel, after: $after) {
          edges {
            node {
              id name slug description
              backgroundImage { url alt }
              products(first: 100) { edges { node { id } } }
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    `
    const items = await client.paginateConnection<RawSaleorCollection>(
      gql,
      { first: this.pageSize(params), channel },
      'collections',
    )
    return items.map(transformCollection)
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const client = this.clientFor(credentials)
    const gql = `
      query Collection($id: ID!) {
        collection(id: $id) {
          id name slug description
          backgroundImage { url alt }
          products(first: 100) { edges { node { id } } }
        }
      }
    `
    const data = await client.query<{ collection: RawSaleorCollection }>(gql, { id })
    return transformCollection(data.collection)
  }

  async createCollection(credentials: Credentials, data: Partial<Collection>): Promise<Collection> {
    const client = this.clientFor(credentials)
    const input = untransformCollection(data)
    const gql = `
      mutation CollectionCreate($input: CollectionCreateInput!) {
        collectionCreate(input: $input) {
          collection { id name slug description backgroundImage { url alt } }
          errors { field message code }
        }
      }
    `
    const res = await client.mutate<{ collectionCreate: { collection: RawSaleorCollection } }>(
      gql,
      { input },
    )
    return transformCollection(res.collectionCreate.collection)
  }

  async updateCollection(
    credentials: Credentials,
    id: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const client = this.clientFor(credentials)
    const input = untransformCollection(data)
    const gql = `
      mutation CollectionUpdate($id: ID!, $input: CollectionInput!) {
        collectionUpdate(id: $id, input: $input) {
          collection { id name slug description backgroundImage { url alt } }
          errors { field message code }
        }
      }
    `
    const res = await client.mutate<{ collectionUpdate: { collection: RawSaleorCollection } }>(
      gql,
      { id, input },
    )
    return transformCollection(res.collectionUpdate.collection)
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    const client = this.clientFor(credentials)
    const gql = `
      mutation CollectionDelete($id: ID!) {
        collectionDelete(id: $id) {
          errors { field message code }
        }
      }
    `
    await client.mutate(gql, { id })
  }

  // ── Locations (Warehouses) ────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const client = this.clientFor(credentials)
    const gql = `
      query Warehouses($first: Int!, $after: String) {
        warehouses(first: $first, after: $after) {
          edges {
            node {
              id name isPrivate
              address {
                streetAddress1 streetAddress2 city countryArea postalCode
                country { code country }
                phone
              }
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    `
    const items = await client.paginateConnection<RawSaleorWarehouse>(
      gql,
      { first: this.pageSize(params) },
      'warehouses',
    )
    return items.map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const client = this.clientFor(credentials)
    const gql = `
      query Warehouse($id: ID!) {
        warehouse(id: $id) {
          id name isPrivate
          address {
            streetAddress1 streetAddress2 city countryArea postalCode
            country { code country }
            phone
          }
        }
      }
    `
    const data = await client.query<{ warehouse: RawSaleorWarehouse }>(gql, { id })
    return transformLocation(data.warehouse)
  }

  // ── Inventory (Stock) ─────────────────────────────────────────────────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const client = this.clientFor(credentials)
    const variantId = params['variantId'] ?? params['variant_id']
    if (!variantId) {
      throw new Error('listInventoryLevels requires `variantId` in query params')
    }
    const gql = `
      query VariantStocks($id: ID!) {
        productVariant(id: $id) {
          id
          stocks {
            id
            warehouse { id }
            quantity
            quantityAllocated
          }
        }
      }
    `
    const data = await client.query<{ productVariant: { id: string; stocks: RawSaleorStock[] } }>(
      gql,
      { id: String(variantId) },
    )
    return (data.productVariant.stocks ?? []).map((s) =>
      transformInventoryLevel(s, data.productVariant.id),
    )
  }

  async getInventoryLevel(credentials: Credentials, id: string): Promise<InventoryLevel> {
    // Composite id: `variantId:warehouseId`
    const [variantId, warehouseId] = id.split(':')
    if (!variantId || !warehouseId) {
      throw new Error('Invalid inventory level id format: expected `variantId:warehouseId`')
    }
    const levels = await this.listInventoryLevels(credentials, { variantId } as QueryParams)
    const level = levels.find((l) => l.locationId === warehouseId)
    if (!level) {
      throw new Error(
        `Inventory level not found for variant ${variantId} at warehouse ${warehouseId}`,
      )
    }
    return level
  }

  async adjustInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; delta: number },
  ): Promise<InventoryLevel> {
    // Read current, then set to current + delta
    const current = await this.getInventoryLevel(
      credentials,
      `${data.variantId}:${data.locationId}`,
    )
    const newAvailable = current.available + data.delta
    return this.setInventoryLevel(credentials, {
      variantId: data.variantId,
      locationId: data.locationId,
      available: newAvailable,
    })
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const client = this.clientFor(credentials)
    const gql = `
      mutation StocksUpdate($variantId: ID!, $stocks: [StockInput!]!) {
        productVariantStocksUpdate(variantId: $variantId, stocks: $stocks) {
          productVariant {
            id
            stocks {
              id
              warehouse { id }
              quantity
              quantityAllocated
            }
          }
          errors { field message code }
        }
      }
    `
    const res = await client.mutate<{
      productVariantStocksUpdate: {
        productVariant: { id: string; stocks: RawSaleorStock[] }
      }
    }>(gql, {
      variantId: data.variantId,
      stocks: [{ warehouse: data.locationId, quantity: data.available }],
    })
    const stocks = res.productVariantStocksUpdate.productVariant.stocks ?? []
    const match = stocks.find((s) => s.warehouse?.id === data.locationId)
    if (match) {
      return transformInventoryLevel(match, data.variantId)
    }
    // Fallback
    return {
      id: `${data.variantId}:${data.locationId}`,
      variantId: data.variantId,
      locationId: data.locationId,
      available: data.available,
      metadata: {},
    }
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const gql = `
      query Customers($first: Int!, $after: String) {
        customers(first: $first, after: $after) {
          edges { node { ${CUSTOMER_FIELDS} } }
          pageInfo { hasNextPage endCursor }
        }
      }
    `
    const items = await this.connectionList<RawSaleorCustomer>(
      credentials,
      params,
      'customers',
      gql,
      {},
    )
    return items.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const client = this.clientFor(credentials)
    const gql = `
      query User($id: ID!) {
        user(id: $id) { ${CUSTOMER_FIELDS} }
      }
    `
    const data = await client.query<{ user: RawSaleorCustomer | null }>(gql, { id })
    if (!data.user) throw notFound('customer', id)
    return transformCustomer(data.user)
  }

  async createCustomer(credentials: Credentials, data: Partial<Customer>): Promise<Customer> {
    const client = this.clientFor(credentials)
    const input = untransformCustomer(data)
    const gql = `
      mutation CustomerCreate($input: UserCreateInput!) {
        customerCreate(input: $input) {
          user {
            id email firstName lastName phone
            orders { totalCount }
            dateJoined updatedAt
          }
          errors { field message code }
        }
      }
    `
    const res = await client.mutate<{ customerCreate: { user: RawSaleorCustomer } }>(gql, { input })
    return transformCustomer(res.customerCreate.user)
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const client = this.clientFor(credentials)
    const input = untransformCustomer(data)
    const gql = `
      mutation CustomerUpdate($id: ID!, $input: CustomerInput!) {
        customerUpdate(id: $id, input: $input) {
          user {
            id email firstName lastName phone
            orders { totalCount }
            dateJoined updatedAt
          }
          errors { field message code }
        }
      }
    `
    const res = await client.mutate<{ customerUpdate: { user: RawSaleorCustomer } }>(gql, {
      id,
      input,
    })
    return transformCustomer(res.customerUpdate.user)
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    const client = this.clientFor(credentials)
    const gql = `
      mutation CustomerDelete($id: ID!) {
        customerDelete(id: $id) {
          errors { field message code }
        }
      }
    `
    await client.mutate(gql, { id })
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const channel = this.channel(credentials)
    // orders(channel: String): "Slug of a channel for which the data should be
    // returned." The old filter: { channels } takes channel IDs, not slugs.
    const gql = `
      query Orders($first: Int!, $after: String, $channel: String) {
        orders(first: $first, after: $after, channel: $channel) {
          edges { node { ${ORDER_FIELDS} } }
          pageInfo { hasNextPage endCursor }
        }
      }
    `
    const items = await this.connectionList<RawSaleorOrder>(credentials, params, 'orders', gql, {
      channel,
    })
    return items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = this.clientFor(credentials)
    const gql = `
      query Order($id: ID!) {
        order(id: $id) {
          id number status
          user { id email }
          userEmail
          total { gross { amount currency } }
          subtotal { gross { amount currency } }
          shippingPrice { gross { amount currency } }
          billingAddress {
            streetAddress1 streetAddress2 city countryArea postalCode
            country { code }
          }
          shippingAddress {
            streetAddress1 streetAddress2 city countryArea postalCode
            country { code }
          }
          lines {
            id productName productSku quantity
            unitPrice { gross { amount currency } }
            variant { id product { id } }
          }
          fulfillments { id status trackingNumber }
          voucherCode
          created updatedAt
        }
      }
    `
    const data = await client.query<{ order: RawSaleorOrder }>(gql, { id })
    return transformOrder(data.order)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = this.clientFor(credentials)
    const channel = this.channel(credentials)
    const input = {
      ...untransformOrder(data),
      channelId: channel,
    }
    // Two-step: draft → complete
    const draftGql = `
      mutation DraftOrderCreate($input: DraftOrderCreateInput!) {
        draftOrderCreate(input: $input) {
          order {
            id number status
            user { id email }
            userEmail
            total { gross { amount currency } }
            lines {
              id productName productSku quantity
              unitPrice { gross { amount currency } }
              variant { id product { id } }
            }
            created updatedAt
          }
          errors { field message code }
        }
      }
    `
    const draft = await client.mutate<{ draftOrderCreate: { order: RawSaleorOrder } }>(draftGql, {
      input,
    })
    const draftOrder = draft.draftOrderCreate.order

    const completeGql = `
      mutation DraftOrderComplete($id: ID!) {
        draftOrderComplete(id: $id) {
          order {
            id number status
            user { id email }
            userEmail
            total { gross { amount currency } }
            lines {
              id productName productSku quantity
              unitPrice { gross { amount currency } }
              variant { id product { id } }
            }
            fulfillments { id status trackingNumber }
            created updatedAt
          }
          errors { field message code }
        }
      }
    `
    const completed = await client.mutate<{ draftOrderComplete: { order: RawSaleorOrder } }>(
      completeGql,
      { id: draftOrder.id },
    )
    return transformOrder(completed.draftOrderComplete.order)
  }

  async updateOrder(credentials: Credentials, id: string, data: Partial<Order>): Promise<Order> {
    const client = this.clientFor(credentials)
    const input: Record<string, unknown> = {}
    if (data.email) input['userEmail'] = data.email
    const gql = `
      mutation OrderUpdate($id: ID!, $input: OrderUpdateInput!) {
        orderUpdate(id: $id, input: $input) {
          order {
            id number status
            user { id email }
            userEmail
            total { gross { amount currency } }
            lines {
              id productName productSku quantity
              unitPrice { gross { amount currency } }
              variant { id product { id } }
            }
            fulfillments { id status trackingNumber }
            created updatedAt
          }
          errors { field message code }
        }
      }
    `
    const res = await client.mutate<{ orderUpdate: { order: RawSaleorOrder } }>(gql, { id, input })
    return transformOrder(res.orderUpdate.order)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Order> {
    const client = this.clientFor(credentials)
    const gql = `
      mutation OrderCancel($id: ID!) {
        orderCancel(id: $id) {
          order {
            id number status
            user { id email }
            userEmail
            total { gross { amount currency } }
            lines {
              id productName productSku quantity
              unitPrice { gross { amount currency } }
              variant { id product { id } }
            }
            fulfillments { id status trackingNumber }
            created updatedAt
          }
          errors { field message code }
        }
      }
    `
    const res = await client.mutate<{ orderCancel: { order: RawSaleorOrder } }>(gql, { id })
    return transformOrder(res.orderCancel.order)
  }

  // ── Fulfillments ──────────────────────────────────────────────────────────

  async listFulfillments(credentials: Credentials, params: QueryParams): Promise<Fulfillment[]> {
    const orderId = params['orderId'] ?? params['order_id']
    if (!orderId) {
      throw new Error('listFulfillments requires `orderId` in query params')
    }
    const client = this.clientFor(credentials)
    const gql = `
      query OrderFulfillments($id: ID!) {
        order(id: $id) {
          id
          fulfillments {
            id status trackingNumber fulfillmentOrder
            lines { id quantity orderLine { id } }
            warehouse { id }
            created
          }
        }
      }
    `
    const data = await client.query<{
      order: { id: string; fulfillments: RawSaleorFulfillment[] }
    }>(gql, { id: String(orderId) })
    return (data.order.fulfillments ?? []).map((f) => transformFulfillment(f, data.order.id))
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    // Saleor does not expose a top-level fulfillment query — we search
    // within the order. Callers may pass `orderId:fulfillmentId`.
    const [orderId, fulfillmentId] = id.includes(':') ? id.split(':') : ['', id]
    if (!orderId) {
      throw new Error('getFulfillment requires composite id `orderId:fulfillmentId`')
    }
    const fulfillments = await this.listFulfillments(credentials, { orderId } as QueryParams)
    const match = fulfillments.find((f) => f.id === fulfillmentId)
    if (!match) throw new Error(`Fulfillment ${fulfillmentId} not found on order ${orderId}`)
    return match
  }

  async createFulfillment(
    credentials: Credentials,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    if (!data.orderId) throw new Error('createFulfillment requires orderId')
    const client = this.clientFor(credentials)
    const extra = untransformFulfillment(data)
    const gql = `
      mutation OrderFulfill($order: ID!, $input: FulfillInput!) {
        orderFulfill(order: $order, input: $input) {
          fulfillments {
            id status trackingNumber
            lines { id quantity orderLine { id } }
            warehouse { id }
            created
          }
          errors { field message code }
        }
      }
    `
    const input = {
      lines:
        data.lineItems?.map((li) => ({
          orderLineId: li.lineItemId,
          stocks: data.locationId ? [{ warehouse: data.locationId, quantity: li.quantity }] : [],
        })) ?? [],
      trackingNumber: extra['trackingNumber'],
      notifyCustomer: extra['notifyCustomer'],
    }
    const res = await client.mutate<{
      orderFulfill: { fulfillments: RawSaleorFulfillment[] }
    }>(gql, { order: data.orderId, input })
    const created = res.orderFulfill.fulfillments[0]
    if (!created) throw new Error('No fulfillment returned from orderFulfill')
    return transformFulfillment(created, data.orderId)
  }

  async updateFulfillment(
    credentials: Credentials,
    id: string,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    const client = this.clientFor(credentials)
    const gql = `
      mutation FulfillmentUpdateTracking($id: ID!, $input: FulfillmentUpdateTrackingInput!) {
        fulfillmentUpdateTracking(id: $id, input: $input) {
          fulfillment {
            id status trackingNumber
            lines { id quantity orderLine { id } }
            warehouse { id }
            created
          }
          errors { field message code }
        }
      }
    `
    const res = await client.mutate<{
      fulfillmentUpdateTracking: { fulfillment: RawSaleorFulfillment }
    }>(gql, {
      id,
      input: {
        trackingNumber: data.trackingNumber,
        notifyCustomer: data.notifyCustomer ?? false,
      },
    })
    return transformFulfillment(res.fulfillmentUpdateTracking.fulfillment, data.orderId ?? '')
  }

  async cancelFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    const client = this.clientFor(credentials)
    const gql = `
      mutation FulfillmentCancel($id: ID!) {
        fulfillmentCancel(id: $id) {
          fulfillment {
            id status trackingNumber
            lines { id quantity orderLine { id } }
            warehouse { id }
            created
          }
          errors { field message code }
        }
      }
    `
    const res = await client.mutate<{
      fulfillmentCancel: { fulfillment: RawSaleorFulfillment }
    }>(gql, { id })
    return transformFulfillment(res.fulfillmentCancel.fulfillment)
  }

  // ── Refunds ───────────────────────────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const orderId = params['orderId'] ?? params['order_id']
    if (!orderId) {
      throw new Error('listRefunds requires `orderId` in query params')
    }
    const client = this.clientFor(credentials)
    const gql = `
      query OrderPayments($id: ID!) {
        order(id: $id) {
          id
          payments {
            id
            transactions {
              kind
              amount { amount currency }
              created
            }
          }
        }
      }
    `
    const data = await client.query<{
      order: {
        id: string
        payments: Array<{
          id: string
          transactions: Array<{
            kind: string
            amount: { amount: number; currency: string }
            created: string
          }>
        }>
      }
    }>(gql, { id: String(orderId) })

    const refunds: RawSaleorRefundEvent[] = []
    for (const payment of data.order.payments ?? []) {
      for (let i = 0; i < (payment.transactions ?? []).length; i++) {
        const tx = payment.transactions[i]!
        if (tx.kind?.toUpperCase().includes('REFUND')) {
          refunds.push({
            id: `${data.order.id}:${payment.id}:${i}`,
            orderId: data.order.id,
            amount: tx.amount,
            type: tx.kind,
            createdAt: tx.created,
            transactionId: payment.id,
          })
        }
      }
    }
    return refunds.map(transformRefund)
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    // Composite: orderId:paymentId:eventIndex
    const parts = id.split(':')
    if (parts.length < 3) {
      throw new Error('Invalid refund id format: expected `orderId:paymentId:eventIndex`')
    }
    const orderId = parts[0]!
    const refunds = await this.listRefunds(credentials, { orderId } as QueryParams)
    const match = refunds.find((r) => r.id === id)
    if (!match) throw new Error(`Refund ${id} not found`)
    return match
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.orderId) throw new Error('createRefund requires orderId')
    const client = this.clientFor(credentials)
    const input = untransformRefund(data)
    const gql = `
      mutation OrderRefund($id: ID!, $input: OrderRefundProductsInput!) {
        orderGrantRefundCreate(id: $id, input: $input) {
          order {
            id
            payments {
              id
              transactions {
                kind
                amount { amount currency }
                created
              }
            }
          }
          errors { field message code }
        }
      }
    `
    await client.mutate(gql, { id: data.orderId, input: { amount: input['amount'] } })

    // Fetch latest refunds and return the most recent one
    const refunds = await this.listRefunds(credentials, { orderId: data.orderId } as QueryParams)
    return (
      refunds[refunds.length - 1] ?? {
        id: `${data.orderId}:unknown:0`,
        orderId: data.orderId,
        amount: data.amount,
        metadata: {},
      }
    )
  }

  // ── Transactions ──────────────────────────────────────────────────────────

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const orderId = params['orderId'] ?? params['order_id']
    if (!orderId) {
      // Query.transactions (docs.saleor.io/api-reference/payments/queries/transactions):
      // "List of transactions. For apps with MANAGE_ORDERS permission, returns
      // all transactions. ... Added in Saleor 3.22" — a Relay connection taking
      // first/after, so it pages like the other roots. It has no order filter
      // (TransactionWhereInput), so an orderId call keeps the per-order list below.
      const gql = `
        query Transactions($first: Int!, $after: String) {
          transactions(first: $first, after: $after) {
            edges { node { ${TRANSACTION_FIELDS} } }
            pageInfo { hasNextPage endCursor }
          }
        }
      `
      const items = await this.connectionList<RawSaleorTransaction>(
        credentials,
        params,
        'transactions',
        gql,
        {},
      )
      return items.map(transformTransaction)
    }
    const client = this.clientFor(credentials)
    // Order.transactions is a plain [TransactionItem!]! list: the whole
    // collection for the order in one response, sliced here.
    const gql = `
      query OrderTransactions($id: ID!) {
        order(id: $id) {
          id
          transactions { ${TRANSACTION_FIELDS} }
        }
      }
    `
    const data = await client.query<{
      order: { id: string; transactions: RawSaleorTransaction[] } | null
    }>(gql, { id: String(orderId) })
    if (!data.order) throw notFound('order', String(orderId))
    return pageLocally(data.order.transactions.map(transformTransaction), params)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = this.clientFor(credentials)
    // transaction(id: ID): "Look up a transaction by ID."
    const gql = `
      query Transaction($id: ID!) {
        transaction(id: $id) { ${TRANSACTION_FIELDS} }
      }
    `
    const data = await client.query<{ transaction: RawSaleorTransaction | null }>(gql, { id })
    if (!data.transaction) throw notFound('transaction', id)
    return transformTransaction(data.transaction)
  }

  async createTransaction(
    credentials: Credentials,
    data: Partial<Transaction>,
  ): Promise<Transaction> {
    if (!data.orderId) throw new Error('createTransaction requires orderId')
    const client = this.clientFor(credentials)
    const input = untransformTransaction(data)
    const gql = `
      mutation TransactionCreate($id: ID!, $input: TransactionCreateInput!) {
        transactionCreate(id: $id, transaction: $input) {
          transaction {
            id
            status type
            authorizedAmount { amount currency }
            chargedAmount { amount currency }
            refundedAmount { amount currency }
            pspReference
            events { type amount { amount currency } createdAt }
            order { id }
            createdAt
          }
          errors { field message code }
        }
      }
    `
    const res = await client.mutate<{ transactionCreate: { transaction: RawSaleorTransaction } }>(
      gql,
      {
        id: data.orderId,
        input,
      },
    )
    return transformTransaction(res.transactionCreate.transaction)
  }

  // ── Discounts (Vouchers) ──────────────────────────────────────────────────

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const channel = this.channel(credentials)
    const gql = `
      query Vouchers($first: Int!, $after: String, $channel: String) {
        vouchers(first: $first, after: $after, channel: $channel) {
          edges { node { ${VOUCHER_FIELDS} } }
          pageInfo { hasNextPage endCursor }
        }
      }
    `
    const items = await this.connectionList<RawSaleorVoucher>(
      credentials,
      params,
      'vouchers',
      gql,
      { channel },
    )
    return items.map(transformDiscount)
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const client = this.clientFor(credentials)
    const channel = this.channel(credentials)
    const gql = `
      query Voucher($id: ID!, $channel: String) {
        voucher(id: $id, channel: $channel) { ${VOUCHER_FIELDS} }
      }
    `
    const data = await client.query<{ voucher: RawSaleorVoucher | null }>(gql, { id, channel })
    if (!data.voucher) throw notFound('discount', id)
    return transformDiscount(data.voucher)
  }

  async createDiscount(credentials: Credentials, data: Partial<Discount>): Promise<Discount> {
    const client = this.clientFor(credentials)
    const input = untransformDiscount(data)
    const gql = `
      mutation VoucherCreate($input: VoucherInput!) {
        voucherCreate(input: $input) {
          voucher {
            id name code
            discountValueType discountValue
            currency type
            usageLimit used
            startDate endDate
            created
          }
          errors { field message code }
        }
      }
    `
    const res = await client.mutate<{ voucherCreate: { voucher: RawSaleorVoucher } }>(gql, {
      input,
    })
    return transformDiscount(res.voucherCreate.voucher)
  }

  async updateDiscount(
    credentials: Credentials,
    id: string,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const client = this.clientFor(credentials)
    const input = untransformDiscount(data)
    const gql = `
      mutation VoucherUpdate($id: ID!, $input: VoucherInput!) {
        voucherUpdate(id: $id, input: $input) {
          voucher {
            id name code
            discountValueType discountValue
            currency type
            usageLimit used
            startDate endDate
            created
          }
          errors { field message code }
        }
      }
    `
    const res = await client.mutate<{ voucherUpdate: { voucher: RawSaleorVoucher } }>(gql, {
      id,
      input,
    })
    return transformDiscount(res.voucherUpdate.voucher)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    const client = this.clientFor(credentials)
    const gql = `
      mutation VoucherDelete($id: ID!) {
        voucherDelete(id: $id) {
          errors { field message code }
        }
      }
    `
    await client.mutate(gql, { id })
  }
}
