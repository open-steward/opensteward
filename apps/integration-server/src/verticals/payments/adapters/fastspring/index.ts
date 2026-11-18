/**
 * FastSpring adapter — payments vertical.
 *
 * FastSpring is a merchant-of-record commerce platform for selling software
 * and SaaS. Its REST API exposes Accounts (buyers), Orders (completed
 * transactions), Subscriptions, a Product catalog, and Returns (refunds).
 * This adapter maps:
 *   - Accounts      → canonical Customers
 *   - Orders        → canonical Charges
 *   - Subscriptions → canonical Subscriptions
 *   - Products      → canonical Products
 *   - Returns       → canonical Refunds  (GET /orders?returns=true)
 *
 * Auth: HTTP Basic with an API username + password (no OAuth, no refresh).
 *
 * Money: FastSpring quotes MAJOR units (e.g. `total: 60.0`); the canonical
 * schema is integer minor units, so transforms scale by 100.
 *
 * ── Resource coverage ──────────────────────────────────────────────────────
 * Unavailable: balance-transaction — FastSpring is a MoR, not a card gateway; no ledger/balance-transaction API exists.
 * Unavailable: dispute — Disputes are handled through the FastSpring dashboard; no REST API endpoint exposed.
 * Unavailable: payment-method — FastSpring stores no vaulted payment methods; payment method data is per-session only.
 * Unavailable: payout — Payouts are managed via the Payout Portal UI; no REST API endpoint exposed.
 * Unavailable: plan — FastSpring has no dedicated plan/price object; billing config lives on Products and Subscriptions.
 * Unverified:  invoice — GET /invoices/{id} exists but no list endpoint is documented; cannot implement listInvoices.
 */

import type {
  BaseAdapter,
  CredentialField,
  Credentials,
  QueryParams,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Customer } from '../../schema/customer'
import type { Refund } from '../../schema/refund'
import type { Subscription } from '../../schema/subscription'
import type { Product } from '../../schema/plan'
import type { WebhookEvent } from '../../schema/webhook'

import {
  DEFAULT_PAGE_SIZE,
  ACCOUNTS_PATH,
  ORDERS_PATH,
  SUBSCRIPTIONS_PATH,
  PRODUCTS_PATH,
} from './constants'
import { credentialForm } from './auth'
import { FastspringClient } from './client'
import { parseFastspringWebhookEvents, verifyFastspringWebhook } from './webhook'

import { transformCustomer, type RawFastspringAccount } from './transform/customer'
import { transformCharge, type RawFastspringOrder } from './transform/charge'
import { transformRefund, type RawFastspringReturn } from './transform/refund'
import {
  transformSubscription,
  type RawFastspringSubscription,
} from './transform/subscription'
import { transformProduct, type RawFastspringProduct } from './transform/product'

export class FastspringAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'fastspring'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error(
      'FastSpring uses an API username + password; submit them via the Connect Link form.',
    )
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('FastSpring uses an API key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return credentialForm.credentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return credentialForm.exchangeCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyFastspringWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseFastspringWebhookEvents(payload)
  }

  private client(credentials: Credentials): FastspringClient {
    return new FastspringClient(credentials)
  }

  private pageParams(params: QueryParams): Record<string, unknown> {
    return { page: params.page ?? 1, limit: params.limit ?? DEFAULT_PAGE_SIZE }
  }

  // ── Customers (FastSpring accounts) ─────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const rows = await this.client(credentials).list<RawFastspringAccount>(
      ACCOUNTS_PATH,
      'accounts',
      this.pageParams(params),
    )
    return rows.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const raw = await this.client(credentials).get<RawFastspringAccount>(
      `${ACCOUNTS_PATH}/${encodeURIComponent(id)}`,
    )
    return transformCustomer(raw ?? {})
  }

  // ── Charges (FastSpring orders) ─────────────────────────────────────────────

  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const rows = await this.client(credentials).list<RawFastspringOrder>(
      ORDERS_PATH,
      'orders',
      this.pageParams(params),
    )
    return rows.map(transformCharge)
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const raw = await this.client(credentials).get<RawFastspringOrder>(
      `${ORDERS_PATH}/${encodeURIComponent(id)}`,
    )
    return transformCharge(raw ?? {})
  }

  // ── Refunds (FastSpring returns) ────────────────────────────────────────────
  //
  // FastSpring exposes returns via GET /orders?returns=true (filter param on
  // the orders list endpoint) and GET /returns/{returnId} for individual
  // lookups. The return object shares the same financial shape as the
  // `return.created` webhook payload.

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const rows = await this.client(credentials).list<RawFastspringReturn>(
      ORDERS_PATH,
      'orders',
      { ...this.pageParams(params), returns: true },
    )
    return rows.map(transformRefund)
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const raw = await this.client(credentials).get<RawFastspringReturn>(
      `/returns/${encodeURIComponent(id)}`,
    )
    return transformRefund(raw ?? {})
  }

  // ── Subscriptions ───────────────────────────────────────────────────────────

  async listSubscriptions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Subscription[]> {
    const rows = await this.client(credentials).list<RawFastspringSubscription>(
      SUBSCRIPTIONS_PATH,
      'subscriptions',
      this.pageParams(params),
    )
    return rows.map(transformSubscription)
  }

  async getSubscription(credentials: Credentials, id: string): Promise<Subscription> {
    const raw = await this.client(credentials).get<RawFastspringSubscription>(
      `${SUBSCRIPTIONS_PATH}/${encodeURIComponent(id)}`,
    )
    return transformSubscription(raw ?? {})
  }

  /** FastSpring cancels at the end of the current billing period. */
  async cancelSubscription(credentials: Credentials, id: string): Promise<Subscription> {
    const raw = await this.client(credentials).post<RawFastspringSubscription>(
      `${SUBSCRIPTIONS_PATH}/${encodeURIComponent(id)}/cancel`,
    )
    return transformSubscription(raw ?? {})
  }

  // ── Products ─────────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const rows = await this.client(credentials).list<RawFastspringProduct>(
      PRODUCTS_PATH,
      'products',
      this.pageParams(params),
    )
    return rows.map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    // FastSpring returns single products wrapped in a `products` array.
    const rows = await this.client(credentials).list<RawFastspringProduct>(
      `${PRODUCTS_PATH}/${encodeURIComponent(id)}`,
      'products',
    )
    const raw = rows[0] ?? { product: id }
    return transformProduct(raw)
  }
}
