// ── Resource coverage ──────────────────────────────────────────────
// Derived:  transaction — no top-level payments query; derived from order.payments[]

/**
 * Vendure adapter for the ecommerce vertical.
 *
 * Maps the Vendure GraphQL Admin API to canonical ecommerce resources.
 * Vendure uses bearer tokens via the `login` mutation or static API keys.
 *
 * Key differences from Saleor:
 *  - Pagination: skip/take (offset/limit) instead of Relay cursor.
 *  - Prices: integers in cents, divide by 100 for canonical Money.
 *  - Channel scoping via `vendure-token` header.
 *  - Transactions: derived from order.payments[] — no top-level payments query exists.
 *  - Locations: mapped to StockLocations.
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

import { buildAuthUrl, exchangeCode as vendureExchangeCode, refreshCredentials as vendureRefresh } from './auth'
import { VendureClient } from './client'
import { VENDURE_FORM } from './connect-form'
import { DEFAULT_CHANNEL_TOKEN } from './constants'
import { verifyVendureWebhook, parseVendureWebhookEvents } from './webhook'

import { transformProduct, untransformProduct, type RawVendureProduct } from './transform/product'
import { transformVariant, untransformVariant, type RawVendureVariant } from './transform/variant'
import { transformCollection, untransformCollection, type RawVendureCollection } from './transform/collection'
import { transformLocation, type RawVendureStockLocation } from './transform/location'
import { transformInventoryLevel, type RawVendureStockLevel } from './transform/inventory'
import { transformCustomer, untransformCustomer, type RawVendureCustomer } from './transform/customer'
import { transformOrder, untransformOrder, type RawVendureOrder } from './transform/order'
import { transformFulfillment, untransformFulfillment, type RawVendureFulfillment } from './transform/fulfillment'
import { transformRefund, untransformRefund, type RawVendureRefund } from './transform/refund'
import { transformTransaction, type RawVendurePayment } from './transform/transaction'
import { transformDiscount, untransformDiscount, type RawVendurePromotion } from './transform/discount'

export interface VendureAdapterConfig {
  /** Full GraphQL admin endpoint URL, e.g. `https://myshop.example.com/admin-api` */
  apiUrl: string
  /** Pre-provisioned bearer token or API key. */
  appToken: string
  /** Channel token for multi-storefront scoping. */
  channelToken?: string
}

export class VendureAdapter implements EcommerceAdapter {
  // Connect Link support — Admin API URL, token, optional channel token (see ./connect-form).
  credentialFields = VENDURE_FORM.credentialFields
  exchangeCredentials = VENDURE_FORM.exchangeCredentials

  readonly platform = 'vendure'
  readonly version = '0.1.0'

  private apiUrl: string
  private appToken: string
  private channelToken: string

  constructor(config: VendureAdapterConfig) {
    this.apiUrl = config.apiUrl
    this.appToken = config.appToken
    this.channelToken = config.channelToken ?? DEFAULT_CHANNEL_TOKEN
  }

  // -- Auth ------------------------------------------------------------------

  getAuthUrl(state: string): string {
    return buildAuthUrl(this.apiUrl, state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return vendureExchangeCode(code, this.apiUrl, this.channelToken)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return vendureRefresh(credentials, this.apiUrl, this.channelToken)
  }

  // -- Webhooks --------------------------------------------------------------

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyVendureWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    const event =
      (payload['type'] as string | undefined) ??
      (payload['event'] as string | undefined)
    return parseVendureWebhookEvents(payload, event)
  }

  // -- Private helpers -------------------------------------------------------

  private clientFor(credentials: Credentials): VendureClient {
    return new VendureClient(credentials)
  }

  private channel(credentials: Credentials): string {
    const extra = (credentials.extra ?? {}) as Record<string, string>
    return extra['channelToken'] ?? this.channelToken
  }

