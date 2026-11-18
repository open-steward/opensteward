/**
 * Lemon Squeezy adapter for the ecommerce vertical.
 *
 * Maps the Lemon Squeezy REST API (https://api.lemonsqueezy.com/v1) to the
 * canonical ecommerce resources. Lemon Squeezy is a digital-goods / SaaS
 * merchant-of-record platform — it sells digital files and subscriptions only,
 * so collection groupings, fulfillment records, inventory levels, and physical
 * locations are absent from its API and intentionally omitted here (they
 * auto-501 via the registry).
 *
 * Auth: Bearer API key — no OAuth code-exchange flow. Credentials are supplied
 * directly via the Connect Link form (credentialFields / exchangeCredentials).
 *
 * Pagination: JSON:API page-based (`page[number]` / `page[size]`).
 *
 * Supported resources:
 *   - Products (list, get)
 *   - Variants (list, get)
 *   - Customers (list, get, create, update)
 *   - Orders (list, get)
 *   - Discounts (list, get, create, delete)
 *   - Refunds   (list, get — derived from orders with status=refunded)
 *   - Transactions (list, get — derived from orders)
 *   - Webhooks (verify + parse)
 *
 * ── Resource coverage ──────────────────────────────────────────────────────
 * Unavailable: collection   — Lemon Squeezy has no product-collection concept in its API.
 * Unavailable: fulfillment  — Digital-products platform only; no physical fulfillment or shipping.
 * Unavailable: inventory    — No stock-level tracking; digital files have unlimited supply.
 * Unavailable: location     — No physical warehouse or store-location concept in its API.
 */

import { simpleApiKey } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product, ProductVariant } from '../../schema/product'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { Discount } from '../../schema/discount'
import type { Refund } from '../../schema/refund'
import type { Transaction } from '../../schema/transaction'
import type { WebhookEvent } from '../../schema/webhook'

