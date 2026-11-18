/**
 * Sylius adapter for the ecommerce vertical.
 *
 * Maps the Sylius Admin API (`/api/v2/admin/`) to the canonical
 * ecommerce resources. Sylius is a Symfony/API Platform-based
 * open-source ecommerce framework.
 *
 * Notable Sylius-isms:
 *
 *  - Auth supports OAuth2 (JWT authentication-token endpoint) and
 *    optional OAuth2 client_credentials. See `./auth.ts`.
 *  - Collections map to Sylius "taxons" (taxonomy categories).
 *  - Inventory is tracked directly on variants (`onHand`, `onHold`).
 *    No separate stock-item resource by default.
 *  - Fulfillments map to Sylius "shipments" with state machine
 *    transitions (cart -> ready -> shipped).
 *  - Transactions map to "payments" on orders.
 *  - Discounts map to "promotions" with associated actions and rules.
 *  - Prices are stored in **cents** (integers). Transforms convert to/from decimals.
 *  - The Admin API uses JSON-LD/Hydra format; the client handles
 *    pagination via `hydra:member` / `hydra:totalItems`.
 *  - Resources are identified by `code` (string slug) not numeric id.
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

import {
  CREDENTIAL_FIELDS as SYLIUS_CREDENTIAL_FIELDS,
  exchangeCredentials as syliusExchangeCredentials,
  refreshCredentials as syliusRefreshCredentials,
} from './auth'
import { SyliusClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import {
  transformProduct,
  untransformProduct,
  transformProductVariant,
  untransformProductVariant,
  type RawSyliusProduct,
  type RawSyliusVariant,
} from './transform/product'
import {
  transformCollection,
  untransformCollection,
  type RawSyliusTaxon,
} from './transform/collection'
import {
  transformCustomer,
  untransformCustomer,
  type RawSyliusCustomer,
} from './transform/customer'
import { transformOrder, type RawSyliusOrder } from './transform/order'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawSyliusShipment,
} from './transform/fulfillment'
import {
  transformRefund,
  untransformRefund,
  type RawSyliusRefund,
} from './transform/refund'
import {
  transformDiscount,
  untransformDiscount,
  type RawSyliusPromotion,
} from './transform/discount'
import {
  transformTransaction,
  untransformTransaction,
  type RawSyliusPayment,
} from './transform/transaction'
import {
  transformInventoryLevel,
  type RawSyliusInventoryEntry,
} from './transform/inventory'
import {
  transformLocation,
  type RawSyliusChannel,
} from './transform/location'

export interface SyliusAdapterConfig {
  /** Base URL of the Sylius store, e.g. `https://my-sylius.example` (no trailing slash). */
  baseUrl?: string
  /** OAuth2 client ID. */
  clientId?: string
  /** OAuth2 client secret. */
  clientSecret?: string
}

export class SyliusAdapter implements EcommerceAdapter {
  readonly platform = 'sylius'
  readonly version = '0.1.0'

  private configBaseUrl: string | undefined
  private configClientId: string | undefined
  private configClientSecret: string | undefined

