/**
 * Epos Now adapter for the ecommerce vertical.
 *
 * Maps the Epos Now REST API v4 to canonical ecommerce resources. Epos Now
 * is an EU-focused cloud POS platform with 100k+ venues. Auth via OAuth2 or
 * API key (Basic auth). Base URL: `https://api.eposnowhq.com/api/v4/`.
 *
 * Supported resources: Products, Categories (Collections), Customers,
 * Transactions (Orders), Locations, Inventory (ProductStock), Tenders (Transactions),
 * Discounts, Refunds.
 *
 * Omitted resources (-> 501): Variants (flat product model, no parent-child),
 * Fulfillments (POS -- no shipping concept), createTransaction (POS payments).
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import { pageOffset, reportUpstreamPage } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { Location } from '../../schema/location'
import type { InventoryLevel } from '../../schema/inventory'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { Refund } from '../../schema/refund'
import type { Transaction } from '../../schema/transaction'
import type { Discount } from '../../schema/discount'
import type { WebhookEvent } from '../../schema/webhook'

import { exchangeCode as eposNowExchangeCode, refreshAccessToken } from './auth'
import { EposNowClient } from './client'
import { AUTH_URL, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { verifyEposNowWebhook, parseEposNowWebhookEvents } from './webhook'

import { transformProduct, untransformProduct, type RawEposNowProduct } from './transform/product'
import { transformCollection, untransformCollection, type RawEposNowCategory } from './transform/collection'
import { transformLocation, type RawEposNowLocation } from './transform/location'
import {
  transformInventoryLevel,
  transformProductStock,
  type RawEposNowProductStock,
  type RawEposNowStock,
} from './transform/inventory'
import { transformCustomer, untransformCustomer, type RawEposNowCustomer } from './transform/customer'
import { transformOrder, untransformOrder, type RawEposNowTransaction } from './transform/order'
import { transformRefund, untransformRefund, type RawEposNowRefund } from './transform/refund'
import { transformTransaction, type RawEposNowTender } from './transform/transaction'
import { transformDiscount, untransformDiscount, type RawEposNowDiscount } from './transform/discount'

// ── Resource coverage ──────────────────────────────────────────────────────
// Unavailable: fulfillment — Epos Now is a POS platform with no shipping or
//   fulfillment concept; no fulfillment endpoint exists in the v4 API.

/**
 * OAuth client credentials, set as adapter config like every other OAuth
 * adapter's. `EPOSNOW_CLIENT_ID` / `_CLIENT_SECRET` / `_REDIRECT_URI` are a
 * deprecated fallback, read per key only when the config leaves that key unset.
 */
export interface EposNowAdapterConfig {
  clientId?: string
  clientSecret?: string
  redirectUri?: string
}

/** A string with something other than whitespace in it. The admin API stores
 *  whatever JSON it is sent, so a config key can also be a number or a boolean. */
