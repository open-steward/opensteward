/**
 * Crystallize adapter for the ecommerce vertical.
 *
 * Maps the Crystallize GraphQL APIs (Catalogue, PIM, Order) to the canonical
 * ecommerce resources. Crystallize is a PIM+commerce hybrid with a shape-driven
 * catalogue and a separate Order API.
 *
 * Auth: access token ID + secret (created in the Crystallize app), sent as headers.
 * API: GraphQL with separate endpoints for catalogue reads, PIM writes, and orders.
 * Base URL: `https://api.crystallize.com/{tenantIdentifier}/`
 *
 * This is the third pure-GraphQL adapter (after Saleor, Vendure).
 */

import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
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
  CREDENTIAL_FIELDS as CRYSTALLIZE_CREDENTIAL_FIELDS,
  exchangeCredentials as crystallizeExchangeCredentials,
  NO_REDIRECT_MESSAGE,
} from './auth'
import { CrystallizeClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import { verifyCrystallizeWebhook, parseCrystallizeWebhookEvents } from './webhook'

import { transformProduct, untransformProduct, type RawCrystallizeProduct } from './transform/product'
import { transformVariant, untransformVariant, type RawCrystallizeVariant } from './transform/variant'
import { transformCollection, untransformCollection, type RawCrystallizeTopic } from './transform/collection'
import { transformLocation, type RawCrystallizeStockLocation } from './transform/location'
import { transformInventoryLevel, type RawCrystallizeStock } from './transform/inventory'
import { transformCustomer, type RawCrystallizeCustomer } from './transform/customer'
import { transformOrder, untransformOrder, type RawCrystallizeOrder } from './transform/order'
import { transformFulfillment, type RawCrystallizeFulfillment } from './transform/fulfillment'
import { transformRefund, type RawCrystallizeRefund } from './transform/refund'
import { transformTransaction, type RawCrystallizePayment } from './transform/transaction'
import { transformDiscount, untransformDiscount, type RawCrystallizeDiscount } from './transform/discount'

export interface CrystallizeAdapterConfig {
  /**
   * Unused: the tenant and access token are the customer's, collected on the
   * credential form and read from the connection's credentials.
   */
  tenantIdentifier?: string
  /** Unused — see `tenantIdentifier`. */
  accessToken?: string
  /** Default currency for price lookups (defaults to `USD`). */
  defaultCurrency?: string
}

export class CrystallizeAdapter implements EcommerceAdapter {
  readonly platform = 'crystallize'
  readonly version = '0.1.0'

  private defaultCurrency: string

  constructor(config: CrystallizeAdapterConfig = {}) {
    this.defaultCurrency = config.defaultCurrency ?? 'USD'
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  /** Tenant, token ID and token secret — all the customer's, none obtainable by redirect. */
  credentialFields(): CredentialField[] {
    return CRYSTALLIZE_CREDENTIAL_FIELDS
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return crystallizeExchangeCredentials(fields)
  }

  getAuthUrl(_state: string): string {
    throw new Error(NO_REDIRECT_MESSAGE)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error(NO_REDIRECT_MESSAGE)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyCrystallizeWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    const topic =
      (payload['topic'] as string | undefined) ??
      (payload['event'] as string | undefined)
    return parseCrystallizeWebhookEvents(payload, topic)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): CrystallizeClient {
    return new CrystallizeClient(credentials)
  }

  private currency(credentials: Credentials): string {
    const extra = (credentials.extra ?? {}) as Record<string, string>
    return extra['defaultCurrency'] ?? this.defaultCurrency
  }

  private pageSize(params: QueryParams): number {
    return params.limit ?? DEFAULT_PAGE_SIZE
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const client = this.clientFor(credentials)
    const currency = this.currency(credentials)
    const limit = this.pageSize(params)
    const gql = `
      query GetProducts($tenant: String!, $language: String) {
        catalogue(path: "/", language: $language, tenant: $tenant) {
          children {
            ... on Product {
              id
              name
              cataloguePath: path
              shape { identifier name }
              components { name type content { ... on RichTextContent { html plainText } } }
              variants {
                id name sku isDefault
                priceVariants { identifier name price currency }
                attributes { attribute value }
                images { url altText key }
                stock { location stock }
              }
              topics { id name }
              createdAt
              updatedAt
            }
          }
        }
      }
    `
    const data = await client.catalogueQuery<{
      catalogue: { children: RawCrystallizeProduct[] }
    }>(gql, { tenant: client.tenant, language: 'en' })
    const items = (data.catalogue?.children ?? []).slice(0, limit)
    return items.map((raw) => transformProduct(raw, currency))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const client = this.clientFor(credentials)
    const currency = this.currency(credentials)
    const gql = `
      query GetProduct($id: ID!, $language: String) {
        product: node(id: $id, language: $language) {
          ... on Product {
            id name
            cataloguePath: path
            shape { identifier name }
            components { name type content { ... on RichTextContent { html plainText } } }
            variants {
              id name sku isDefault
              priceVariants { identifier name price currency }
              attributes { attribute value }
              images { url altText key }
              stock { location stock }
            }
            topics { id name }
            createdAt updatedAt
          }
        }
      }
    `
    const data = await client.catalogueQuery<{ product: RawCrystallizeProduct }>(gql, {
      id,
      language: 'en',
    })
    return transformProduct(data.product, currency)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const client = this.clientFor(credentials)
    const currency = this.currency(credentials)
    const input = untransformProduct(data)
    const gql = `
      mutation CreateProduct($input: CreateProductInput!) {
        product {
          create(input: $input) {
            id name
            cataloguePath: path
            shape { identifier name }
            variants {
              id name sku isDefault
              priceVariants { identifier name price currency }
              attributes { attribute value }
            }
            createdAt updatedAt
          }
        }
      }
    `
    const res = await client.pimMutate<{ product: { create: RawCrystallizeProduct } }>(gql, {
      input: {
        name: input['name'],
        shapeIdentifier: data.productType ?? 'product',
        tenantId: client.tenant,
      },
    })
    return transformProduct(res.product.create, currency)
  }

  async updateProduct(credentials: Credentials, id: string, data: Partial<Product>): Promise<Product> {
    const client = this.clientFor(credentials)
    const currency = this.currency(credentials)
    const input = untransformProduct(data)
    const gql = `
      mutation UpdateProduct($id: ID!, $input: UpdateProductInput!) {
        product {
          update(id: $id, input: $input) {
            id name
            cataloguePath: path
            shape { identifier name }
            variants {
              id name sku isDefault
              priceVariants { identifier name price currency }
              attributes { attribute value }
            }
            createdAt updatedAt
          }
        }
      }
    `
    const res = await client.pimMutate<{ product: { update: RawCrystallizeProduct } }>(gql, {
      id,
      input: { name: input['name'] },
    })
    return transformProduct(res.product.update, currency)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    const client = this.clientFor(credentials)
    const gql = `
      mutation DeleteProduct($id: ID!) {
        product {
          delete(id: $id)
        }
      }
    `
    await client.pimMutate(gql, { id })
  }

  // ── Variants ──────────────────────────────────────────────────────────────

  async listVariants(credentials: Credentials, params: QueryParams): Promise<ProductVariant[]> {
    const client = this.clientFor(credentials)
    const currency = this.currency(credentials)
    const productId = params['productId'] ?? params['product_id']
    if (!productId) {
      throw new Error('listVariants requires `productId` in query params')
    }
    const gql = `
      query GetProductVariants($id: ID!, $language: String) {
        product: node(id: $id, language: $language) {
          ... on Product {
            id
            variants {
              id name sku isDefault
              priceVariants { identifier name price currency }
              attributes { attribute value }
              images { url altText key }
              stock { location stock }
            }
          }
        }
      }
    `
    const data = await client.catalogueQuery<{
      product: { id: string; variants: RawCrystallizeVariant[] }
    }>(gql, { id: String(productId), language: 'en' })
    return (data.product.variants ?? []).map((v) => {
      v.productId = data.product.id
      return transformVariant(v, currency)
    })
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    // Composite id: `productId:variantId`
    const [productId, variantId] = id.split(':')
    if (!productId || !variantId) {
      throw new Error('getVariant requires composite id `productId:variantId`')
    }
    const variants = await this.listVariants(credentials, { productId } as QueryParams)
    const match = variants.find((v) => v.id === variantId)
    if (!match) {
      throw new Error(`Variant ${variantId} not found on product ${productId}`)
    }
    return match
  }

  async createVariant(credentials: Credentials, data: Partial<ProductVariant>): Promise<ProductVariant> {
    if (!data.productId) throw new Error('createVariant requires productId')
    const client = this.clientFor(credentials)
    const currency = this.currency(credentials)
    const input = untransformVariant(data)
    const gql = `
      mutation CreateVariant($productId: ID!, $input: CreateProductVariantInput!) {
        product {
          addVariant(productId: $productId, input: $input) {
            id name sku isDefault
            priceVariants { identifier name price currency }
            attributes { attribute value }
          }
        }
      }
    `
    const res = await client.pimMutate<{
      product: { addVariant: RawCrystallizeVariant }
    }>(gql, { productId: data.productId, input })
    const raw = res.product.addVariant
    raw.productId = data.productId
    return transformVariant(raw, currency)
  }

  async updateVariant(credentials: Credentials, id: string, data: Partial<ProductVariant>): Promise<ProductVariant> {
    const client = this.clientFor(credentials)
    const currency = this.currency(credentials)
    const input = untransformVariant(data)
    const gql = `
      mutation UpdateVariant($productId: ID!, $variantId: String!, $input: UpdateProductVariantInput!) {
        product {
          updateVariant(productId: $productId, sku: $variantId, input: $input) {
            id name sku isDefault
            priceVariants { identifier name price currency }
            attributes { attribute value }
          }
        }
      }
    `
    const productId = data.productId ?? ''
    const res = await client.pimMutate<{
      product: { updateVariant: RawCrystallizeVariant }
    }>(gql, { productId, variantId: id, input })
    const raw = res.product.updateVariant
    raw.productId = productId
    return transformVariant(raw, currency)
  }

  async deleteVariant(credentials: Credentials, id: string): Promise<void> {
    // Composite: `productId:variantSku`
    const [productId, variantSku] = id.split(':')
    if (!productId || !variantSku) {
      throw new Error('deleteVariant requires composite id `productId:variantSku`')
    }
    const client = this.clientFor(credentials)
    const gql = `
      mutation DeleteVariant($productId: ID!, $sku: String!) {
        product {
          removeVariant(productId: $productId, sku: $sku)
        }
      }
    `
    await client.pimMutate(gql, { productId, sku: variantSku })
  }

  // ── Collections (Topics) ─────────────────────────────────────────────────

  async listCollections(credentials: Credentials, params: QueryParams): Promise<Collection[]> {
    const client = this.clientFor(credentials)
    const limit = this.pageSize(params)
    const gql = `
      query GetTopics($tenant: String!, $language: String) {
        topics: topicMaps(tenant: $tenant, language: $language) {
          id name path
          items(first: 100) { edges { node { id } } }
        }
      }
    `
    const data = await client.catalogueQuery<{
      topics: RawCrystallizeTopic[]
    }>(gql, { tenant: client.tenant, language: 'en' })
    return (data.topics ?? []).slice(0, limit).map(transformCollection)
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const client = this.clientFor(credentials)
    const gql = `
      query GetTopic($id: ID!, $language: String) {
        topic(id: $id, language: $language) {
          id name path
          items(first: 100) { edges { node { id } } }
        }
      }
    `
    const data = await client.catalogueQuery<{ topic: RawCrystallizeTopic }>(gql, {
      id,
      language: 'en',
    })
    return transformCollection(data.topic)
  }

  async createCollection(credentials: Credentials, data: Partial<Collection>): Promise<Collection> {
    const client = this.clientFor(credentials)
    const input = untransformCollection(data)
    const gql = `
      mutation CreateTopic($input: CreateTopicInput!) {
        topic {
          create(input: $input) {
            id name path
          }
        }
      }
    `
    const res = await client.pimMutate<{ topic: { create: RawCrystallizeTopic } }>(gql, {
      input: { name: input['name'], tenantId: client.tenant },
    })
    return transformCollection(res.topic.create)
  }

  async updateCollection(credentials: Credentials, id: string, data: Partial<Collection>): Promise<Collection> {
    const client = this.clientFor(credentials)
    const input = untransformCollection(data)
    const gql = `
      mutation UpdateTopic($id: ID!, $input: UpdateTopicInput!) {
        topic {
          update(id: $id, input: $input) {
            id name path
          }
        }
      }
    `
    const res = await client.pimMutate<{ topic: { update: RawCrystallizeTopic } }>(gql, {
      id,
      input: { name: input['name'] },
    })
    return transformCollection(res.topic.update)
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    const client = this.clientFor(credentials)
    const gql = `
      mutation DeleteTopic($id: ID!) {
        topic {
          delete(id: $id)
        }
      }
    `
    await client.pimMutate(gql, { id })
  }

  // ── Locations (Stock Locations) ───────────────────────────────────────────

  async listLocations(credentials: Credentials, _params: QueryParams): Promise<Location[]> {
    const client = this.clientFor(credentials)
    const gql = `
      query GetStockLocations($tenant: String!) {
        stockLocations: tenant(identifier: $tenant) {
          stockLocations {
            identifier name
            settings { minimum }
          }
        }
      }
    `
    const data = await client.catalogueQuery<{
      stockLocations: { stockLocations: RawCrystallizeStockLocation[] }
    }>(gql, { tenant: client.tenant })
    return (data.stockLocations?.stockLocations ?? []).map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const locations = await this.listLocations(credentials, {} as QueryParams)
    const match = locations.find((l) => l.id === id)
    if (!match) throw new Error(`Stock location ${id} not found`)
    return match
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  async listInventoryLevels(credentials: Credentials, params: QueryParams): Promise<InventoryLevel[]> {
    const variantId = params['variantId'] ?? params['variant_id']
    const productId = params['productId'] ?? params['product_id']
    if (!productId) {
      throw new Error('listInventoryLevels requires `productId` in query params')
    }
    const client = this.clientFor(credentials)
    const gql = `
      query GetProductStock($id: ID!, $language: String) {
        product: node(id: $id, language: $language) {
          ... on Product {
            variants {
              id sku
              stock { location stock }
            }
          }
        }
      }
    `
    const data = await client.catalogueQuery<{
      product: { variants: Array<{ id: string; sku?: string; stock?: RawCrystallizeStock[] }> }
    }>(gql, { id: String(productId), language: 'en' })

    const levels: InventoryLevel[] = []
    for (const v of data.product.variants ?? []) {
      if (variantId && v.id !== variantId) continue
      for (const s of v.stock ?? []) {
        s.variantId = v.id
        levels.push(transformInventoryLevel(s, v.id))
      }
    }
    return levels
  }

  async getInventoryLevel(credentials: Credentials, id: string): Promise<InventoryLevel> {
    // Composite: `productId:variantId:locationId`
    const parts = id.split(':')
    if (parts.length < 3) {
      throw new Error('Invalid inventory level id: expected `productId:variantId:locationId`')
    }
    const [productId, variantId, locationId] = parts
    const levels = await this.listInventoryLevels(credentials, {
      productId,
      variantId,
    } as QueryParams)
    const match = levels.find((l) => l.locationId === locationId)
    if (!match) {
      throw new Error(`Inventory level not found for variant ${variantId} at location ${locationId}`)
    }
    return match
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const client = this.clientFor(credentials)
    const gql = `
      mutation UpdateStock($sku: String!, $stock: Int!, $location: String!) {
        stockUpdate(sku: $sku, stock: $stock, stockLocationIdentifier: $location) {
          sku
          stock
          stockLocationIdentifier
        }
      }
    `
    await client.pimMutate(gql, {
      sku: data.variantId,
      stock: data.available,
      location: data.locationId,
    })
    return {
      id: `${data.variantId}:${data.locationId}`,
      variantId: data.variantId,
      locationId: data.locationId,
      available: data.available,
      onHand: data.available,
      metadata: {},
    }
  }

  async adjustInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; delta: number },
  ): Promise<InventoryLevel> {
    // Read current stock, then set absolute value
    const levels = await this.listInventoryLevels(credentials, {
      productId: data.variantId,
      variantId: data.variantId,
    } as QueryParams)
    const current = levels.find((l) => l.locationId === data.locationId)
    const newAvailable = (current?.available ?? 0) + data.delta
    return this.setInventoryLevel(credentials, {
      variantId: data.variantId,
      locationId: data.locationId,
      available: newAvailable,
    })
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const client = this.clientFor(credentials)
    const limit = this.pageSize(params)
    const gql = `
      query GetCustomers($tenant: String!) {
        orders: getOrders(tenant: $tenant) {
          edges {
            node {
              customer {
                identifier firstName lastName email phone
                addresses { type street street2 city state postalCode country phone email }
              }
            }
          }
        }
      }
    `
    const data = await client.orderQuery<{
      orders: { edges: Array<{ node: { customer: RawCrystallizeCustomer } }> }
    }>(gql, { tenant: client.tenant })

    // Deduplicate customers by identifier
    const seen = new Map<string, RawCrystallizeCustomer>()
    for (const edge of data.orders?.edges ?? []) {
      const c = edge.node?.customer
      if (c?.identifier && !seen.has(c.identifier)) {
        seen.set(c.identifier, c)
      }
    }
    return [...seen.values()].slice(0, limit).map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const customers = await this.listCustomers(credentials, {} as QueryParams)
    const match = customers.find((c) => c.id === id)
    if (!match) throw new Error(`Customer ${id} not found`)
    return match
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = this.clientFor(credentials)
    const limit = this.pageSize(params)
    const gql = `
      query GetOrders($tenant: String!) {
        orders: getOrders(tenant: $tenant) {
          edges {
            node {
              id
              referenceId
              customer {
                identifier firstName lastName email phone
                addresses { type streetNumber street street2 city state postalCode country }
              }
              cart {
                name sku quantity productId productVariantId
                price { gross net currency tax { name percent } }
                imageUrl
              }
              total { gross net currency tax { name percent } }
              payment { provider providerId }
              additionalInformation
              meta { key value }
              createdAt updatedAt
            }
          }
        }
      }
    `
    const data = await client.orderQuery<{
      orders: { edges: Array<{ node: RawCrystallizeOrder }> }
    }>(gql, { tenant: client.tenant })
    const items = (data.orders?.edges ?? []).map((e) => e.node).slice(0, limit)
    return items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = this.clientFor(credentials)
    const gql = `
      query GetOrder($id: ID!) {
        order: getOrder(id: $id) {
          id referenceId
          customer {
            identifier firstName lastName email phone
            addresses { type streetNumber street street2 city state postalCode country }
          }
          cart {
            name sku quantity productId productVariantId
            price { gross net currency tax { name percent } }
            imageUrl
          }
          total { gross net currency tax { name percent } }
          payment { provider providerId }
          additionalInformation
          meta { key value }
          createdAt updatedAt
        }
      }
    `
    const data = await client.orderQuery<{ order: RawCrystallizeOrder }>(gql, { id })
    return transformOrder(data.order)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = this.clientFor(credentials)
    const input = untransformOrder(data)
    const gql = `
      mutation CreateOrder($input: CreateOrderInput!) {
        orders {
          create(input: $input) {
            id referenceId
            customer {
              identifier firstName lastName email phone
              addresses { type streetNumber street street2 city state postalCode country }
            }
            cart {
              name sku quantity productId productVariantId
              price { gross net currency }
            }
            total { gross net currency }
            payment { provider providerId }
            createdAt updatedAt
          }
        }
      }
    `
    const res = await client.orderMutate<{ orders: { create: RawCrystallizeOrder } }>(gql, { input })
    return transformOrder(res.orders.create)
  }

  async updateOrder(credentials: Credentials, id: string, data: Partial<Order>): Promise<Order> {
    const client = this.clientFor(credentials)
    const input = untransformOrder(data)
    const gql = `
      mutation UpdateOrder($id: ID!, $input: UpdateOrderInput!) {
        orders {
          update(id: $id, input: $input) {
            id referenceId
            customer {
              identifier firstName lastName email phone
            }
            cart {
              name sku quantity productId productVariantId
              price { gross net currency }
            }
            total { gross net currency }
            payment { provider providerId }
            createdAt updatedAt
          }
        }
      }
    `
    const res = await client.orderMutate<{ orders: { update: RawCrystallizeOrder } }>(gql, { id, input })
    return transformOrder(res.orders.update)
  }

  // ── Fulfillments ──────────────────────────────────────────────────────────

  async listFulfillments(credentials: Credentials, params: QueryParams): Promise<Fulfillment[]> {
    const orderId = params['orderId'] ?? params['order_id']
    if (!orderId) {
      throw new Error('listFulfillments requires `orderId` in query params')
    }
    const client = this.clientFor(credentials)
    const gql = `
      query GetOrderPipeline($id: ID!) {
        order: getOrder(id: $id) {
          id
          meta { key value }
          cart { name sku quantity }
        }
      }
    `
    const data = await client.orderQuery<{
      order: { id: string; meta: Array<{ key: string; value: string }> | null; cart: Array<{ name: string; sku: string; quantity: number }> }
    }>(gql, { id: String(orderId) })

    // Extract fulfillment data from meta
    const fulfillments: RawCrystallizeFulfillment[] = []
    const meta = data.order.meta ?? []
    const fulfillmentMeta = meta.find((m) => m.key === 'fulfillment')
    if (fulfillmentMeta) {
      try {
        const parsed = JSON.parse(fulfillmentMeta.value)
        if (Array.isArray(parsed)) {
          for (const f of parsed) {
            fulfillments.push({ ...f, orderId: data.order.id })
          }
        }
      } catch {
        // Not valid JSON — no fulfillments
      }
    }
    return fulfillments.map((f) => transformFulfillment(f, data.order.id))
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    const [orderId, fulfillmentId] = id.includes(':') ? id.split(':') : ['', id]
    if (!orderId) {
      throw new Error('getFulfillment requires composite id `orderId:fulfillmentId`')
    }
    const fulfillments = await this.listFulfillments(credentials, { orderId } as QueryParams)
    const match = fulfillments.find((f) => f.id === fulfillmentId)
    if (!match) throw new Error(`Fulfillment ${fulfillmentId} not found on order ${orderId}`)
    return match
  }

  // ── Refunds ───────────────────────────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const orderId = params['orderId'] ?? params['order_id']
    if (!orderId) {
      throw new Error('listRefunds requires `orderId` in query params')
    }
    const client = this.clientFor(credentials)
    const gql = `
      query GetOrderRefunds($id: ID!) {
        order: getOrder(id: $id) {
          id
          meta { key value }
          total { gross currency }
        }
      }
    `
    const data = await client.orderQuery<{
      order: { id: string; meta: Array<{ key: string; value: string }> | null; total: { gross: number; currency: string } }
    }>(gql, { id: String(orderId) })

    const refunds: RawCrystallizeRefund[] = []
    const meta = data.order.meta ?? []
    const refundMeta = meta.find((m) => m.key === 'refunds')
    if (refundMeta) {
      try {
        const parsed = JSON.parse(refundMeta.value)
        if (Array.isArray(parsed)) {
          for (const r of parsed) {
            refunds.push({ ...r, orderId: data.order.id })
          }
        }
      } catch {
        // Not valid JSON — no refunds
      }
    }
    return refunds.map(transformRefund)
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const parts = id.split(':')
    if (parts.length < 2) {
      throw new Error('Invalid refund id format: expected `orderId:refundId`')
    }
    const orderId = parts[0]!
    const refunds = await this.listRefunds(credentials, { orderId } as QueryParams)
    const match = refunds.find((r) => r.id === id)
    if (!match) throw new Error(`Refund ${id} not found`)
    return match
  }

  // ── Transactions ──────────────────────────────────────────────────────────

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const orderId = params['orderId'] ?? params['order_id']
    if (!orderId) {
      throw new Error('listTransactions requires `orderId` in query params')
    }
    const client = this.clientFor(credentials)
    const gql = `
      query GetOrderPayments($id: ID!) {
        order: getOrder(id: $id) {
          id
          payment { provider providerId }
          total { gross currency }
          createdAt
        }
      }
    `
    const data = await client.orderQuery<{
      order: {
        id: string
        payment: Array<{ provider: string; providerId: string }> | null
        total: { gross: number; currency: string }
        createdAt: string
      }
    }>(gql, { id: String(orderId) })

    return (data.order.payment ?? []).map((p, i) => {
      const raw: RawCrystallizePayment = {
        id: p.providerId ?? `${data.order.id}:payment:${i}`,
        orderId: data.order.id,
        provider: p.provider,
        providerId: p.providerId,
        amount: data.order.total?.gross,
        currency: data.order.total?.currency,
        createdAt: data.order.createdAt,
      }
      return transformTransaction(raw)
    })
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const [orderId, , txId] = id.includes(':') ? id.split(':') : ['', '', id]
    if (!orderId) {
      throw new Error('getTransaction requires composite id `orderId:payment:index`')
    }
    const transactions = await this.listTransactions(credentials, { orderId } as QueryParams)
    const match = transactions.find((t) => t.id === id || t.id === txId)
    if (!match) throw new Error(`Transaction ${id} not found`)
    return match
  }

  // ── Discounts ─────────────────────────────────────────────────────────────

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const client = this.clientFor(credentials)
    const limit = this.pageSize(params)
    const gql = `
      query GetDiscounts($tenant: String!) {
        discounts: tenant(identifier: $tenant) {
          discounts {
            id name code type value currency
            appliesTo
            productIds
            usageLimit usageCount
            startsAt endsAt
            createdAt
          }
        }
      }
    `
    const data = await client.catalogueQuery<{
      discounts: { discounts: RawCrystallizeDiscount[] }
    }>(gql, { tenant: client.tenant })
    return (data.discounts?.discounts ?? []).slice(0, limit).map(transformDiscount)
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const discounts = await this.listDiscounts(credentials, {} as QueryParams)
    const match = discounts.find((d) => d.id === id)
    if (!match) throw new Error(`Discount ${id} not found`)
    return match
  }

  async createDiscount(credentials: Credentials, data: Partial<Discount>): Promise<Discount> {
    const client = this.clientFor(credentials)
    const input = untransformDiscount(data)
    const gql = `
      mutation CreateDiscount($input: CreateDiscountInput!) {
        discount {
          create(input: $input) {
            id name code type value currency
            appliesTo productIds
            usageLimit usageCount
            startsAt endsAt createdAt
          }
        }
      }
    `
    const res = await client.pimMutate<{ discount: { create: RawCrystallizeDiscount } }>(gql, {
      input: { ...input, tenantId: client.tenant },
    })
    return transformDiscount(res.discount.create)
  }

  async updateDiscount(credentials: Credentials, id: string, data: Partial<Discount>): Promise<Discount> {
    const client = this.clientFor(credentials)
    const input = untransformDiscount(data)
    const gql = `
      mutation UpdateDiscount($id: ID!, $input: UpdateDiscountInput!) {
        discount {
          update(id: $id, input: $input) {
            id name code type value currency
            appliesTo productIds
            usageLimit usageCount
            startsAt endsAt createdAt
          }
        }
      }
    `
    const res = await client.pimMutate<{ discount: { update: RawCrystallizeDiscount } }>(gql, { id, input })
    return transformDiscount(res.discount.update)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    const client = this.clientFor(credentials)
    const gql = `
      mutation DeleteDiscount($id: ID!) {
        discount {
          delete(id: $id)
        }
      }
    `
    await client.pimMutate(gql, { id })
  }
}