  constructor(config: SyliusAdapterConfig = {}) {
    this.configBaseUrl = config.baseUrl
    this.configClientId = config.clientId
    this.configClientSecret = config.clientSecret
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  /**
   * The store URL and an administrator login are the customer's: Connect Link
   * collects them here and logs in for a JWT.
   */
  credentialFields(): CredentialField[] {
    return SYLIUS_CREDENTIAL_FIELDS
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return syliusExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    throw new Error(
      'Sylius authenticates with an administrator email and password: use the credential form, not a browser redirect.',
    )
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error(
      'Sylius authenticates with an administrator email and password: use the credential form, not a browser redirect.',
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return syliusRefreshCredentials(credentials)
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): SyliusClient {
    const baseUrl =
      (credentials.extra?.['baseUrl'] as string | undefined) ?? this.configBaseUrl
    const clientId =
      (credentials.extra?.['clientId'] as string | undefined) ?? this.configClientId
    const clientSecret =
      (credentials.extra?.['clientSecret'] as string | undefined) ?? this.configClientSecret

    if (!baseUrl) {
      throw new Error(
        'Sylius adapter is missing baseUrl — either configure it in adapter config ' +
          'or POST it to /v1/connections with credentials: {baseUrl, accessToken}.',
      )
    }
    if (!credentials.accessToken) {
      throw new Error(
        'Sylius adapter needs an accessToken (JWT or OAuth2 bearer token).',
      )
    }

    const mergedCreds: Credentials = {
      ...credentials,
      extra: {
        ...credentials.extra,
        baseUrl,
        ...(clientId ? { clientId } : {}),
        ...(clientSecret ? { clientSecret } : {}),
      },
    }
    return new SyliusClient(mergedCreds)
  }

  private pageParams(params: QueryParams): { page: number; perPage: number } {
    return {
      page: params.page ?? 1,
      perPage: params.limit ?? DEFAULT_PAGE_SIZE,
    }
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const { page, perPage } = this.pageParams(params)
    const res = await this.clientFor(credentials).list<RawSyliusProduct>(
      'products',
      { page, perPage },
    )
    return res.items.map((p) => transformProduct(p))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const raw = await this.clientFor(credentials).get<RawSyliusProduct>(
      `products/${encodeURIComponent(id)}`,
    )
    return transformProduct(raw)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const res = await this.clientFor(credentials).post<RawSyliusProduct>(
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
    const res = await this.clientFor(credentials).patch<RawSyliusProduct>(
      `products/${encodeURIComponent(id)}`,
      untransformProduct(data),
    )
    return transformProduct(res)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`products/${encodeURIComponent(id)}`)
  }

  // ── Variants ──────────────────────────────────────────────────────────────

  async listVariants(credentials: Credentials, params: QueryParams): Promise<ProductVariant[]> {
    const { page, perPage } = this.pageParams(params)
    const filter: Record<string, string | number> = {}
    const productId = (params['productId'] ?? params['product_id']) as string | undefined
    if (productId) filter['product'] = productId
    const res = await this.clientFor(credentials).list<RawSyliusVariant>(
      'product-variants',
      { page, perPage, filter },
    )
    return res.items.map((v) => transformProductVariant(v, productId))
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    const raw = await this.clientFor(credentials).get<RawSyliusVariant>(
      `product-variants/${encodeURIComponent(id)}`,
    )
    return transformProductVariant(raw)
  }

  async createVariant(
    credentials: Credentials,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const body = untransformProductVariant(data)
    if (data.productId) {
      body['product'] = `/api/v2/admin/products/${data.productId}`
    }
    const res = await this.clientFor(credentials).post<RawSyliusVariant>(
      'product-variants',
      body,
    )
    return transformProductVariant(res, data.productId ?? undefined)
  }

  async updateVariant(
    credentials: Credentials,
    id: string,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const res = await this.clientFor(credentials).patch<RawSyliusVariant>(
      `product-variants/${encodeURIComponent(id)}`,
      untransformProductVariant(data),
    )
    return transformProductVariant(res)
  }

  async deleteVariant(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`product-variants/${encodeURIComponent(id)}`)
  }

  // ── Collections ───────────────────────────────────────────────────────────

  async listCollections(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Collection[]> {
    const { page, perPage } = this.pageParams(params)
    const res = await this.clientFor(credentials).list<RawSyliusTaxon>(
      'taxons',
      { page, perPage },
    )
    return res.items.map(transformCollection)
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const res = await this.clientFor(credentials).get<RawSyliusTaxon>(
      `taxons/${encodeURIComponent(id)}`,
    )
    return transformCollection(res)
  }

  async createCollection(
    credentials: Credentials,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const res = await this.clientFor(credentials).post<RawSyliusTaxon>(
      'taxons',
      untransformCollection(data),
    )
    return transformCollection(res)
  }

  async updateCollection(
    credentials: Credentials,
    id: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const res = await this.clientFor(credentials).patch<RawSyliusTaxon>(
      `taxons/${encodeURIComponent(id)}`,
      untransformCollection(data),
    )
    return transformCollection(res)
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`taxons/${encodeURIComponent(id)}`)
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  async listLocations(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Location[]> {
    const { page, perPage } = this.pageParams(params)
    const res = await this.clientFor(credentials).list<RawSyliusChannel>(
      'channels',
      { page, perPage },
    )
    return res.items.map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const res = await this.clientFor(credentials).get<RawSyliusChannel>(
      `channels/${encodeURIComponent(id)}`,
    )
    return transformLocation(res)
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const { page, perPage } = this.pageParams(params)
    const filter: Record<string, string | number> = {}
    filter['tracked'] = 'true'
    const res = await this.clientFor(credentials).list<RawSyliusInventoryEntry>(
      'product-variants',
      { page, perPage, filter },
    )
    return res.items
      .filter((v) => v.tracked)
      .map(transformInventoryLevel)
  }

  async getInventoryLevel(credentials: Credentials, id: string): Promise<InventoryLevel> {
    // id can be composite `variantCode:locationId` or a variant code
    const variantCode = id.includes(':') ? id.split(':')[0]! : id
    const raw = await this.clientFor(credentials).get<RawSyliusInventoryEntry>(
      `product-variants/${encodeURIComponent(variantCode)}`,
    )
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
    const raw = await client.patch<RawSyliusInventoryEntry>(
      `product-variants/${encodeURIComponent(data.variantId)}`,
      { tracked: true, onHand: data.available },
    )
    return transformInventoryLevel(raw)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Customer[]> {
    const { page, perPage } = this.pageParams(params)
    const res = await this.clientFor(credentials).list<RawSyliusCustomer>(
      'customers',
      { page, perPage },
    )
    return res.items.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.clientFor(credentials).get<RawSyliusCustomer>(
      `customers/${encodeURIComponent(id)}`,
    )
    return transformCustomer(res)
  }

  async createCustomer(
    credentials: Credentials,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const body = untransformCustomer(data)
    const res = await this.clientFor(credentials).post<RawSyliusCustomer>('customers', body)
    return transformCustomer(res)
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const body = untransformCustomer(data)
    const res = await this.clientFor(credentials).patch<RawSyliusCustomer>(
      `customers/${encodeURIComponent(id)}`,
      body,
    )
    return transformCustomer(res)
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`customers/${encodeURIComponent(id)}`)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const { page, perPage } = this.pageParams(params)
    const res = await this.clientFor(credentials).list<RawSyliusOrder>(
      'orders',
      { page, perPage },
    )
    return res.items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const res = await this.clientFor(credentials).get<RawSyliusOrder>(
      `orders/${encodeURIComponent(id)}`,
    )
    return transformOrder(res)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const body: Record<string, unknown> = {
      customer: data.customerId
        ? `/api/v2/admin/customers/${data.customerId}`
        : undefined,
      currencyCode: data.currency ?? 'USD',
      localeCode: 'en_US',
      notes: data.note,
    }
    const res = await this.clientFor(credentials).post<RawSyliusOrder>('orders', body)
    return transformOrder(res)
  }

  async updateOrder(
    credentials: Credentials,
    id: string,
    data: Partial<Order>,
  ): Promise<Order> {
    const body: Record<string, unknown> = {
      notes: data.note,
    }
    const res = await this.clientFor(credentials).patch<RawSyliusOrder>(
      `orders/${encodeURIComponent(id)}`,
      body,
    )
    return transformOrder(res)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Order> {
    const client = this.clientFor(credentials)
    // Sylius uses a state machine transition endpoint
    await client.patch(`orders/${encodeURIComponent(id)}/cancel`, {})
    const refreshed = await client.get<RawSyliusOrder>(
      `orders/${encodeURIComponent(id)}`,
    )
    return transformOrder(refreshed)
  }

  // ── Fulfillments ──────────────────────────────────────────────────────────

  async listFulfillments(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Fulfillment[]> {
    const { page, perPage } = this.pageParams(params)
    const filter: Record<string, string | number> = {}
    const orderId = (params['orderId'] ?? params['order_id']) as string | undefined
    if (orderId) filter['order'] = orderId
    const res = await this.clientFor(credentials).list<RawSyliusShipment>(
      'shipments',
      { page, perPage, filter },
    )
    return res.items.map(transformFulfillment)
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    const res = await this.clientFor(credentials).get<RawSyliusShipment>(
      `shipments/${encodeURIComponent(id)}`,
    )
    return transformFulfillment(res)
  }

  async createFulfillment(
    credentials: Credentials,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    if (!data.orderId) {
      throw new Error('Sylius createFulfillment requires orderId')
    }
    const res = await this.clientFor(credentials).post<RawSyliusShipment>(
      'shipments',
      untransformFulfillment(data),
    )
    return transformFulfillment(res)
  }

  async updateFulfillment(
    credentials: Credentials,
    id: string,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    const res = await this.clientFor(credentials).patch<RawSyliusShipment>(
      `shipments/${encodeURIComponent(id)}`,
      untransformFulfillment(data),
    )
    return transformFulfillment(res)
  }

  async cancelFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    const client = this.clientFor(credentials)
    await client.patch(`shipments/${encodeURIComponent(id)}/cancel`, {})
    const refreshed = await client.get<RawSyliusShipment>(
      `shipments/${encodeURIComponent(id)}`,
    )
    return transformFulfillment(refreshed)
  }

  // ── Refunds ───────────────────────────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const { page, perPage } = this.pageParams(params)
    const res = await this.clientFor(credentials).list<RawSyliusRefund>(
      'refund-payments',
      { page, perPage },
    )
    return res.items.map(transformRefund)
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const res = await this.clientFor(credentials).get<RawSyliusRefund>(
      `refund-payments/${encodeURIComponent(id)}`,
    )
    return transformRefund(res)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.orderId) throw new Error('createRefund requires orderId')
    const res = await this.clientFor(credentials).post<RawSyliusRefund>(
      'refund-payments',
      untransformRefund(data),
    )
    return transformRefund(res)
  }

  // ── Transactions ──────────────────────────────────────────────────────────

  async listTransactions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Transaction[]> {
    const { page, perPage } = this.pageParams(params)
    const filter: Record<string, string | number> = {}
    const orderId = (params['orderId'] ?? params['order_id']) as string | undefined
    if (orderId) filter['order'] = orderId
    const res = await this.clientFor(credentials).list<RawSyliusPayment>(
      'payments',
      { page, perPage, filter },
    )
    return res.items.map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const res = await this.clientFor(credentials).get<RawSyliusPayment>(
      `payments/${encodeURIComponent(id)}`,
    )
    return transformTransaction(res)
  }

  async createTransaction(
    credentials: Credentials,
    data: Partial<Transaction>,
  ): Promise<Transaction> {
    const res = await this.clientFor(credentials).post<RawSyliusPayment>(
      'payments',
      untransformTransaction(data),
    )
    return transformTransaction(res)
  }

  // ── Discounts ─────────────────────────────────────────────────────────────

  async listDiscounts(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Discount[]> {
    const { page, perPage } = this.pageParams(params)
    const res = await this.clientFor(credentials).list<RawSyliusPromotion>(
      'promotions',
      { page, perPage },
    )
    return res.items.map(transformDiscount)
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const res = await this.clientFor(credentials).get<RawSyliusPromotion>(
      `promotions/${encodeURIComponent(id)}`,
    )
    return transformDiscount(res)
  }

  async createDiscount(
    credentials: Credentials,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const res = await this.clientFor(credentials).post<RawSyliusPromotion>(
      'promotions',
      untransformDiscount(data),
    )
    return transformDiscount(res)
  }

  async updateDiscount(
    credentials: Credentials,
    id: string,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const res = await this.clientFor(credentials).patch<RawSyliusPromotion>(
      `promotions/${encodeURIComponent(id)}`,
      untransformDiscount(data),
    )
    return transformDiscount(res)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`promotions/${encodeURIComponent(id)}`)
  }
}
