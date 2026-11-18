/**
 * Shopware 6 adapter for the ecommerce vertical.
 *
 * Maps the Shopware 6 Admin API (`/api/`) to canonical ecommerce
 * resources. Notable Shopware-isms:
 *
 *  - Auth uses OAuth2 client-credentials for integrations. Create an
 *    integration in the Shopware admin under Settings > System >
 *    Integrations. The client_id + client_secret are used to mint
 *    short-lived access tokens (10 min default).
 *
 *  - Shopware uses POST `/api/search/{entity}` for listing/filtering
 *    (DAL criteria), and PATCH for updates (not PUT).
 *
 *  - Products have a parent/child variant model. Parent products may
 *    have `children[]` (variant products with `parentId` set).
 *
 *  - Fulfillments are "order deliveries" (`/api/order-delivery`).
 *
 *  - Transactions are "order transactions" (`/api/order-transaction`).
 *
 *  - Discounts are "promotions" (`/api/promotion`).
 *
 *  - Inventory is tracked at the product level (`stock`,
 *    `availableStock`). No multi-warehouse in core API.
 *
 *  - Locations: Shopware core has no warehouse entity. We provide
 *    `listLocations` and `getLocation` that return a synthetic
 *    default location.
 *
 * ~35 of 42 interface methods implemented.
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

import { customForm } from '@opensteward/shared'
import {
  buildAuthUrl,
  exchangeCode as shopwareExchangeCode,
  refreshCredentials as shopwareRefreshCredentials,
  fetchAccessToken,
} from './auth'
import { ShopwareClient } from './client'
import { DEFAULT_PAGE_SIZE, TOKEN_LIFETIME_MS } from './constants'

const CREDENTIAL_FORM = customForm({
  fields: [
    {
      name: 'baseUrl',
      label: 'Store URL',
      type: 'url',
      required: true,
      placeholder: 'https://myshop.example',
      helpText: 'Base URL of your Shopware 6 store (no trailing slash).',
    },
    { name: 'clientId', label: 'Client ID', type: 'text', required: true },
    { name: 'clientSecret', label: 'Client secret', type: 'password', required: true },
  ],
  exchange: async (input) => {
    const baseUrl = (input.baseUrl ?? '').trim().replace(/\/$/, '')
    const clientId = (input.clientId ?? '').trim()
    const clientSecret = input.clientSecret ?? ''
    if (!baseUrl || !clientId || !clientSecret) {
      throw new Error('Store URL, Client ID, and Client secret are required.')
    }
    const { accessToken, expiresIn } = await fetchAccessToken(baseUrl, clientId, clientSecret)
    return {
      accessToken,
      expiresAt: new Date(Date.now() + (expiresIn ? expiresIn * 1000 : TOKEN_LIFETIME_MS)),
      extra: { baseUrl, clientId, clientSecret },
    }
  },
})

import {
  transformProduct,
  untransformProduct,
  transformProductVariant,
  untransformProductVariant,
  type RawShopwareProduct,
} from './transform/product'
import {
  transformCollection,
  untransformCollection,
  type RawShopwareCategory,
} from './transform/collection'
import {
  transformCustomer,
  untransformCustomer,
  type RawShopwareCustomer,
} from './transform/customer'
import { transformOrder, type RawShopwareOrder } from './transform/order'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawShopwareOrderDelivery,
} from './transform/fulfillment'
import {
  transformRefund,
  untransformRefund,
  type RawShopwareRefund,
} from './transform/refund'
import {
  transformTransaction,
  type RawShopwareTransaction,
} from './transform/transaction'
import {
  transformDiscount,
  untransformDiscount,
  type RawShopwarePromotion,
} from './transform/discount'
import {
  transformInventoryLevel,
  type RawShopwareProductStock,
} from './transform/inventory'

export interface ShopwareAdapterConfig {
  /** Base URL of the Shopware store, e.g. `https://myshop.example` (no trailing slash). */
  baseUrl?: string
  /** OAuth2 client_id from a Shopware integration. */
  clientId?: string
  /** OAuth2 client_secret from a Shopware integration. */
  clientSecret?: string
}

