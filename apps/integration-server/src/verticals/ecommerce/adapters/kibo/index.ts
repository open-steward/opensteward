/**
 * Kibo Commerce adapter for the ecommerce vertical.
 *
 * Maps the Kibo Commerce REST API to the canonical ecommerce resources.
 * Notable Kibo characteristics:
 *
 *  - **Multi-tenant SaaS**: each tenant gets a subdomain (`{tenant}.mozu.com`)
 *    or uses the shared gateway (`api.mozu.com`).
 *  - **OAuth2 client_credentials**: No authorization code exchange.
 *  - **JSON envelope responses**: Collections wrapped in
 *    `{ items, totalCount, pageSize, startIndex }`.
 *  - **Decimal money**: All monetary values are decimal (not cents).
 *  - **Integer IDs for customers**: Customer account IDs are integers.
 *
 * Coverage: products, variants, customers, orders (~20 interface methods).
 */

import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product, ProductVariant } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { Discount } from '../../schema/discount'
import type { Fulfillment } from '../../schema/fulfillment'
import type { InventoryLevel } from '../../schema/inventory'
import type { Location } from '../../schema/location'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { Refund } from '../../schema/refund'
import type { Transaction } from '../../schema/transaction'

import {
  CREDENTIAL_FIELDS as KIBO_CREDENTIAL_FIELDS,
  exchangeCredentials as kiboExchangeCredentials,
  getAuthUrl as kiboGetAuthUrl,
  exchangeCode as kiboExchangeCode,
  refreshCredentials as kiboRefreshCredentials,
} from './auth'
import { KiboClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import { transformProduct, transformProductVariant, type RawKiboProduct, type RawKiboVariation } from './transform/product'
import { transformOrder, type RawKiboOrder } from './transform/order'
import { transformCustomer, type RawKiboCustomer } from './transform/customer'
import { transformCollection, type RawKiboCategory } from './transform/collection'
import { transformDiscount, type RawKiboDiscount } from './transform/discount'
import { transformFulfillment, type RawKiboPackage } from './transform/fulfillment'
import { transformInventoryLevel, type RawKiboInventory } from './transform/inventory'
import { transformLocation, type RawKiboLocation } from './transform/location'
import { transformRefund, type RawKiboCredit } from './transform/refund'
import { transformTransaction, type RawKiboPayment } from './transform/transaction'

export interface KiboAdapterConfig {
  tenant?: string
  clientId?: string
  clientSecret?: string
}

export class KiboAdapter implements EcommerceAdapter {
  readonly platform = 'kibo'
  readonly version = '0.1.0'

  /** The tenant host is the customer's: its API and its token endpoint both live there. */
  credentialFields(): CredentialField[] {
    return KIBO_CREDENTIAL_FIELDS
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return kiboExchangeCredentials(fields)
  }

  private configTenant: string | undefined
  private configClientId: string | undefined
  private configClientSecret: string | undefined

  constructor(config: KiboAdapterConfig = {}) {
    this.configTenant = config.tenant
    this.configClientId = config.clientId
    this.configClientSecret = config.clientSecret
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    return kiboGetAuthUrl(_state)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return kiboExchangeCode()
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return kiboRefreshCredentials(credentials)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): KiboClient {
    const tenant =
      (credentials.extra?.['tenant'] as string | undefined) ?? this.configTenant
    const clientId =
      (credentials.extra?.['clientId'] as string | undefined) ?? this.configClientId
    const clientSecret =
      (credentials.extra?.['clientSecret'] as string | undefined) ?? this.configClientSecret

    if (!credentials.accessToken && (!clientId || !clientSecret)) {
      throw new Error(
        'Kibo adapter needs either an accessToken or (clientId + clientSecret) ' +
          'to mint one. Re-create the connection with the required fields.',
      )
    }

    const mergedCreds: Credentials = {
      ...credentials,
      accessToken: credentials.accessToken || 'pending',
      extra: {
        ...credentials.extra,
        ...(tenant ? { tenant } : {}),
        ...(clientId ? { clientId } : {}),
        ...(clientSecret ? { clientSecret } : {}),
      },
    }
    return new KiboClient(mergedCreds)
  }

  private pageParams(params: QueryParams): { startIndex: number; pageSize: number } {
    const page = (params.page as number | undefined) ?? 1
    const pageSize = (params.limit as number | undefined) ?? DEFAULT_PAGE_SIZE
    return {
      startIndex: (page - 1) * pageSize,
      pageSize,
    }
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const { startIndex, pageSize } = this.pageParams(params)
    const res = await this.clientFor(credentials).list<RawKiboProduct>(
      '/api/commerce/catalog/storefront/products',
      { startIndex, pageSize },
    )
    return res.items.map((p) => transformProduct(p))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const raw = await this.clientFor(credentials).get<RawKiboProduct>(
      `/api/commerce/catalog/storefront/products/${encodeURIComponent(id)}`,
    )
    return transformProduct(raw)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const body: Record<string, unknown> = {
      productCode: data.id,
      content: {
        productName: data.title,
        productFullDescription: data.description,
        seoFriendlyUrl: data.handle,
      },
      isActive: data.status === 'ACTIVE',
    }
    const raw = await this.clientFor(credentials).post<RawKiboProduct>(
      '/api/commerce/catalog/admin/products',
      body,
    )
    return transformProduct(raw)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const body: Record<string, unknown> = {
      productCode: id,
      content: {
        productName: data.title,
        productFullDescription: data.description,
        seoFriendlyUrl: data.handle,
      },
      isActive: data.status === 'ACTIVE',
    }
    const raw = await this.clientFor(credentials).put<RawKiboProduct>(
      `/api/commerce/catalog/admin/products/${encodeURIComponent(id)}`,
      body,
    )
    return transformProduct(raw)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(
      `/api/commerce/catalog/admin/products/${encodeURIComponent(id)}`,
    )
  }

  // ── Variants ──────────────────────────────────────────────────────────────

  async listVariants(credentials: Credentials, params: QueryParams): Promise<ProductVariant[]> {
    const productId = (params['productId'] ?? params['product_id']) as string | undefined
    if (!productId) {
      throw new Error(
        'Kibo requires ?productId= for listVariants; variants are part of a parent product.',
      )
    }
    const raw = await this.clientFor(credentials).get<RawKiboProduct>(
      `/api/commerce/catalog/storefront/products/${encodeURIComponent(productId)}`,
    )
    const variations = raw.variations ?? []
    return variations.map((v) => transformProductVariant(v, productId, raw.currencyCode as string ?? 'USD'))
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    // Kibo variation product codes are standalone product codes
    const raw = await this.clientFor(credentials).get<RawKiboProduct>(
      `/api/commerce/catalog/storefront/products/${encodeURIComponent(id)}`,
    )
    // Treat the fetched product as a variation
    const variation: RawKiboVariation = {
      productCode: raw.productCode,
      price: raw.price,
      inventoryInfo: raw.inventoryInfo,
      isActive: raw.isActive,
    }
    return transformProductVariant(variation, '', 'USD')
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const { startIndex, pageSize } = this.pageParams(params)
    const res = await this.clientFor(credentials).list<RawKiboCustomer>(
      '/api/commerce/customer/accounts',
      { startIndex, pageSize },
    )
    return res.items.map((c) => transformCustomer(c))
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const raw = await this.clientFor(credentials).get<RawKiboCustomer>(
      `/api/commerce/customer/accounts/${encodeURIComponent(id)}`,
    )
    return transformCustomer(raw)
  }

  async createCustomer(credentials: Credentials, data: Partial<Customer>): Promise<Customer> {
    const body: Record<string, unknown> = {
      emailAddress: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
      acceptsMarketing: data.acceptsMarketing,
    }
    const raw = await this.clientFor(credentials).post<RawKiboCustomer>(
      '/api/commerce/customer/accounts',
      body,
    )
    return transformCustomer(raw)
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const body: Record<string, unknown> = {
      id: Number(id),
      emailAddress: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
      acceptsMarketing: data.acceptsMarketing,
    }
    const raw = await this.clientFor(credentials).put<RawKiboCustomer>(
      `/api/commerce/customer/accounts/${encodeURIComponent(id)}`,
      body,
    )
    return transformCustomer(raw)
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(
      `/api/commerce/customer/accounts/${encodeURIComponent(id)}`,
    )
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const { startIndex, pageSize } = this.pageParams(params)
    const res = await this.clientFor(credentials).list<RawKiboOrder>(
      '/api/commerce/orders',
      { startIndex, pageSize },
    )
    return res.items.map((o) => transformOrder(o))
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const raw = await this.clientFor(credentials).get<RawKiboOrder>(
      `/api/commerce/orders/${encodeURIComponent(id)}`,
    )
    return transformOrder(raw)
  }

  async updateOrder(
    credentials: Credentials,
    id: string,
    data: Partial<Order>,
  ): Promise<Order> {
    // Kibo supports partial order updates (notes, status transitions)
    const body: Record<string, unknown> = {}
    if (data.note) {
      body['notes'] = [{ text: data.note }]
    }
    const raw = await this.clientFor(credentials).put<RawKiboOrder>(
      `/api/commerce/orders/${encodeURIComponent(id)}`,
      body,
    )
    return transformOrder(raw)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Order> {
    const raw = await this.clientFor(credentials).post<RawKiboOrder>(
      `/api/commerce/orders/${encodeURIComponent(id)}/cancel`,
      { canceledReasonCode: _data?.reason ?? 'OTHER' },
    )
    return transformOrder(raw)
  }

  // ── Collections (Categories) ──────────────────────────────────────────────

  async listCollections(credentials: Credentials, params: QueryParams): Promise<Collection[]> {
    const { startIndex, pageSize } = this.pageParams(params)
    const res = await this.clientFor(credentials).list<RawKiboCategory>(
      '/api/commerce/catalog/storefront/categories',
      { startIndex, pageSize },
    )
    return res.items.map(transformCollection)
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const raw = await this.clientFor(credentials).get<RawKiboCategory>(
      `/api/commerce/catalog/storefront/categories/${encodeURIComponent(id)}`,
    )
    return transformCollection(raw)
  }

  // ── Discounts (Promotions) ─────────────────────────────────────────────────

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const { startIndex, pageSize } = this.pageParams(params)
    const res = await this.clientFor(credentials).list<RawKiboDiscount>(
      '/api/commerce/catalog/admin/discounts',
      { startIndex, pageSize },
    )
    return res.items.map(transformDiscount)
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const raw = await this.clientFor(credentials).get<RawKiboDiscount>(
      `/api/commerce/catalog/admin/discounts/${encodeURIComponent(id)}`,
    )
    return transformDiscount(raw)
  }

  // ── Fulfillments (Packages) ────────────────────────────────────────────────

  async listFulfillments(credentials: Credentials, params: QueryParams): Promise<Fulfillment[]> {
    const orderId = (params['orderId'] ?? params['order_id']) as string | undefined
    if (!orderId) return []
    const res = await this.clientFor(credentials).list<RawKiboPackage>(
      `/api/commerce/orders/${encodeURIComponent(orderId)}/packages`,
      {},
    )
    return res.items.map((p) => transformFulfillment(p, orderId))
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    // id format: `{orderId}:{packageId}`
    const [orderId, packageId] = id.includes(':') ? id.split(':') : [id, id]
    const raw = await this.clientFor(credentials).get<RawKiboPackage>(
      `/api/commerce/orders/${encodeURIComponent(orderId ?? '')}/packages/${encodeURIComponent(packageId ?? '')}`,
    )
    return transformFulfillment(raw, orderId)
  }

  // ── Inventory ──────────────────────────────────────────────────────────────

  async listInventoryLevels(credentials: Credentials, params: QueryParams): Promise<InventoryLevel[]> {
    const productCode = (params['productCode'] ?? params['productId']) as string | undefined
    if (!productCode) return []
    const res = await this.clientFor(credentials).list<RawKiboInventory>(
      `/api/commerce/catalog/storefront/products/${encodeURIComponent(productCode)}/locationinventory`,
      {},
    )
    return res.items.map(transformInventoryLevel)
  }

  async getInventoryLevel(credentials: Credentials, id: string): Promise<InventoryLevel> {
    // id format: `{variantId}:{locationId}`
    const [variantId, locationId] = id.includes(':') ? id.split(':') : [id, 'default']
    const res = await this.clientFor(credentials).list<RawKiboInventory>(
      `/api/commerce/catalog/storefront/products/${encodeURIComponent(variantId ?? '')}/locationinventory`,
      {},
    )
    const found = res.items.find((i) => i.locationCode === locationId) ?? res.items[0]
    if (!found) throw new Error(`Kibo inventory not found for ${id}`)
    return transformInventoryLevel(found)
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const { startIndex, pageSize } = this.pageParams(params)
    const res = await this.clientFor(credentials).list<RawKiboLocation>(
      '/api/commerce/catalog/admin/locationgroups/directship/locations',
      { startIndex, pageSize },
    )
    return res.items.map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const raw = await this.clientFor(credentials).get<RawKiboLocation>(
      `/api/commerce/catalog/admin/locationgroups/directship/locations/${encodeURIComponent(id)}`,
    )
    return transformLocation(raw)
  }

  // ── Refunds (Credits) ─────────────────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const orderId = (params['orderId'] ?? params['order_id']) as string | undefined
    if (!orderId) return []
    const res = await this.clientFor(credentials).list<RawKiboCredit>(
      `/api/commerce/orders/${encodeURIComponent(orderId)}/credits`,
      {},
    )
    return res.items.map((c) => transformRefund(c, orderId))
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    // id format: `{orderId}:{creditId}`
    const [orderId, creditId] = id.includes(':') ? id.split(':') : [id, id]
    const raw = await this.clientFor(credentials).get<RawKiboCredit>(
      `/api/commerce/orders/${encodeURIComponent(orderId ?? '')}/credits/${encodeURIComponent(creditId ?? '')}`,
    )
    return transformRefund(raw, orderId)
  }

  // ── Transactions (Payments) ────────────────────────────────────────────────

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const orderId = (params['orderId'] ?? params['order_id']) as string | undefined
    if (!orderId) return []
    const res = await this.clientFor(credentials).list<RawKiboPayment>(
      `/api/commerce/orders/${encodeURIComponent(orderId)}/payments`,
      {},
    )
    return res.items.map((p) => transformTransaction(p, orderId))
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    // id format: `{orderId}:{paymentId}`
    const [orderId, paymentId] = id.includes(':') ? id.split(':') : [id, id]
    const raw = await this.clientFor(credentials).get<RawKiboPayment>(
      `/api/commerce/orders/${encodeURIComponent(orderId ?? '')}/payments/${encodeURIComponent(paymentId ?? '')}`,
    )
    return transformTransaction(raw, orderId)
  }
}