import { buildAuthUrl, exchangeCode as lsExchangeCode } from './auth'
import { LemonSqueezyClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import { verifyLemonSqueezyWebhook, parseLemonSqueezyWebhookEvents } from './webhook'

import {
  transformProduct,
  transformVariant,
  type RawLsProductAttributes,
  type RawLsVariantAttributes,
} from './transform/product'
import {
  transformCustomer,
  untransformCustomer,
  type RawLsCustomerAttributes,
} from './transform/customer'
import {
  transformOrder,
  type RawLsOrderAttributes,
} from './transform/order'
import {
  transformDiscount,
  untransformDiscount,
  type RawLsDiscountAttributes,
} from './transform/discount'
import {
  transformRefund,
  type RawLsRefundAttributes,
} from './transform/refund'
import {
  transformTransaction,
  type RawLsTransactionAttributes,
} from './transform/transaction'

// ── Config ────────────────────────────────────────────────────────────────────

export interface LemonSqueezyAdapterConfig {
  /**
   * Lemon Squeezy store ID to scope list requests. When provided, list queries
   * add `filter[store_id]` so results are limited to this store.
   */
  storeId?: string | number
}

// ── Credential form ───────────────────────────────────────────────────────────

const SIMPLE_API_KEY_FORM = simpleApiKey({
  label: 'API key',
  helpText:
    'Generate an API key at https://app.lemonsqueezy.com/settings/api. ' +
    'The key is only shown once — copy it immediately.',
})

// ── Adapter ───────────────────────────────────────────────────────────────────

export class LemonSqueezyAdapter implements EcommerceAdapter {
  readonly platform = 'lemon-squeezy'
  readonly version = '0.1.0'

  // Connect Link support — single API key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  private storeId: string | undefined

  constructor(config: LemonSqueezyAdapterConfig = {}) {
    this.storeId = config.storeId != null ? String(config.storeId) : undefined
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // No real OAuth flow — point the user at the API settings page.
    return buildAuthUrl()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    // Throws with instructions — Lemon Squeezy has no code exchange.
    return lsExchangeCode()
  }

  /**
   * Lemon Squeezy API keys are long-lived and do not expire.
   * `refreshCredentials` is a no-op.
   */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyLemonSqueezyWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    const eventName =
      (payload['__topic'] as string | undefined) ??
      ((payload['meta'] as Record<string, unknown> | undefined)?.['event_name'] as
        | string
        | undefined)
    return parseLemonSqueezyWebhookEvents(payload, eventName)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): LemonSqueezyClient {
    return new LemonSqueezyClient(credentials)
  }

  private pageParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      'page[size]': params.limit ?? DEFAULT_PAGE_SIZE,
    }
    const page = params['page'] ?? params['page[number]']
    if (page) out['page[number]'] = page
    if (this.storeId) out['filter[store_id]'] = this.storeId
    return out
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).listWithPage<RawLsProductAttributes>(
      '/products',
      this.pageParams(params),
    )
    return res.items.map((r) => transformProduct(r))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).getSingle<RawLsProductAttributes>(
      `/products/${id}`,
    )
    return transformProduct(res)
  }

  // ── Variants ──────────────────────────────────────────────────────────────

  async listVariants(credentials: Credentials, params: QueryParams): Promise<ProductVariant[]> {
    const extra = this.pageParams(params)
    const productId = params['productId'] ?? params['product_id']
    if (productId) extra['filter[product_id]'] = productId
    const res = await this.client(credentials).listWithPage<RawLsVariantAttributes>(
      '/variants',
      extra,
    )
    return res.items.map((r) => transformVariant(r))
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    const res = await this.client(credentials).getSingle<RawLsVariantAttributes>(
      `/variants/${id}`,
    )
    return transformVariant(res)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const extra = this.pageParams(params)
    const res = await this.client(credentials).listWithPage<RawLsCustomerAttributes>(
      '/customers',
      extra,
    )
    return res.items.map((r) => transformCustomer(r))
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.client(credentials).getSingle<RawLsCustomerAttributes>(
      `/customers/${id}`,
    )
    return transformCustomer(res)
  }

  async createCustomer(credentials: Credentials, data: Partial<Customer>): Promise<Customer> {
    if (!this.storeId) throw new Error('createCustomer requires storeId in adapter config')
    const body = {
      data: {
        type: 'customers',
        attributes: untransformCustomer(data),
        relationships: {
          store: { data: { type: 'stores', id: this.storeId } },
        },
      },
    }
    const res = await this.client(credentials).post<RawLsCustomerAttributes>('/customers', body)
    return transformCustomer(res)
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const body = {
      data: {
        type: 'customers',
        id,
        attributes: untransformCustomer(data),
      },
    }
    const res = await this.client(credentials).patch<RawLsCustomerAttributes>(
      `/customers/${id}`,
      body,
    )
    return transformCustomer(res)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const extra = this.pageParams(params)
    const res = await this.client(credentials).listWithPage<RawLsOrderAttributes>(
      '/orders',
      extra,
    )
    return res.items.map((r) => transformOrder(r))
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const res = await this.client(credentials).getSingle<RawLsOrderAttributes>(
      `/orders/${id}`,
    )
    return transformOrder(res)
  }

  // ── Discounts ─────────────────────────────────────────────────────────────

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const extra = this.pageParams(params)
    const res = await this.client(credentials).listWithPage<RawLsDiscountAttributes>(
      '/discounts',
      extra,
    )
    return res.items.map((r) => transformDiscount(r))
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const res = await this.client(credentials).getSingle<RawLsDiscountAttributes>(
      `/discounts/${id}`,
    )
    return transformDiscount(res)
  }

  async createDiscount(credentials: Credentials, data: Partial<Discount>): Promise<Discount> {
    if (!this.storeId) throw new Error('createDiscount requires storeId in adapter config')
    const body = {
      data: {
        type: 'discounts',
        attributes: untransformDiscount(data),
        relationships: {
          store: { data: { type: 'stores', id: this.storeId } },
        },
      },
    }
    const res = await this.client(credentials).post<RawLsDiscountAttributes>('/discounts', body)
    return transformDiscount(res)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/discounts/${id}`)
  }

  // ── Refunds ───────────────────────────────────────────────────────────────
  // Lemon Squeezy exposes refunded orders; we surface them via listRefunds /
  // getRefund by querying /orders and filtering on status === "refunded".

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const extra = { ...this.pageParams(params), 'filter[status]': 'refunded' }
    const res = await this.client(credentials).listWithPage<RawLsRefundAttributes>(
      '/orders',
      extra,
    )
    return res.items.map((r) => transformRefund(r))
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    // The refund id is the order id on Lemon Squeezy.
    const res = await this.client(credentials).getSingle<RawLsRefundAttributes>(
      `/orders/${id}`,
    )
    return transformRefund(res)
  }

  // ── Transactions ─────────────────────────────────────────────────────────
  // Transactions are derived from orders — each paid/refunded order is a
  // transaction record.

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const extra = this.pageParams(params)
    const res = await this.client(credentials).listWithPage<RawLsTransactionAttributes>(
      '/orders',
      extra,
    )
    return res.items.map((r) => transformTransaction(r))
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const res = await this.client(credentials).getSingle<RawLsTransactionAttributes>(
      `/orders/${id}`,
    )
    return transformTransaction(res)
  }
}