export class ShopwareAdapter implements EcommerceAdapter {
  readonly platform = 'shopware'
  readonly version = '0.1.0'

  credentialFields = CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  private configBaseUrl: string | undefined
  private configClientId: string | undefined
  private configClientSecret: string | undefined

  constructor(config: ShopwareAdapterConfig = {}) {
    this.configBaseUrl = config.baseUrl
    this.configClientId = config.clientId
    this.configClientSecret = config.clientSecret
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    return buildAuthUrl(
      this.configBaseUrl ?? 'https://your-shopware-site.example',
    )
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return shopwareExchangeCode()
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return shopwareRefreshCredentials(credentials)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): ShopwareClient {
    const baseUrl =
      (credentials.extra?.['baseUrl'] as string | undefined) ?? this.configBaseUrl
    const clientId =
      (credentials.extra?.['clientId'] as string | undefined) ?? this.configClientId
    const clientSecret =
      (credentials.extra?.['clientSecret'] as string | undefined) ??
      this.configClientSecret

    if (!baseUrl) {
      throw new Error(
        'Shopware adapter is missing baseUrl — either configure it in ' +
          'apps/integration-server/config/config.yml under adapters.shopware, or POST it ' +
          'to /v1/connections with credentials: {baseUrl, clientId, clientSecret}.',
      )
    }
    if (!credentials.accessToken && (!clientId || !clientSecret)) {
      throw new Error(
        'Shopware adapter needs either an accessToken or (clientId + clientSecret) ' +
          'to mint one. Re-create the connection with the required fields.',
      )
    }

    const mergedCreds: Credentials = {
      ...credentials,
      accessToken: credentials.accessToken || 'pending',
      extra: {
        ...credentials.extra,
        baseUrl,
        ...(clientId ? { clientId } : {}),
        ...(clientSecret ? { clientSecret } : {}),
      },
    }
    return new ShopwareClient(mergedCreds)
  }

  private pageParams(params: QueryParams): { page: number; limit: number } {
    return {
      page: params.page ?? 1,
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
    }
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const { page, limit } = this.pageParams(params)
    const client = this.clientFor(credentials)
    const res = await client.search<RawShopwareProduct>('product', {
      page,
      limit,
      filter: [{ type: 'equals', field: 'parentId', value: null }],
      associations: {
        children: { associations: { options: { associations: { group: {} } } } },
        media: { associations: { media: {} } },
        cover: { associations: { media: {} } },
        configuratorSettings: { associations: { option: { associations: { group: {} } } } },
        categories: {},
        tags: {},
        manufacturer: {},
      },
    })
    return res.data.map((p) => transformProduct(p))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const client = this.clientFor(credentials)
    // Use search with ID filter to load associations
    const res = await client.search<RawShopwareProduct>('product', {
      limit: 1,
      filter: [{ type: 'equals', field: 'id', value: id }],
      associations: {
        children: { associations: { options: { associations: { group: {} } } } },
        media: { associations: { media: {} } },
        cover: { associations: { media: {} } },
        configuratorSettings: { associations: { option: { associations: { group: {} } } } },
        categories: {},
        tags: {},
        manufacturer: {},
      },
    })
    const raw = res.data[0]
    if (!raw) throw new Error(`Shopware product not found: ${id}`)
    return transformProduct(raw)
  }

