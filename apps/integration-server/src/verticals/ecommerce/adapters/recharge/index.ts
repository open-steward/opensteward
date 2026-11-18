/**
 * Recharge adapter for the ecommerce vertical.
 *
 * Maps the Recharge Payments REST API (2021-11) to the canonical ecommerce
 * resources. Recharge uses a plain API token in the `X-Recharge-Access-Token`
 * header — there is no OAuth code-exchange flow.
 *
 * Supported canonical resources:
 *  - Products      (GET list/get, POST create, PUT update, DELETE)
 *  - Customers     (GET list/get, POST create, PUT update, DELETE)
 *  - Orders        (GET list/get; Recharge orders are read-mostly)
 *  - Discounts     (GET list/get, POST create, PUT update, DELETE)
 *  - Locations     (synthetic single "default" — Recharge has no locations API)
 *  - Transactions  (derived from /charges — billing events mapped to Transaction)
 *  - Webhooks      (verifyWebhook + parseWebhookEvents)
 *
 * Not supported (auto-501):
 *  - Variants           (Recharge variants are embedded in products, not separately listed)
 *  - Collections        (no Recharge-native collections CRUD beyond list)
 *  - Inventory          (managed by underlying ecommerce platform)
 *  - Refunds            (no standalone refund resource; refund state lives on charges)
 *
 * Docs: https://developer.rechargepayments.com/2021-11
 *
 * ── Resource coverage ──────────────────────────────────────────────────────
 * Unavailable: fulfillment — Recharge 2021-11 has no fulfillments endpoint; fulfillment is delegated to the underlying ecommerce platform (Shopify etc.)
 */

import { simpleApiKey } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { Location } from '../../schema/location'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { Discount } from '../../schema/discount'
import type { Transaction } from '../../schema/transaction'
import type { WebhookEvent } from '../../schema/webhook'

import { buildAuthUrl, exchangeCode as rechargeExchangeCode } from './auth'
import { RechargeClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import { verifyRechargeWebhook, parseRechargeWebhookEvents } from './webhook'

import {
  transformProduct,
  untransformProduct,
  type RawRechargeProduct,
} from './transform/product'
import {
  transformCustomer,
  untransformCustomer,
  type RawRechargeCustomer,
} from './transform/customer'
import {
  transformOrder,
  type RawRechargeOrder,
} from './transform/order'
import {
  transformDiscount,
  untransformDiscount,
  type RawRechargeDiscount,
} from './transform/discount'
import { syntheticDefaultLocation } from './transform/location'
import {
  transformTransaction,
  type RawRechargeCharge,
} from './transform/transaction'

const SIMPLE_API_KEY_FORM = simpleApiKey()

export class RechargeAdapter implements EcommerceAdapter {
  // Connect Link support — single API-key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'recharge'
  readonly version = '0.1.0'
  /** Honours `params.search`; see AdapterCapabilities. Declared so the
   *  router can refuse the parameter on adapters that would drop it. */
  readonly capabilities = { search: true }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // Recharge has no OAuth authorize URL — point the user at the API tokens page.
    return buildAuthUrl()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    // Throws a descriptive error — see ./auth.ts.
    return rechargeExchangeCode()
  }

  /**
   * Recharge API tokens do not expire, so `refreshCredentials` is a no-op.
   */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  verifyWebhook(
    payload: Buffer,
    headers: Record<string, string>,
    secret: string,
  ): boolean {
    return verifyRechargeWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    const topic = (payload['topic'] as string | undefined) ?? ''
    return parseRechargeWebhookEvents(payload, topic)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): RechargeClient {
    return new RechargeClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    if (params.page != null) out['page'] = params.page
    if (params.updatedAfter) out['updated_at_min'] = params.updatedAfter.toISOString()
    if (params.search) out['email'] = params.search
    // cursor-based continuation
    if (params['cursor']) out['cursor'] = params['cursor']
    return out
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.clientFor(credentials).listWithCursor<RawRechargeProduct>(
      'products',
      'products',
      this.listParams(params),
    )
    return res.items.map((p) => transformProduct(p))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const envelope = await this.clientFor(credentials).get<{ product: RawRechargeProduct }>(
      `products/${id}`,
    )
    return transformProduct(envelope.product)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const envelope = await this.clientFor(credentials).post<{ product: RawRechargeProduct }>(
      'products',
      untransformProduct(data),
    )
    return transformProduct(envelope.product)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const envelope = await this.clientFor(credentials).put<{ product: RawRechargeProduct }>(
      `products/${id}`,
      untransformProduct(data),
    )
    return transformProduct(envelope.product)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`products/${id}`)
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  async listLocations(
    _credentials: Credentials,
    _params: QueryParams,
  ): Promise<Location[]> {
    return [syntheticDefaultLocation()]
  }

  async getLocation(_credentials: Credentials, id: string): Promise<Location> {
    if (id !== 'default') {
      throw new Error(`Recharge has no native locations; unknown location id '${id}'`)
    }
    return syntheticDefaultLocation()
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Customer[]> {
    const res = await this.clientFor(credentials).listWithCursor<RawRechargeCustomer>(
      'customers',
      'customers',
      this.listParams(params),
    )
    return res.items.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const envelope = await this.clientFor(credentials).get<{ customer: RawRechargeCustomer }>(
      `customers/${id}`,
    )
    return transformCustomer(envelope.customer)
  }

  async createCustomer(
    credentials: Credentials,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const envelope = await this.clientFor(credentials).post<{ customer: RawRechargeCustomer }>(
      'customers',
      untransformCustomer(data),
    )
    return transformCustomer(envelope.customer)
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const envelope = await this.clientFor(credentials).put<{ customer: RawRechargeCustomer }>(
      `customers/${id}`,
      untransformCustomer(data),
    )
    return transformCustomer(envelope.customer)
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`customers/${id}`)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const res = await this.clientFor(credentials).listWithCursor<RawRechargeOrder>(
      'orders',
      'orders',
      this.listParams(params),
    )
    return res.items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const envelope = await this.clientFor(credentials).get<{ order: RawRechargeOrder }>(
      `orders/${id}`,
    )
    return transformOrder(envelope.order)
  }

  // ── Discounts ─────────────────────────────────────────────────────────────

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const res = await this.clientFor(credentials).listWithCursor<RawRechargeDiscount>(
      'discounts',
      'discounts',
      this.listParams(params),
    )
    return res.items.map(transformDiscount)
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const envelope = await this.clientFor(credentials).get<{ discount: RawRechargeDiscount }>(
      `discounts/${id}`,
    )
    return transformDiscount(envelope.discount)
  }

  async createDiscount(
    credentials: Credentials,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const envelope = await this.clientFor(credentials).post<{ discount: RawRechargeDiscount }>(
      'discounts',
      untransformDiscount(data),
    )
    return transformDiscount(envelope.discount)
  }

  async updateDiscount(
    credentials: Credentials,
    id: string,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const envelope = await this.clientFor(credentials).put<{ discount: RawRechargeDiscount }>(
      `discounts/${id}`,
      untransformDiscount(data),
    )
    return transformDiscount(envelope.discount)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`discounts/${id}`)
  }

  // ── Transactions (derived from /charges) ──────────────────────────────────

  async listTransactions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Transaction[]> {
    const res = await this.clientFor(credentials).listWithCursor<RawRechargeCharge>(
      'charges',
      'charges',
      this.listParams(params),
    )
    return res.items.map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const envelope = await this.clientFor(credentials).get<{ charge: RawRechargeCharge }>(
      `charges/${id}`,
    )
    return transformTransaction(envelope.charge)
  }
}