  // -- Products --------------------------------------------------------------

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const client = this.clientFor(credentials)
    const gql = `
      query Products($options: ProductListOptions) {
        products(options: $options) {
          items {
            id name description slug enabled
            optionGroups {
              id name code
              options { id name code }
            }
            variants {
              id name sku price priceWithTax currencyCode enabled
              product { id }
              options { id name code group { name code } }
            }
            featuredAsset { id preview source name }
            assets { id preview source name }
            facetValues { id name code facet { id name code } }
            createdAt updatedAt
          }
          totalItems
        }
      }
    `
    const items = await client.listOffsetPage<RawVendureProduct>(gql, 'products', params)
    return items.map((raw) => transformProduct(raw))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const client = this.clientFor(credentials)
    const gql = `
      query Product($id: ID!) {
        product(id: $id) {
          id name description slug enabled
          optionGroups {
            id name code
            options { id name code }
          }
          variants {
            id name sku price priceWithTax currencyCode enabled
            product { id }
            options { id name code group { name code } }
          }
          featuredAsset { id preview source name }
          assets { id preview source name }
          facetValues { id name code facet { id name code } }
          createdAt updatedAt
        }
      }
    `
    const data = await client.query<{ product: RawVendureProduct }>(gql, { id })
    return transformProduct(data.product)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const client = this.clientFor(credentials)
    const input = untransformProduct(data)
    const gql = `
      mutation CreateProduct($input: CreateProductInput!) {
        createProduct(input: $input) {
          id name description slug enabled
          optionGroups { id name code options { id name code } }
          variants { id name sku price currencyCode product { id } }
          featuredAsset { id preview source name }
          assets { id preview source name }
          createdAt updatedAt
        }
      }
    `
    const res = await client.mutate<{ createProduct: RawVendureProduct }>(gql, { input })
    return transformProduct(res.createProduct)
  }

  async updateProduct(credentials: Credentials, id: string, data: Partial<Product>): Promise<Product> {
    const client = this.clientFor(credentials)
    const input = { ...untransformProduct(data), id }
    const gql = `
      mutation UpdateProduct($input: UpdateProductInput!) {
        updateProduct(input: $input) {
          id name description slug enabled
          optionGroups { id name code options { id name code } }
          variants { id name sku price currencyCode product { id } }
          featuredAsset { id preview source name }
          assets { id preview source name }
          createdAt updatedAt
        }
      }
    `
    const res = await client.mutate<{ updateProduct: RawVendureProduct }>(gql, { input })
    return transformProduct(res.updateProduct)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    const client = this.clientFor(credentials)
    const gql = `
      mutation DeleteProduct($id: ID!) {
        deleteProduct(id: $id) {
          result
          message
        }
      }
    `
    await client.mutate(gql, { id })
  }

  // -- Variants --------------------------------------------------------------

  async listVariants(credentials: Credentials, params: QueryParams): Promise<ProductVariant[]> {
    const client = this.clientFor(credentials)
    const gql = `
      query ProductVariants($options: ProductVariantListOptions) {
        productVariants(options: $options) {
          items {
            id name sku price priceWithTax currencyCode enabled
            product { id }
            options { id name code group { name code } }
          }
          totalItems
        }
      }
    `
    const items = await client.listOffsetPage<RawVendureVariant>(gql, 'productVariants', params)
    return items.map((raw) => transformVariant(raw))
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    const client = this.clientFor(credentials)
    const gql = `
      query ProductVariant($id: ID!) {
        productVariant(id: $id) {
          id name sku price priceWithTax currencyCode enabled
          product { id }
          options { id name code group { name code } }
        }
      }
    `
    const data = await client.query<{ productVariant: RawVendureVariant }>(gql, { id })
    return transformVariant(data.productVariant)
  }

  async createVariant(credentials: Credentials, data: Partial<ProductVariant>): Promise<ProductVariant> {
    const client = this.clientFor(credentials)
    const input = [{
      ...untransformVariant(data),
      productId: data.productId,
    }]
    const gql = `
      mutation CreateProductVariants($input: [CreateProductVariantInput!]!) {
        createProductVariants(input: $input) {
          id name sku price priceWithTax currencyCode enabled
          product { id }
          options { id name code group { name code } }
        }
      }
    `
    const res = await client.mutate<{ createProductVariants: RawVendureVariant[] }>(gql, { input })
    const created = res.createProductVariants[0]
    if (!created) throw new Error('No variant returned from createProductVariants')
    return transformVariant(created)
  }

  async updateVariant(credentials: Credentials, id: string, data: Partial<ProductVariant>): Promise<ProductVariant> {
    const client = this.clientFor(credentials)
    const input = [{
      ...untransformVariant(data),
      id,
    }]
    const gql = `
      mutation UpdateProductVariants($input: [UpdateProductVariantInput!]!) {
        updateProductVariants(input: $input) {
          id name sku price priceWithTax currencyCode enabled
          product { id }
          options { id name code group { name code } }
        }
      }
    `
    const res = await client.mutate<{ updateProductVariants: RawVendureVariant[] }>(gql, { input })
    const updated = res.updateProductVariants[0]
    if (!updated) throw new Error('No variant returned from updateProductVariants')
    return transformVariant(updated)
  }

  async deleteVariant(credentials: Credentials, id: string): Promise<void> {
    const client = this.clientFor(credentials)
    const gql = `
      mutation DeleteProductVariant($id: ID!) {
        deleteProductVariant(id: $id) {
          result
          message
        }
      }
    `
    await client.mutate(gql, { id })
  }

  // -- Collections -----------------------------------------------------------

  async listCollections(credentials: Credentials, params: QueryParams): Promise<Collection[]> {
    const client = this.clientFor(credentials)
    const gql = `
      query Collections($options: CollectionListOptions) {
        collections(options: $options) {
          items {
            id name slug description isPrivate
            featuredAsset { id preview source name }
            filters { code args { name value } }
            parent { id name }
            children { id name }
            productVariants(options: { take: 100 }) {
              items { product { id } }
              totalItems
            }
            createdAt updatedAt
          }
          totalItems
        }
      }
    `
    const items = await client.listOffsetPage<RawVendureCollection>(gql, 'collections', params)
    return items.map(transformCollection)
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const client = this.clientFor(credentials)
    const gql = `
      query Collection($id: ID!) {
        collection(id: $id) {
          id name slug description isPrivate
          featuredAsset { id preview source name }
          filters { code args { name value } }
          parent { id name }
          children { id name }
          productVariants(options: { take: 100 }) {
            items { product { id } }
            totalItems
          }
          createdAt updatedAt
        }
      }
    `
    const data = await client.query<{ collection: RawVendureCollection }>(gql, { id })
    return transformCollection(data.collection)
  }

  async createCollection(credentials: Credentials, data: Partial<Collection>): Promise<Collection> {
    const client = this.clientFor(credentials)
    const input = untransformCollection(data)
    const gql = `
      mutation CreateCollection($input: CreateCollectionInput!) {
        createCollection(input: $input) {
          id name slug description isPrivate
          featuredAsset { id preview source name }
          filters { code args { name value } }
          createdAt updatedAt
        }
      }
    `
    const res = await client.mutate<{ createCollection: RawVendureCollection }>(gql, { input })
    return transformCollection(res.createCollection)
  }

  async updateCollection(credentials: Credentials, id: string, data: Partial<Collection>): Promise<Collection> {
    const client = this.clientFor(credentials)
    const input = { ...untransformCollection(data), id }
    const gql = `
      mutation UpdateCollection($input: UpdateCollectionInput!) {
        updateCollection(input: $input) {
          id name slug description isPrivate
          featuredAsset { id preview source name }
          filters { code args { name value } }
          createdAt updatedAt
        }
      }
    `
    const res = await client.mutate<{ updateCollection: RawVendureCollection }>(gql, { input })
    return transformCollection(res.updateCollection)
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    const client = this.clientFor(credentials)
    const gql = `
      mutation DeleteCollection($id: ID!) {
        deleteCollection(id: $id) {
          result
          message
        }
      }
    `
    await client.mutate(gql, { id })
  }

  // -- Locations (StockLocations) --------------------------------------------

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const client = this.clientFor(credentials)
    const gql = `
      query StockLocations($options: StockLocationListOptions) {
        stockLocations(options: $options) {
          items {
            id name description
            createdAt updatedAt
          }
          totalItems
        }
      }
    `
    const items = await client.listOffsetPage<RawVendureStockLocation>(gql, 'stockLocations', params)
    return items.map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const client = this.clientFor(credentials)
    const gql = `
      query StockLocation($id: ID!) {
        stockLocation(id: $id) {
          id name description
          createdAt updatedAt
        }
      }
    `
    const data = await client.query<{ stockLocation: RawVendureStockLocation }>(gql, { id })
    return transformLocation(data.stockLocation)
  }

  // -- Inventory (StockLevels) -----------------------------------------------

  async listInventoryLevels(credentials: Credentials, params: QueryParams): Promise<InventoryLevel[]> {
    const client = this.clientFor(credentials)
    const variantId = params['variantId'] ?? params['variant_id']
    if (!variantId) {
      throw new Error('listInventoryLevels requires `variantId` in query params')
    }
    const gql = `
      query VariantStockLevels($id: ID!) {
        productVariant(id: $id) {
          id
          stockLevels {
            stockLocationId
            stockOnHand
            stockAllocated
          }
        }
      }
    `
    const data = await client.query<{
      productVariant: { id: string; stockLevels: RawVendureStockLevel[] }
    }>(gql, { id: String(variantId) })
    return (data.productVariant.stockLevels ?? []).map((s) =>
      transformInventoryLevel(s, String(data.productVariant.id)),
    )
  }

  async getInventoryLevel(credentials: Credentials, id: string): Promise<InventoryLevel> {
    // Composite id: `variantId:stockLocationId`
    const [variantId, locationId] = id.split(':')
    if (!variantId || !locationId) {
      throw new Error('Invalid inventory level id format: expected `variantId:stockLocationId`')
    }
    const levels = await this.listInventoryLevels(credentials, { variantId } as QueryParams)
    const level = levels.find((l) => l.locationId === locationId)
    if (!level) {
      throw new Error(`Inventory level not found for variant ${variantId} at location ${locationId}`)
    }
    return level
  }

  async adjustInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; delta: number },
  ): Promise<InventoryLevel> {
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
    // Vendure updates stock via updateProductVariants mutation with stockOnHand
    const gql = `
      mutation UpdateProductVariants($input: [UpdateProductVariantInput!]!) {
        updateProductVariants(input: $input) {
          id
          stockLevels {
            stockLocationId
            stockOnHand
            stockAllocated
          }
        }
      }
    `
    const res = await client.mutate<{
      updateProductVariants: Array<{ id: string; stockLevels: RawVendureStockLevel[] }>
    }>(gql, {
      input: [{
        id: data.variantId,
        stockOnHand: data.available,
      }],
    })
    const variant = res.updateProductVariants[0]
    const stocks = variant?.stockLevels ?? []
    const match = stocks.find((s) =>
      (s.stockLocationId ?? s.stockLocation?.id) === data.locationId,
    )
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

  // -- Customers -------------------------------------------------------------

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const client = this.clientFor(credentials)
    const gql = `
      query Customers($options: CustomerListOptions) {
        customers(options: $options) {
          items {
            id firstName lastName emailAddress phoneNumber
            orders { totalItems }
            addresses {
              id streetLine1 streetLine2 city province postalCode
              country { code name }
              phoneNumber defaultShippingAddress defaultBillingAddress
            }
            user { id }
            createdAt updatedAt
          }
          totalItems
        }
      }
    `
    const items = await client.listOffsetPage<RawVendureCustomer>(gql, 'customers', params)
    return items.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const client = this.clientFor(credentials)
    const gql = `
      query Customer($id: ID!) {
        customer(id: $id) {
          id firstName lastName emailAddress phoneNumber
          orders { totalItems }
          addresses {
            id streetLine1 streetLine2 city province postalCode
            country { code name }
            phoneNumber defaultShippingAddress defaultBillingAddress
          }
          user { id }
          createdAt updatedAt
        }
      }
    `
    const data = await client.query<{ customer: RawVendureCustomer }>(gql, { id })
    return transformCustomer(data.customer)
  }

  async createCustomer(credentials: Credentials, data: Partial<Customer>): Promise<Customer> {
    const client = this.clientFor(credentials)
    const input = untransformCustomer(data)
    const gql = `
      mutation CreateCustomer($input: CreateCustomerInput!) {
        createCustomer(input: $input) {
          ... on Customer {
            id firstName lastName emailAddress phoneNumber
            orders { totalItems }
            createdAt updatedAt
          }
          ... on EmailAddressConflictError {
            errorCode
            message
          }
        }
      }
    `
    const res = await client.mutate<{ createCustomer: RawVendureCustomer }>(gql, { input })
    return transformCustomer(res.createCustomer)
  }

  async updateCustomer(credentials: Credentials, id: string, data: Partial<Customer>): Promise<Customer> {
    const client = this.clientFor(credentials)
    const input = { ...untransformCustomer(data), id }
    const gql = `
      mutation UpdateCustomer($input: UpdateCustomerInput!) {
        updateCustomer(input: $input) {
          ... on Customer {
            id firstName lastName emailAddress phoneNumber
            orders { totalItems }
            createdAt updatedAt
          }
          ... on EmailAddressConflictError {
            errorCode
            message
          }
        }
      }
    `
    const res = await client.mutate<{ updateCustomer: RawVendureCustomer }>(gql, { input })
    return transformCustomer(res.updateCustomer)
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    const client = this.clientFor(credentials)
    const gql = `
      mutation DeleteCustomer($id: ID!) {
        deleteCustomer(id: $id) {
          result
          message
        }
      }
    `
    await client.mutate(gql, { id })
  }

  // -- Orders ----------------------------------------------------------------

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = this.clientFor(credentials)
    const gql = `
      query Orders($options: OrderListOptions) {
        orders(options: $options) {
          items {
            id code state orderPlacedAt currencyCode
            customer { id emailAddress }
            subTotal subTotalWithTax
            shipping shippingWithTax
            total totalWithTax
            lines {
              id quantity unitPrice unitPriceWithTax linePrice linePriceWithTax
              productVariant { id name sku product { id } }
            }
            shippingAddress {
              streetLine1 streetLine2 city province postalCode
              countryCode phoneNumber
            }
            billingAddress {
              streetLine1 streetLine2 city province postalCode
              countryCode phoneNumber
            }
            fulfillments { id state trackingCode }
            couponCodes
            payments { id method amount state }
            createdAt updatedAt
          }
          totalItems
        }
      }
    `
    const items = await client.listOffsetPage<RawVendureOrder>(gql, 'orders', params)
    return items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = this.clientFor(credentials)
    const gql = `
      query Order($id: ID!) {
        order(id: $id) {
          id code state orderPlacedAt currencyCode
          customer { id emailAddress }
          subTotal subTotalWithTax
          shipping shippingWithTax
          total totalWithTax
          lines {
            id quantity unitPrice unitPriceWithTax linePrice linePriceWithTax
            productVariant { id name sku product { id } }
          }
          shippingAddress {
            streetLine1 streetLine2 city province postalCode
            countryCode phoneNumber
          }
          billingAddress {
            streetLine1 streetLine2 city province postalCode
            countryCode phoneNumber
          }
          fulfillments { id state trackingCode }
          couponCodes
          payments { id method amount state }
          createdAt updatedAt
        }
      }
    `
    const data = await client.query<{ order: RawVendureOrder }>(gql, { id })
    return transformOrder(data.order)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = this.clientFor(credentials)
    // Vendure uses an order state machine. Create via admin addItemToOrder.
    // For simplicity, use transitionOrderToState to place the order.
    const input = untransformOrder(data)
    const draftGql = `
      mutation CreateDraftOrder($input: CreateDraftOrderInput!) {
        createDraftOrder(input: $input) {
          ... on Order {
            id code state currencyCode
            customer { id emailAddress }
            total totalWithTax
            lines {
              id quantity unitPrice unitPriceWithTax
              productVariant { id name sku product { id } }
            }
            createdAt updatedAt
          }
        }
      }
    `
    const draftInput: Record<string, unknown> = {}
    if (input['customerId']) draftInput['customerId'] = input['customerId']
    if (input['couponCodes']) draftInput['couponCodes'] = input['couponCodes']
    if (data.lineItems) {
      draftInput['lines'] = data.lineItems.map((li) => ({
        productVariantId: li.variantId,
        quantity: li.quantity,
      }))
    }

    const draft = await client.mutate<{ createDraftOrder: RawVendureOrder }>(draftGql, { input: draftInput })
    return transformOrder(draft.createDraftOrder)
  }

  async updateOrder(credentials: Credentials, id: string, data: Partial<Order>): Promise<Order> {
    const client = this.clientFor(credentials)
    const input: Record<string, unknown> = { id }
    if (data.note) input['note'] = data.note
    // Vendure order update via setOrderCustomFields
    const gql = `
      mutation SetOrderCustomFields($input: UpdateOrderInput!) {
        setOrderCustomFields(input: $input) {
          ... on Order {
            id code state currencyCode
            customer { id emailAddress }
            total totalWithTax
            lines {
              id quantity unitPrice unitPriceWithTax
              productVariant { id name sku product { id } }
            }
            fulfillments { id state trackingCode }
            createdAt updatedAt
          }
        }
      }
    `
    const res = await client.mutate<{ setOrderCustomFields: RawVendureOrder }>(gql, { input })
    return transformOrder(res.setOrderCustomFields)
  }

  async cancelOrder(credentials: Credentials, id: string, _data?: { reason?: string }): Promise<Order> {
    const client = this.clientFor(credentials)
    const gql = `
      mutation CancelOrder($input: CancelOrderInput!) {
        cancelOrder(input: $input) {
          ... on Order {
            id code state currencyCode
            customer { id emailAddress }
            total totalWithTax
            lines {
              id quantity unitPrice unitPriceWithTax
              productVariant { id name sku product { id } }
            }
            fulfillments { id state trackingCode }
            createdAt updatedAt
          }
          ... on CancelActiveOrderError {
            errorCode
            message
          }
          ... on EmptyOrderLineSelectionError {
            errorCode
            message
          }
          ... on QuantityTooGreatError {
            errorCode
            message
          }
        }
      }
    `
    // Cancel all lines
    const orderData = await this.getOrder(credentials, id)
    const lines = (orderData.lineItems ?? []).map((li) => ({
      orderLineId: li.id,
      quantity: li.quantity,
    }))
    const input = {
      orderId: id,
      lines,
      reason: _data?.reason,
    }
    const res = await client.mutate<{ cancelOrder: RawVendureOrder }>(gql, { input })
    return transformOrder(res.cancelOrder)
  }

  // -- Fulfillments ----------------------------------------------------------

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
            id state trackingCode method
            lines { orderLineId quantity }
            createdAt updatedAt
          }
        }
      }
    `
    const data = await client.query<{
      order: { id: string; fulfillments: RawVendureFulfillment[] }
    }>(gql, { id: String(orderId) })
    return (data.order.fulfillments ?? []).map((f) => transformFulfillment(f, String(data.order.id)))
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    // Vendure does not expose a top-level fulfillment query.
    // Callers may pass `orderId:fulfillmentId`.
    const [orderId, fulfillmentId] = id.includes(':') ? id.split(':') : ['', id]
    if (!orderId) {
      throw new Error('getFulfillment requires composite id `orderId:fulfillmentId`')
    }
    const fulfillments = await this.listFulfillments(credentials, { orderId } as QueryParams)
    const match = fulfillments.find((f) => f.id === fulfillmentId)
    if (!match) throw new Error(`Fulfillment ${fulfillmentId} not found on order ${orderId}`)
    return match
  }

  async createFulfillment(credentials: Credentials, data: Partial<Fulfillment>): Promise<Fulfillment> {
    if (!data.orderId) throw new Error('createFulfillment requires orderId')
    const client = this.clientFor(credentials)
    const extra = untransformFulfillment(data)
    const gql = `
      mutation CreateFulfillment($input: FulfillOrderInput!) {
        addFulfillmentToOrder(input: $input) {
          ... on Fulfillment {
            id state trackingCode method
            lines { orderLineId quantity }
            createdAt updatedAt
          }
          ... on CreateFulfillmentError {
            errorCode
            message
          }
        }
      }
    `
    const lines = data.lineItems?.map((li) => ({
      orderLineId: li.lineItemId,
      quantity: li.quantity,
    })) ?? []
    const input = {
      lines,
      handler: extra['handler'] ?? { code: 'manual-fulfillment', arguments: [] },
    }
    const res = await client.mutate<{
      addFulfillmentToOrder: RawVendureFulfillment
    }>(gql, { input })
    return transformFulfillment(res.addFulfillmentToOrder, data.orderId)
  }

  async updateFulfillment(credentials: Credentials, id: string, data: Partial<Fulfillment>): Promise<Fulfillment> {
    const client = this.clientFor(credentials)
    // Transition fulfillment state if needed
    if (data.trackingNumber) {
      const gql = `
        mutation TransitionFulfillmentToState($id: ID!, $state: String!) {
          transitionFulfillmentToState(id: $id, state: $state) {
            ... on Fulfillment {
              id state trackingCode method
              lines { orderLineId quantity }
              createdAt updatedAt
            }
          }
        }
      `
      const res = await client.mutate<{
        transitionFulfillmentToState: RawVendureFulfillment
      }>(gql, { id, state: 'Shipped' })
      return transformFulfillment(res.transitionFulfillmentToState, data.orderId ?? '')
    }
    // Fallback: return current state
    throw new Error('updateFulfillment: only state transitions supported in Vendure')
  }

  async cancelFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    const client = this.clientFor(credentials)
    const gql = `
      mutation TransitionFulfillmentToState($id: ID!, $state: String!) {
        transitionFulfillmentToState(id: $id, state: $state) {
          ... on Fulfillment {
            id state trackingCode method
            lines { orderLineId quantity }
            createdAt updatedAt
          }
          ... on FulfillmentStateTransitionError {
            errorCode
            message
          }
        }
      }
    `
    const res = await client.mutate<{
      transitionFulfillmentToState: RawVendureFulfillment
    }>(gql, { id, state: 'Cancelled' })
    return transformFulfillment(res.transitionFulfillmentToState)
  }

  // -- Refunds ---------------------------------------------------------------

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
            id method amount state
            refunds {
              id total reason state transactionId
              createdAt
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
          refunds: Array<{
            id: string
            total: number
            reason: string | null
            state: string
            transactionId: string | null
            createdAt: string
          }>
        }>
      }
    }>(gql, { id: String(orderId) })

    const refunds: RawVendureRefund[] = []
    for (const payment of data.order.payments ?? []) {
      for (const refund of payment.refunds ?? []) {
        refunds.push({
          id: `${data.order.id}:${payment.id}:${refund.id}`,
          orderId: String(data.order.id),
          total: refund.total,
          reason: refund.reason,
          state: refund.state,
          transactionId: refund.transactionId,
          paymentId: payment.id,
          createdAt: refund.createdAt,
        })
      }
    }
    return refunds.map(transformRefund)
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    // Composite: orderId:paymentId:refundId
    const parts = id.split(':')
    if (parts.length < 3) {
      throw new Error('Invalid refund id format: expected `orderId:paymentId:refundId`')
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
      mutation RefundOrder($input: RefundOrderInput!) {
        refundOrder(input: $input) {
          ... on Refund {
            id total reason state transactionId
            createdAt
          }
          ... on RefundOrderStateError {
            errorCode
            message
          }
        }
      }
    `
    // Get order to find payment ID
    const orderData = await this.getOrder(credentials, data.orderId)
    const paymentId = (orderData.metadata as Record<string, unknown>)?.['payments'] as Array<{ id: string }> | undefined
    const firstPaymentId = paymentId?.[0]?.id

    const refundInput: Record<string, unknown> = {
      lines: [],
      shipping: 0,
      adjustment: input['amount'] ?? 0,
      paymentId: firstPaymentId ?? '',
      reason: input['reason'],
    }

    await client.mutate(gql, { input: refundInput })

    // Fetch latest refunds and return the most recent one
    const refunds = await this.listRefunds(credentials, { orderId: data.orderId } as QueryParams)
    return refunds[refunds.length - 1] ?? {
      id: `${data.orderId}:unknown:0`,
      orderId: data.orderId,
      amount: data.amount,
      metadata: {},
    }
  }

  // -- Transactions (derived from order.payments[]) --------------------------
  // Vendure has no top-level `payments` or `listPayments` query.
  // Payments are accessible only as order.payments[]; transactions are derived
  // from those records. listTransactions requires `orderId` in params.

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const orderId = params['orderId'] ?? params['order_id']
    if (!orderId) {
      throw new Error('listTransactions requires `orderId` in query params')
    }
    const client = this.clientFor(credentials)
    const gql = `
      query OrderPaymentsForTransactions($id: ID!) {
        order(id: $id) {
          id currencyCode
          payments {
            id method amount state transactionId errorMessage
            metadata createdAt updatedAt
          }
        }
      }
    `
    const data = await client.query<{
      order: {
        id: string
        currencyCode?: string
        payments?: RawVendurePayment[]
      }
    }>(gql, { id: String(orderId) })
    const currency = data.order.currencyCode ?? 'USD'
    return (data.order.payments ?? []).map((p) =>
      transformTransaction(p, String(data.order.id), currency),
    )
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    // Composite id: `orderId:paymentId`
    const colonIdx = id.indexOf(':')
    if (colonIdx === -1) {
      throw new Error('Invalid transaction id format: expected `orderId:paymentId`')
    }
    const orderId = id.slice(0, colonIdx)
    const paymentId = id.slice(colonIdx + 1)
    const transactions = await this.listTransactions(credentials, { orderId } as QueryParams)
    const match = transactions.find((t) => t.id === id || t.id.endsWith(`:${paymentId}`))
    if (!match) throw new Error(`Transaction ${paymentId} not found on order ${orderId}`)
    return match
  }

  // -- Discounts (Promotions) ------------------------------------------------

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const client = this.clientFor(credentials)
    const gql = `
      query Promotions($options: PromotionListOptions) {
        promotions(options: $options) {
          items {
            id name couponCode enabled
            startsAt endsAt
            perCustomerUsageLimit usageLimit
            conditions { code args { name value } }
            actions { code args { name value } }
            createdAt updatedAt
          }
          totalItems
        }
      }
    `
    const items = await client.listOffsetPage<RawVendurePromotion>(gql, 'promotions', params)
    return items.map(transformDiscount)
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const client = this.clientFor(credentials)
    const gql = `
      query Promotion($id: ID!) {
        promotion(id: $id) {
          id name couponCode enabled
          startsAt endsAt
          perCustomerUsageLimit usageLimit
          conditions { code args { name value } }
          actions { code args { name value } }
          createdAt updatedAt
        }
      }
    `
    const data = await client.query<{ promotion: RawVendurePromotion }>(gql, { id })
    return transformDiscount(data.promotion)
  }

  async createDiscount(credentials: Credentials, data: Partial<Discount>): Promise<Discount> {
    const client = this.clientFor(credentials)
    const input = untransformDiscount(data)
    const gql = `
      mutation CreatePromotion($input: CreatePromotionInput!) {
        createPromotion(input: $input) {
          ... on Promotion {
            id name couponCode enabled
            startsAt endsAt
            perCustomerUsageLimit usageLimit
            conditions { code args { name value } }
            actions { code args { name value } }
            createdAt updatedAt
          }
          ... on MissingConditionsError {
            errorCode
            message
          }
        }
      }
    `
    const res = await client.mutate<{ createPromotion: RawVendurePromotion }>(gql, { input })
    return transformDiscount(res.createPromotion)
  }

  async updateDiscount(credentials: Credentials, id: string, data: Partial<Discount>): Promise<Discount> {
    const client = this.clientFor(credentials)
    const input = { ...untransformDiscount(data), id }
    const gql = `
      mutation UpdatePromotion($input: UpdatePromotionInput!) {
        updatePromotion(input: $input) {
          ... on Promotion {
            id name couponCode enabled
            startsAt endsAt
            perCustomerUsageLimit usageLimit
            conditions { code args { name value } }
            actions { code args { name value } }
            createdAt updatedAt
          }
        }
      }
    `
    const res = await client.mutate<{ updatePromotion: RawVendurePromotion }>(gql, { input })
    return transformDiscount(res.updatePromotion)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    const client = this.clientFor(credentials)
    const gql = `
      mutation DeletePromotion($id: ID!) {
        deletePromotion(id: $id) {
          result
          message
        }
      }
    `
    await client.mutate(gql, { id })
  }
}