function isSet(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

/** Config value, else the deprecated env value. '' counts as unset on both sides:
 *  the admin credentials form saves a blank field as '', which must not hide
 *  an env value an existing deployment relies on. */
function configOrEnv(configValue: unknown, envValue: string | undefined): string | undefined {
  if (isSet(configValue)) return configValue
  return isSet(envValue) ? envValue : undefined
}

export class EposNowAdapter implements EcommerceAdapter {
  readonly platform = 'eposnow'
  readonly version = '0.1.0'
  /** V4 serves a fixed 200 rows per `page`; the sync must not ask for more. */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  private readonly config: EposNowAdapterConfig
  private readonly warnedEnvFallback = new Set<string>()

  constructor(config: EposNowAdapterConfig = {}) {
    this.config = config
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  // The env reads stay literal: scripts/generate-env-example.ts only finds a
  // name spelled out in the source, and its entries mark these as deprecated.

  /** `key` from the config, else the deprecated env variable. Taking it from
   *  the env raises a DeprecationWarning naming the variable, once per adapter
   *  instance (the registry builds a new one whenever the config changes). */
  private setting(
    key: keyof EposNowAdapterConfig,
    envName: string,
    envValue: string | undefined,
  ): string | undefined {
    const value = configOrEnv(this.config[key], envValue)
    if (value !== undefined && !isSet(this.config[key]) && !this.warnedEnvFallback.has(envName)) {
      this.warnedEnvFallback.add(envName)
      process.emitWarning(
        `${envName} is a deprecated fallback for the eposnow adapter config, which has no ${key}. ` +
          `Set ${key} in the adapter config; the fallback will be removed.`,
        { type: 'DeprecationWarning', code: 'OST_EPOSNOW_ENV_FALLBACK' },
      )
    }
    return value
  }

  /** The client pair, or a throw naming what is missing before anything is
   *  sent: authorize checks the secret too, so a user is never sent through
   *  consent only for the exchange to fail. */
  private clientPair(operation: string): { clientId: string; clientSecret: string } {
    const clientId = this.setting('clientId', 'EPOSNOW_CLIENT_ID', process.env['EPOSNOW_CLIENT_ID'])
    const clientSecret = this.setting(
      'clientSecret',
      'EPOSNOW_CLIENT_SECRET',
      process.env['EPOSNOW_CLIENT_SECRET'],
    )
    if (!clientId || !clientSecret) {
      const missing = [clientId ? '' : 'clientId', clientSecret ? '' : 'clientSecret']
        .filter(Boolean)
        .join(' and ')
      throw new Error(`Epos Now ${operation} requires ${missing} in the eposnow adapter config.`)
    }
    return { clientId, clientSecret }
  }

  getAuthUrl(state: string): string {
    const { clientId } = this.clientPair('getAuthUrl')
    const redirectUri =
      this.setting('redirectUri', 'EPOSNOW_REDIRECT_URI', process.env['EPOSNOW_REDIRECT_URI']) ?? ''
    return `${AUTH_URL}?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${encodeURIComponent(state)}`
  }

  /** `redirectUri` is the one the router passes, not the configured one. */
  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    const { clientId, clientSecret } = this.clientPair('exchangeCode')
    return eposNowExchangeCode(code, redirectUri, clientId, clientSecret)
  }

  /** Uses the client pair the exchange stored in `credentials.extra`, never the
   *  current config: a refresh token is bound to the client that minted it. */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshAccessToken(credentials)
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyEposNowWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseEposNowWebhookEvents(payload)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): EposNowClient {
    return new EposNowClient(credentials)
  }

  /**
   * The caller's 1-based page of a V4 list, sliced from Epos Now's fixed
   * 200-row pages. `limit` is clamped to [1, 200] as `parseListQuery` clamps
   * to [1, 500], so a direct call with 0, a negative or NaN still reads.
   *
   * Every V4 list operation documents the same paging — "Supports pagination
   * via page parameter. 200 response items per page." and "Not providing page
   * will return items for page 1." (https://developer.eposnowhq.com/docs/v4/json)
   * — so the Refund, Tender and Discount lists, whose paths are not in that
   * spec, page through here too: correct if the path answers like the rest of
   * V4, and a dead path still throws.
   *
   * Every page reports `pagedLocally`: two caller pages inside one upstream
   * page send the same `page`, which is the window working, not `page` being
   * ignored. The claim that each row is served once is what the paging tests
   * of every method here pin. A limit above 200 (a direct call: the router
   * and the sync ask for at most `maxPageSize`) is served in pages of 200,
   * so that size is reported as `pageSize` and every judgement of the page
   * is made at it.
   */
  private async listV4<T>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
  ): Promise<T[]> {
    const asked = Number(params.limit ?? DEFAULT_PAGE_SIZE)
    const size = Number.isFinite(asked)
      ? Math.min(Math.max(Math.floor(asked), 1), MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE
    const { items, hasMore } = await this.client(credentials).listWindow<T>(path, {
      offset: pageOffset(params, size),
      size,
    })
    reportUpstreamPage(params, {
      pagedLocally: true,
      ...(hasMore !== undefined ? { hasMore } : {}),
      ...(typeof params.limit === 'number' && size < params.limit ? { pageSize: size } : {}),
    })
    return items
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const items = await this.listV4<RawEposNowProduct>(credentials, 'Product', params)
    return items.map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const client = this.client(credentials)
    const raw = await client.get<RawEposNowProduct>(`Product/${id}`)
    return transformProduct(raw)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const client = this.client(credentials)
    const body = untransformProduct(data)
    const raw = await client.post<RawEposNowProduct>('Product', body)
    return transformProduct(raw)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const client = this.client(credentials)
    const body = untransformProduct(data)
    body['Id'] = Number(id)
    const raw = await client.put<RawEposNowProduct>(`Product/${id}`, body)
    return transformProduct(raw)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`Product/${id}`)
  }

  // ── Variants -- omitted (501) ─────────────────────────────────────────────
  // Epos Now has a flat product model with no parent-child variant structure.

  // ── Collections ───────────────────────────────────────────────────────────

  async listCollections(credentials: Credentials, params: QueryParams): Promise<Collection[]> {
    const items = await this.listV4<RawEposNowCategory>(credentials, 'Category', params)
    return items.map(transformCollection)
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const client = this.client(credentials)
    const raw = await client.get<RawEposNowCategory>(`Category/${id}`)
    return transformCollection(raw)
  }

  async createCollection(credentials: Credentials, data: Partial<Collection>): Promise<Collection> {
    const client = this.client(credentials)
    const body = untransformCollection(data)
    const raw = await client.post<RawEposNowCategory>('Category', body)
    return transformCollection(raw)
  }

  async updateCollection(
    credentials: Credentials,
    id: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const client = this.client(credentials)
    const body = untransformCollection(data)
    body['Id'] = Number(id)
    const raw = await client.put<RawEposNowCategory>(`Category/${id}`, body)
    return transformCollection(raw)
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`Category/${id}`)
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const items = await this.listV4<RawEposNowLocation>(credentials, 'Location', params)
    return items.map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const client = this.client(credentials)
    const raw = await client.get<RawEposNowLocation>(`Location/${id}`)
    return transformLocation(raw)
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const items = await this.listV4<RawEposNowProductStock>(credentials, 'ProductStock', params)
    return items.map(transformProductStock)
  }

  /**
   * A listed level's id is `<ProductId>:<LocationId>`, read back through the
   * documented GET /api/v4/ProductStock/Product/{productId}/Location/{locationId}
   * ("Get Stocks for a Product in a Location"). Any other id takes the older
   * `Stock/{id}`, which V4 does not document.
   */
  async getInventoryLevel(credentials: Credentials, id: string): Promise<InventoryLevel> {
    const client = this.client(credentials)
    const byProductAt = /^(\d+):(\d+)$/.exec(id)
    if (byProductAt) {
      const raw = await client.get<RawEposNowProductStock>(
        `ProductStock/Product/${byProductAt[1]}/Location/${byProductAt[2]}`,
      )
      return transformProductStock(raw)
    }
    const raw = await client.get<RawEposNowStock>(`Stock/${id}`)
    return transformInventoryLevel(raw)
  }

  async adjustInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; delta: number },
  ): Promise<InventoryLevel> {
    const client = this.client(credentials)
    // Read current stock, compute new value, then set
    const stocks = await client.get<RawEposNowStock[]>('Stock', {
      ProductId: Number(data.variantId),
      LocationId: Number(data.locationId),
    })
    const current = Array.isArray(stocks) ? stocks[0] : undefined
    const currentQty = current?.CurrentStock ?? 0
    const newQty = Math.max(0, currentQty + data.delta)
    const body = {
      ProductId: Number(data.variantId),
      LocationId: Number(data.locationId),
      CurrentStock: newQty,
    }
    const updated = await client.put<RawEposNowStock>('Stock', body)
    return transformInventoryLevel(updated)
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const client = this.client(credentials)
    const body = {
      ProductId: Number(data.variantId),
      LocationId: Number(data.locationId),
      CurrentStock: data.available,
    }
    const updated = await client.put<RawEposNowStock>('Stock', body)
    return transformInventoryLevel(updated)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const items = await this.listV4<RawEposNowCustomer>(credentials, 'Customer', params)
    return items.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const client = this.client(credentials)
    const raw = await client.get<RawEposNowCustomer>(`Customer/${id}`)
    return transformCustomer(raw)
  }

  async createCustomer(credentials: Credentials, data: Partial<Customer>): Promise<Customer> {
    const client = this.client(credentials)
    const body = untransformCustomer(data)
    const raw = await client.post<RawEposNowCustomer>('Customer', body)
    return transformCustomer(raw)
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const client = this.client(credentials)
    const body = untransformCustomer(data)
    body['Id'] = Number(id)
    const raw = await client.put<RawEposNowCustomer>(`Customer/${id}`, body)
    return transformCustomer(raw)
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`Customer/${id}`)
  }

  // ── Orders (Transactions in Epos Now) ────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const items = await this.listV4<RawEposNowTransaction>(credentials, 'Transaction', params)
    return items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = this.client(credentials)
    const raw = await client.get<RawEposNowTransaction>(`Transaction/${id}`)
    return transformOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = this.client(credentials)
    const body = untransformOrder(data)
    const raw = await client.post<RawEposNowTransaction>('Transaction', body)
    return transformOrder(raw)
  }

  async updateOrder(
    credentials: Credentials,
    id: string,
    data: Partial<Order>,
  ): Promise<Order> {
    const client = this.client(credentials)
    const body: Record<string, unknown> = { Id: Number(id) }
    if (data.note != null) body['Note'] = data.note
    const raw = await client.put<RawEposNowTransaction>(`Transaction/${id}`, body)
    return transformOrder(raw)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Order> {
    const client = this.client(credentials)
    const raw = await client.put<RawEposNowTransaction>(`Transaction/${id}`, {
      Id: Number(id),
      Voided: true,
    })
    return transformOrder(raw)
  }

  // ── Fulfillments -- omitted (501) ─────────────────────────────────────────
  // Epos Now is POS -- no shipping/fulfillment concept.

  // ── Refunds ───────────────────────────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const items = await this.listV4<RawEposNowRefund>(credentials, 'Refund', params)
    return items.map(transformRefund)
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const client = this.client(credentials)
    const raw = await client.get<RawEposNowRefund>(`Refund/${id}`)
    return transformRefund(raw)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.orderId) throw new Error('createRefund requires orderId')
    const client = this.client(credentials)
    const body = untransformRefund(data)
    const raw = await client.post<RawEposNowRefund>('Refund', body)
    return transformRefund(raw)
  }

  // ── Transactions (Tenders in Epos Now) ────────────────────────────────────

  async listTransactions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Transaction[]> {
    const items = await this.listV4<RawEposNowTender>(credentials, 'Tender', params)
    return items.map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = this.client(credentials)
    const raw = await client.get<RawEposNowTender>(`Tender/${id}`)
    return transformTransaction(raw)
  }

  // createTransaction omitted -- Epos Now POS handles payment at the till (501)

  // ── Discounts ─────────────────────────────────────────────────────────────

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const items = await this.listV4<RawEposNowDiscount>(credentials, 'Discount', params)
    return items.map(transformDiscount)
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const client = this.client(credentials)
    const raw = await client.get<RawEposNowDiscount>(`Discount/${id}`)
    return transformDiscount(raw)
  }

  async createDiscount(credentials: Credentials, data: Partial<Discount>): Promise<Discount> {
    const client = this.client(credentials)
    const body = untransformDiscount(data)
    const raw = await client.post<RawEposNowDiscount>('Discount', body)
    return transformDiscount(raw)
  }

  async updateDiscount(
    credentials: Credentials,
    id: string,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const client = this.client(credentials)
    const body = untransformDiscount(data)
    body['Id'] = Number(id)
    const raw = await client.put<RawEposNowDiscount>(`Discount/${id}`, body)
    return transformDiscount(raw)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`Discount/${id}`)
  }
}