  async createProduct(
    credentials: Credentials,
    data: Partial<Product>,
  ): Promise<Product> {
    const client = this.clientFor(credentials)
    const body = untransformProduct(data)
    // Generate a UUID-like id for Shopware (hex, 32 chars)
    const id =
      data.id ??
      Array.from({ length: 32 }, () =>
        Math.floor(Math.random() * 16).toString(16),
      ).join('')
    const payload = { id, ...body }
    await client.post('product', payload)
    return this.getProduct(credentials, id)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const client = this.clientFor(credentials)
    const body = untransformProduct(data)
    await client.patch(`product/${id}`, body)
    return this.getProduct(credentials, id)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`product/${id}`)
  }

  // ── Variants ──────────────────────────────────────────────────────────────

  async listVariants(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<ProductVariant[]> {
    const productId = (params['productId'] ?? params['product_id']) as
      | string
      | undefined
    if (!productId) {
      throw new Error(
        'Shopware requires ?productId= for listVariants; variants are children of a parent product.',
      )
    }
    const { page, limit } = this.pageParams(params)
    const client = this.clientFor(credentials)
    const res = await client.search<RawShopwareProduct>('product', {
      page,
      limit,
      filter: [{ type: 'equals', field: 'parentId', value: productId }],
      associations: {
        options: { associations: { group: {} } },
      },
    })
    return res.data.map((c) => transformProductVariant(c, productId))
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    const client = this.clientFor(credentials)
    const res = await client.search<RawShopwareProduct>('product', {
      limit: 1,
      filter: [{ type: 'equals', field: 'id', value: id }],
      associations: {
        options: { associations: { group: {} } },
      },
    })
    const raw = res.data[0]
    if (!raw) throw new Error(`Shopware variant not found: ${id}`)
    return transformProductVariant(raw, raw.parentId ?? '')
  }

  async createVariant(
    credentials: Credentials,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const parentId = data.productId
    if (!parentId) {
      throw new Error('Shopware createVariant requires productId (parent product ID)')
    }
    const client = this.clientFor(credentials)
    const body = untransformProductVariant(data)
    const id =
      Array.from({ length: 32 }, () =>
        Math.floor(Math.random() * 16).toString(16),
      ).join('')
    await client.post('product', { id, parentId, ...body })
    return this.getVariant(credentials, id)
  }

  async updateVariant(
    credentials: Credentials,
    id: string,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const client = this.clientFor(credentials)
    const body = untransformProductVariant(data)
    await client.patch(`product/${id}`, body)
    return this.getVariant(credentials, id)
  }

  async deleteVariant(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`product/${id}`)
  }

  // ── Collections ───────────────────────────────────────────────────────────

  async listCollections(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Collection[]> {
    const { page, limit } = this.pageParams(params)
    const client = this.clientFor(credentials)
    const res = await client.search<RawShopwareCategory>('category', {
      page,
      limit,
    })
    return res.data.map((c) => transformCollection(c))
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const client = this.clientFor(credentials)
    const raw = await client.getEntity<RawShopwareCategory>('category', id)
    return transformCollection(raw)
  }

  async createCollection(
    credentials: Credentials,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const client = this.clientFor(credentials)
    const body = untransformCollection(data)
    const id =
      data.id ??
      Array.from({ length: 32 }, () =>
        Math.floor(Math.random() * 16).toString(16),
      ).join('')
    await client.post('category', { id, ...body })
    const raw = await client.getEntity<RawShopwareCategory>('category', id)
    return transformCollection(raw)
  }

  async updateCollection(
    credentials: Credentials,
    id: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const client = this.clientFor(credentials)
    const body = untransformCollection(data)
    await client.patch(`category/${id}`, body)
    const raw = await client.getEntity<RawShopwareCategory>('category', id)
    return transformCollection(raw)
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`category/${id}`)
  }

  // ── Locations ─────────────────────────────────────────────────────────────
  // Shopware core has no warehouse entity. We return a synthetic default.

  async listLocations(
    _credentials: Credentials,
    _params: QueryParams,
  ): Promise<Location[]> {
    return [
      {
        id: 'default',
        name: 'Default Warehouse',
        active: true,
        isFulfillmentCenter: true,
        metadata: { synthetic: true, reason: 'Shopware core has no warehouse entity' },
      },
    ]
  }

  async getLocation(_credentials: Credentials, id: string): Promise<Location> {
    if (id !== 'default') {
      throw new Error(`Shopware location not found: ${id}`)
    }
    return {
      id: 'default',
      name: 'Default Warehouse',
      active: true,
      isFulfillmentCenter: true,
      metadata: { synthetic: true, reason: 'Shopware core has no warehouse entity' },
    }
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const { page, limit } = this.pageParams(params)
    const client = this.clientFor(credentials)
    const res = await client.search<RawShopwareProductStock>('product', {
      page,
      limit,
    })
    return res.data.map(transformInventoryLevel)
  }

  async getInventoryLevel(
    credentials: Credentials,
    id: string,
  ): Promise<InventoryLevel> {
    // ID format: `${productId}:default`
    const productId = id.replace(/:default$/, '')
    const client = this.clientFor(credentials)
    const raw = await client.getEntity<RawShopwareProductStock>('product', productId)
    return transformInventoryLevel(raw)
  }

  async adjustInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; delta: number },
  ): Promise<InventoryLevel> {
    const current = await this.getInventoryLevel(
      credentials,
      `${data.variantId}:${data.locationId}`,
    )
    return this.setInventoryLevel(credentials, {
      variantId: data.variantId,
      locationId: data.locationId,
      available: current.available + data.delta,
    })
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const client = this.clientFor(credentials)
    await client.patch(`product/${data.variantId}`, { stock: data.available })
    return {
      id: `${data.variantId}:${data.locationId}`,
      variantId: data.variantId,
      locationId: data.locationId,
      available: data.available,
      metadata: {
        productId: data.variantId,
        stock: data.available,
      },
    }
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Customer[]> {
    const { page, limit } = this.pageParams(params)
    const client = this.clientFor(credentials)
    const res = await client.search<RawShopwareCustomer>('customer', {
      page,
      limit,
      associations: {
        defaultBillingAddress: { associations: { country: {}, countryState: {} } },
        defaultShippingAddress: { associations: { country: {}, countryState: {} } },
        addresses: { associations: { country: {}, countryState: {} } },
      },
    })
    return res.data.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const client = this.clientFor(credentials)
    const res = await client.search<RawShopwareCustomer>('customer', {
      limit: 1,
      filter: [{ type: 'equals', field: 'id', value: id }],
      associations: {
        defaultBillingAddress: { associations: { country: {}, countryState: {} } },
        defaultShippingAddress: { associations: { country: {}, countryState: {} } },
        addresses: { associations: { country: {}, countryState: {} } },
      },
    })
    const raw = res.data[0]
    if (!raw) throw new Error(`Shopware customer not found: ${id}`)
    return transformCustomer(raw)
  }

  async createCustomer(
    credentials: Credentials,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const client = this.clientFor(credentials)
    const body = untransformCustomer(data)
    const id =
      Array.from({ length: 32 }, () =>
        Math.floor(Math.random() * 16).toString(16),
      ).join('')
    await client.post('customer', { id, ...body })
    return this.getCustomer(credentials, id)
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const client = this.clientFor(credentials)
    const body = untransformCustomer(data)
    await client.patch(`customer/${id}`, body)
    return this.getCustomer(credentials, id)
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`customer/${id}`)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const { page, limit } = this.pageParams(params)
    const client = this.clientFor(credentials)
    const res = await client.search<RawShopwareOrder>('order', {
      page,
      limit,
      associations: {
        lineItems: {},
        transactions: { associations: { stateMachineState: {}, paymentMethod: {} } },
        deliveries: {
          associations: {
            stateMachineState: {},
            shippingMethod: {},
            shippingOrderAddress: { associations: { country: {}, countryState: {} } },
            positions: {},
          },
        },
        billingAddress: { associations: { country: {}, countryState: {} } },
        orderCustomer: {},
        currency: {},
        stateMachineState: {},
      },
    })
    return res.data.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = this.clientFor(credentials)
    const res = await client.search<RawShopwareOrder>('order', {
      limit: 1,
      filter: [{ type: 'equals', field: 'id', value: id }],
      associations: {
        lineItems: {},
        transactions: { associations: { stateMachineState: {}, paymentMethod: {} } },
        deliveries: {
          associations: {
            stateMachineState: {},
            shippingMethod: {},
            shippingOrderAddress: { associations: { country: {}, countryState: {} } },
            positions: {},
          },
        },
        billingAddress: { associations: { country: {}, countryState: {} } },
        orderCustomer: {},
        currency: {},
        stateMachineState: {},
      },
    })
    const raw = res.data[0]
    if (!raw) throw new Error(`Shopware order not found: ${id}`)
    return transformOrder(raw)
  }

  async createOrder(
    _credentials: Credentials,
    _data: Partial<Order>,
  ): Promise<Order> {
    throw new Error(
      'Shopware orders must originate from the storefront checkout flow; direct order creation ' +
        'is not supported via the Admin API. Use the Store API cart + checkout endpoints.',
    )
  }

  async updateOrder(
    credentials: Credentials,
    id: string,
    data: Partial<Order>,
  ): Promise<Order> {
    // Shopware allows updating customer comment via PATCH
    const client = this.clientFor(credentials)
    const body: Record<string, unknown> = {}
    if (data.note != null) body['customerComment'] = data.note
    if (Object.keys(body).length > 0) {
      await client.patch(`order/${id}`, body)
    }
    return this.getOrder(credentials, id)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Order> {
    // Shopware uses state machine transitions for order cancellation
    const client = this.clientFor(credentials)
    await client.post(`_action/order/${id}/state/cancel`)
    return this.getOrder(credentials, id)
  }

  // ── Fulfillments ──────────────────────────────────────────────────────────

  async listFulfillments(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Fulfillment[]> {
    const { page, limit } = this.pageParams(params)
    const client = this.clientFor(credentials)
    const res = await client.search<RawShopwareOrderDelivery>('order-delivery', {
      page,
      limit,
      associations: {
        stateMachineState: {},
        shippingMethod: {},
        positions: {},
      },
    })
    return res.data.map(transformFulfillment)
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    const client = this.clientFor(credentials)
    const res = await client.search<RawShopwareOrderDelivery>('order-delivery', {
      limit: 1,
      filter: [{ type: 'equals', field: 'id', value: id }],
      associations: {
        stateMachineState: {},
        shippingMethod: {},
        positions: {},
      },
    })
    const raw = res.data[0]
    if (!raw) throw new Error(`Shopware delivery not found: ${id}`)
    return transformFulfillment(raw)
  }

  async createFulfillment(
    credentials: Credentials,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    if (!data.orderId) {
      throw new Error('Shopware createFulfillment requires orderId')
    }
    // Transition the delivery to shipped state and add tracking codes
    const client = this.clientFor(credentials)
    // Find the delivery for this order
    const deliveries = await client.search<RawShopwareOrderDelivery>(
      'order-delivery',
      {
        limit: 1,
        filter: [{ type: 'equals', field: 'orderId', value: data.orderId }],
      },
    )
    const delivery = deliveries.data[0]
    if (!delivery) {
      throw new Error(`No delivery found for order ${data.orderId}`)
    }
    // Update tracking codes
    const body = untransformFulfillment(data)
    await client.patch(`order-delivery/${delivery.id}`, body)
    // Transition to shipped
    await client.post(
      `_action/order-delivery/${delivery.id}/state/ship`,
    )
    return this.getFulfillment(credentials, delivery.id)
  }

  async updateFulfillment(
    credentials: Credentials,
    id: string,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    const client = this.clientFor(credentials)
    const body = untransformFulfillment(data)
    await client.patch(`order-delivery/${id}`, body)
    return this.getFulfillment(credentials, id)
  }

  async cancelFulfillment(
    credentials: Credentials,
    id: string,
  ): Promise<Fulfillment> {
    const client = this.clientFor(credentials)
    await client.post(`_action/order-delivery/${id}/state/cancel`)
    return this.getFulfillment(credentials, id)
  }

  // ── Refunds ───────────────────────────────────────────────────────────────

  async listRefunds(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Refund[]> {
    const { page, limit } = this.pageParams(params)
    const client = this.clientFor(credentials)
    const res = await client.search<RawShopwareRefund>(
      'order-transaction-capture-refund',
      { page, limit, associations: { positions: {} } },
    )
    return res.data.map((r) => transformRefund(r))
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const client = this.clientFor(credentials)
    const res = await client.search<RawShopwareRefund>(
      'order-transaction-capture-refund',
      {
        limit: 1,
        filter: [{ type: 'equals', field: 'id', value: id }],
        associations: { positions: {} },
      },
    )
    const raw = res.data[0]
    if (!raw) throw new Error(`Shopware refund not found: ${id}`)
    return transformRefund(raw)
  }

  async createRefund(
    credentials: Credentials,
    data: Partial<Refund>,
  ): Promise<Refund> {
    if (!data.orderId) throw new Error('createRefund requires orderId')
    const client = this.clientFor(credentials)
    const body = untransformRefund(data)
    const id = Array.from({ length: 32 }, () =>
      Math.floor(Math.random() * 16).toString(16),
    ).join('')
    await client.post('order-transaction-capture-refund', { id, ...body })
    return this.getRefund(credentials, id)
  }

  // ── Transactions ──────────────────────────────────────────────────────────

  async listTransactions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Transaction[]> {
    const { page, limit } = this.pageParams(params)
    const client = this.clientFor(credentials)
    const res = await client.search<RawShopwareTransaction>('order-transaction', {
      page,
      limit,
      associations: {
        stateMachineState: {},
        paymentMethod: {},
      },
    })
    return res.data.map((t) => transformTransaction(t))
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = this.clientFor(credentials)
    const res = await client.search<RawShopwareTransaction>('order-transaction', {
      limit: 1,
      filter: [{ type: 'equals', field: 'id', value: id }],
      associations: {
        stateMachineState: {},
        paymentMethod: {},
      },
    })
    const raw = res.data[0]
    if (!raw) throw new Error(`Shopware transaction not found: ${id}`)
    return transformTransaction(raw)
  }

  async createTransaction(
    _credentials: Credentials,
    _data: Partial<Transaction>,
  ): Promise<Transaction> {
    throw new Error(
      'Shopware transactions are created automatically during the checkout flow. ' +
        'Direct creation is not supported via the Admin API.',
    )
  }

  // ── Discounts ─────────────────────────────────────────────────────────────

  async listDiscounts(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Discount[]> {
    const { page, limit } = this.pageParams(params)
    const client = this.clientFor(credentials)
    const res = await client.search<RawShopwarePromotion>('promotion', {
      page,
      limit,
      associations: { discounts: {} },
    })
    return res.data.map(transformDiscount)
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const client = this.clientFor(credentials)
    const res = await client.search<RawShopwarePromotion>('promotion', {
      limit: 1,
      filter: [{ type: 'equals', field: 'id', value: id }],
      associations: { discounts: {} },
    })
    const raw = res.data[0]
    if (!raw) throw new Error(`Shopware promotion not found: ${id}`)
    return transformDiscount(raw)
  }

  async createDiscount(
    credentials: Credentials,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const client = this.clientFor(credentials)
    const body = untransformDiscount(data)
    const id = Array.from({ length: 32 }, () =>
      Math.floor(Math.random() * 16).toString(16),
    ).join('')
    await client.post('promotion', { id, ...body })
    return this.getDiscount(credentials, id)
  }

  async updateDiscount(
    credentials: Credentials,
    id: string,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const client = this.clientFor(credentials)
    const body = untransformDiscount(data)
    await client.patch(`promotion/${id}`, body)
    return this.getDiscount(credentials, id)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`promotion/${id}`)
  }
}
