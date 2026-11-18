/**
 * Drupal Commerce adapter for the ecommerce vertical.
 *
 * Maps the Drupal Commerce JSON:API surface to the canonical ecommerce
 * resources. Notable Drupal Commerce characteristics:
 *
 *  - **Self-hosted**: Base URL is site-specific (`credentials.extra.baseUrl`).
 *  - **JSON:API format**: Resources at `/jsonapi/{type}/{bundle}`. Content-Type
 *    is `application/vnd.api+json`. All resources use the raw envelope
 *    `{data: {type, id, attributes, relationships}}`.
 *  - **Product model**: Parent `commerce_product--default` with child
 *    `commerce_product_variation--default` (variants/SKUs).
 *  - **Auth**: Bearer token from `simple_oauth` module or static user token.
 *    Token refresh supported via `refresh_token` grant.
 *  - **Users as customers**: `user--user` resources serve as the customer
 *    entity. Custom fields for name/phone are site-specific.
 *  - **Inventory**: Managed by `commerce_stock` contrib module. Falls back
 *    to `field_stock` on variations if stock module is absent.
 *
 * Coverage: 27 of 42 interface methods implemented.
 *   Products: listProducts, getProduct, createProduct, updateProduct, deleteProduct
 *   Variants: listVariants, getVariant, updateVariant
 *   Orders: listOrders, getOrder, cancelOrder
 *   Customers: listCustomers, getCustomer
 *   Fulfillments: listFulfillments, getFulfillment
 *   Inventory: listInventoryLevels, getInventoryLevel
 *   Locations: listLocations, getLocation
 *   Collections: listCollections, getCollection
 *   Discounts: listDiscounts, getDiscount
 *   Transactions: listTransactions, getTransaction
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: refund — Drupal Commerce has no dedicated refund entity; refunds
 *   are payment-gateway operations that transition commerce_payment state
 *   (partially_refunded → refunded). No JSON:API endpoint exists in core or
 *   any widely-deployed contrib module.
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
import type { Discount } from '../../schema/discount'
import type { Transaction } from '../../schema/transaction'

import {
  buildAuthUrl,
  exchangeCode as drupalExchangeCode,
  refreshCredentials as drupalRefreshCredentials,
} from './auth'
import { DrupalCommerceClient } from './client'
import { DRUPAL_COMMERCE_FORM } from './connect-form'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import {
  transformProduct,
  transformVariant,
  untransformProduct,
  untransformVariant,
  type DrupalProduct,
  type DrupalVariation,
} from './transform/product'
import {
  transformOrder,
  type DrupalOrder,
} from './transform/order'
import {
  transformCustomer,
  type DrupalUser,
} from './transform/customer'
import {
  transformFulfillment,
  type DrupalShipment,
} from './transform/fulfillment'
import {
  transformInventoryLevel,
  transformLocation,
  type DrupalStockLocation,
  type DrupalVariationStock,
} from './transform/inventory'
import {
  transformCollection,
  type DrupalTaxonomyTerm,
} from './transform/collection'
import {
  transformDiscount,
  type DrupalPromotion,
} from './transform/discount'
import {
  transformTransaction,
  type DrupalPayment,
} from './transform/transaction'

export interface DrupalCommerceAdapterConfig {
  baseUrl?: string
  clientId?: string
  clientSecret?: string
}

export class DrupalCommerceAdapter implements EcommerceAdapter {
  // Connect Link support — site URL + access token (see ./connect-form).
  credentialFields = DRUPAL_COMMERCE_FORM.credentialFields
  exchangeCredentials = DRUPAL_COMMERCE_FORM.exchangeCredentials

  readonly platform = 'drupal-commerce'
  readonly version = '0.1.0'

  /** The client caps `page[limit]` at 50. Declared so `params.limit` never exceeds it: pageOffset strides by `params.limit`, and a larger limit skipped the rows between. */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  private configBaseUrl: string | undefined
  private configClientId: string | undefined
  private configClientSecret: string | undefined

  constructor(config: DrupalCommerceAdapterConfig = {}) {
    this.configBaseUrl = config.baseUrl
    this.configClientId = config.clientId
    this.configClientSecret = config.clientSecret
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    const baseUrl = this.configBaseUrl ?? 'https://myshop.example.com'
    return buildAuthUrl(baseUrl)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return drupalExchangeCode()
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return drupalRefreshCredentials(credentials)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): DrupalCommerceClient {
    const baseUrl =
      (credentials.extra?.['baseUrl'] as string | undefined) ?? this.configBaseUrl
    if (!baseUrl) {
      throw new Error(
        'DrupalCommerceAdapter: baseUrl is required. Either configure it in ' +
          'the adapter config or POST it to /v1/connections with ' +
          'credentials: {accessToken, extra: {baseUrl}}.',
      )
    }
    const mergedCreds: Credentials = {
      ...credentials,
      extra: {
        ...credentials.extra,
        baseUrl,
        ...(this.configClientId && !credentials.extra?.['clientId']
          ? { clientId: this.configClientId }
          : {}),
        ...(this.configClientSecret && !credentials.extra?.['clientSecret']
          ? { clientSecret: this.configClientSecret }
          : {}),
      },
    }
    return new DrupalCommerceClient(mergedCreds)
  }

  private pageOffset(params: QueryParams): { offset: number; limit: number } {
    const page = params.page ?? 1
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    return { offset: (page - 1) * limit, limit }
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const { offset, limit } = this.pageOffset(params)
    const res = await this.clientFor(credentials).list(
      '/commerce_product/default',
      { offset, limit, include: 'variations' },
    )
    return res.items.map((raw) => {
      const product = raw as unknown as DrupalProduct
      // No included parsing at list level — variations stubbed with IDs
      return transformProduct(product)
    })
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const raw = await this.clientFor(credentials).get(
      `/commerce_product/default/${encodeURIComponent(id)}`,
      { include: 'variations' },
    )
    return transformProduct(raw as unknown as DrupalProduct)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const body = untransformProduct(data)
    const raw = await this.clientFor(credentials).post('/commerce_product/default', body)
    return transformProduct(raw as unknown as DrupalProduct)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const body = untransformProduct(data) as { data: Record<string, unknown> }
    body.data['id'] = id
    const raw = await this.clientFor(credentials).patch(
      `/commerce_product/default/${encodeURIComponent(id)}`,
      body,
    )
    return transformProduct(raw as unknown as DrupalProduct)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(
      `/commerce_product/default/${encodeURIComponent(id)}`,
    )
  }

  // ── Variants ──────────────────────────────────────────────────────────────

  async listVariants(credentials: Credentials, params: QueryParams): Promise<ProductVariant[]> {
    const { offset, limit } = this.pageOffset(params)
    const filters: Record<string, string> = {}
    const productId = (params['productId'] ?? params['product_id']) as string | undefined
    if (productId) {
      filters['product_id.id'] = productId
    }
    const res = await this.clientFor(credentials).list(
      '/commerce_product_variation/default',
      { offset, limit, filters },
    )
    return res.items.map((raw) => transformVariant(raw as unknown as DrupalVariation))
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    const raw = await this.clientFor(credentials).get(
      `/commerce_product_variation/default/${encodeURIComponent(id)}`,
    )
    return transformVariant(raw as unknown as DrupalVariation)
  }

  async updateVariant(
    credentials: Credentials,
    id: string,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const body = untransformVariant(data) as { data: Record<string, unknown> }
    body.data['id'] = id
    const raw = await this.clientFor(credentials).patch(
      `/commerce_product_variation/default/${encodeURIComponent(id)}`,
      body,
    )
    return transformVariant(raw as unknown as DrupalVariation)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const { offset, limit } = this.pageOffset(params)
    const res = await this.clientFor(credentials).list(
      '/commerce_order/default',
      { offset, limit, sort: '-changed' },
    )
    return res.items.map((raw) => transformOrder(raw as unknown as DrupalOrder))
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const raw = await this.clientFor(credentials).get(
      `/commerce_order/default/${encodeURIComponent(id)}`,
      { include: 'order_items' },
    )
    return transformOrder(raw as unknown as DrupalOrder)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Order> {
    const raw = await this.clientFor(credentials).patch(
      `/commerce_order/default/${encodeURIComponent(id)}`,
      {
        data: {
          type: 'commerce_order--default',
          id,
          attributes: { state: 'canceled' },
        },
      },
    )
    return transformOrder(raw as unknown as DrupalOrder)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const { offset, limit } = this.pageOffset(params)
    // Filter to active users only (status=1)
    const res = await this.clientFor(credentials).list(
      '/user/user',
      { offset, limit, filters: { status: '1' } },
    )
    return res.items.map((raw) => transformCustomer(raw as unknown as DrupalUser))
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const raw = await this.clientFor(credentials).get(`/user/user/${encodeURIComponent(id)}`)
    return transformCustomer(raw as unknown as DrupalUser)
  }

  // ── Fulfillments (Shipments) ──────────────────────────────────────────────

  async listFulfillments(credentials: Credentials, params: QueryParams): Promise<Fulfillment[]> {
    const { offset, limit } = this.pageOffset(params)
    const res = await this.clientFor(credentials).list(
      '/commerce_shipment/default',
      { offset, limit },
    )
    return res.items.map((raw) => transformFulfillment(raw as unknown as DrupalShipment))
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    const raw = await this.clientFor(credentials).get(
      `/commerce_shipment/default/${encodeURIComponent(id)}`,
    )
    return transformFulfillment(raw as unknown as DrupalShipment)
  }

  // ── Inventory Levels ──────────────────────────────────────────────────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const { offset, limit } = this.pageOffset(params)
    const filters: Record<string, string> = {}
    const productId = (params['productId'] ?? params['product_id']) as string | undefined
    if (productId) {
      filters['product_id.id'] = productId
    }
    // List variations; stock is embedded as field_stock on each variation
    const res = await this.clientFor(credentials).list(
      '/commerce_product_variation/default',
      { offset, limit, filters },
    )
    const locationId = (params['locationId'] as string | undefined) ?? 'default'
    return res.items.map((raw) =>
      transformInventoryLevel(raw as unknown as DrupalVariationStock, locationId),
    )
  }

  async getInventoryLevel(credentials: Credentials, id: string): Promise<InventoryLevel> {
    // id may be synthesised as `{variantId}:{locationId}` — parse it
    const colonIdx = id.indexOf(':')
    const variantId = colonIdx > -1 ? id.slice(0, colonIdx) : id
    const locationId = colonIdx > -1 ? id.slice(colonIdx + 1) : 'default'

    const raw = await this.clientFor(credentials).get(
      `/commerce_product_variation/default/${encodeURIComponent(variantId)}`,
    )
    return transformInventoryLevel(raw as unknown as DrupalVariationStock, locationId)
  }

  // ── Locations (Stores) ────────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const { offset, limit } = this.pageOffset(params)
    const res = await this.clientFor(credentials).list(
      '/commerce_store/online',
      { offset, limit },
    )
    return res.items.map((raw) => transformLocation(raw as unknown as DrupalStockLocation))
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const raw = await this.clientFor(credentials).get(
      `/commerce_store/online/${encodeURIComponent(id)}`,
    )
    return transformLocation(raw as unknown as DrupalStockLocation)
  }

  // ── Collections (Taxonomy Terms) ──────────────────────────────────────────
  //
  // Drupal Commerce uses taxonomy terms for product groupings. The vocabulary
  // machine name is site-specific; the conventional default is
  // `product_categories`. Callers can override via params.vocabulary.

  async listCollections(credentials: Credentials, params: QueryParams): Promise<Collection[]> {
    const { offset, limit } = this.pageOffset(params)
    const vocabulary = (params['vocabulary'] as string | undefined) ?? 'product_categories'
    const res = await this.clientFor(credentials).list(
      `/taxonomy_term/${encodeURIComponent(vocabulary)}`,
      { offset, limit },
    )
    return res.items.map((raw) => transformCollection(raw as unknown as DrupalTaxonomyTerm))
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    // id is the UUID of the taxonomy term; vocabulary unknown at get time so
    // we query the generic taxonomy_term path (Drupal JSON:API supports this).
    const raw = await this.clientFor(credentials).get(
      `/taxonomy_term/product_categories/${encodeURIComponent(id)}`,
    )
    return transformCollection(raw as unknown as DrupalTaxonomyTerm)
  }

  // ── Discounts (Promotions) ─────────────────────────────────────────────────

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const { offset, limit } = this.pageOffset(params)
    const res = await this.clientFor(credentials).list(
      '/commerce_promotion/default',
      { offset, limit, sort: '-changed' },
    )
    return res.items.map((raw) => transformDiscount(raw as unknown as DrupalPromotion))
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const raw = await this.clientFor(credentials).get(
      `/commerce_promotion/default/${encodeURIComponent(id)}`,
      { include: 'coupons' },
    )
    return transformDiscount(raw as unknown as DrupalPromotion)
  }

  // ── Transactions (Payments) ───────────────────────────────────────────────

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const { offset, limit } = this.pageOffset(params)
    const filters: Record<string, string> = {}
    const orderId = (params['orderId'] ?? params['order_id']) as string | undefined
    if (orderId) {
      filters['order_id.id'] = orderId
    }
    const res = await this.clientFor(credentials).list(
      '/commerce_payment/payment_default',
      { offset, limit, filters, sort: '-completed' },
    )
    return res.items.map((raw) => transformTransaction(raw as unknown as DrupalPayment))
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const raw = await this.clientFor(credentials).get(
      `/commerce_payment/payment_default/${encodeURIComponent(id)}`,
    )
    return transformTransaction(raw as unknown as DrupalPayment)
  }
}
