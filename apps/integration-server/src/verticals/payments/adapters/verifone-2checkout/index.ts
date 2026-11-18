/**
 * 2Checkout (Verifone) adapter — payments vertical.
 *
 * 2Checkout (formerly Avangate, now part of Verifone) is a global
 * monetisation / merchant-of-record platform strong in software & SaaS
 * billing. This adapter targets the REST 6.0 API.
 *
 * Auth: `api_key`-style. There is no OAuth — every request is signed with an
 * `X-Avangate-Authentication` header derived from the merchant code + secret
 * key (HMAC-SHA256). Customers submit both via the Connect Link form.
 *
 * Implemented resources (what REST 6.0 actually exposes for this vertical):
 *   - Charges         — backed by 2Checkout Orders (`/orders/`).
 *   - Customers       — `/customers/`.
 *   - Subscriptions   — `/subscriptions/`.
 *   - Refunds         — `/orders/{refNo}/refunds/`.
 *   - Invoices        — `/invoices/`.
 *   - Plans           — `/products/{code}/pricing-configurations/`.
 *   - PaymentMethods  — derived from customer object (`ExistingCards` array).
 *   - Payouts         — `/payouts/`.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: balance-transaction — 2Checkout REST 6.0 has no pageable ledger endpoint; /payouts/pending/ is a balance snapshot only, not a transaction log.
 * Unavailable: dispute — 2Checkout has no REST endpoint for chargebacks/disputes; they are surfaced only via IPN webhooks and as aggregate amounts within payout summaries.
 *
 * Docs: https://docs.2checkout.com/get-started-with-the-2checkout-api
 */

import { customForm } from '@opensteward/shared'
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
import type { Invoice } from '../../schema/invoice'
import type { Plan } from '../../schema/plan'
import type { PaymentMethod } from '../../schema/payment-method'
import type { Payout } from '../../schema/payout'
import type { WebhookEvent } from '../../schema/webhook'

import { DEFAULT_PAGE_SIZE } from './constants'
import { buildCredentials } from './auth'
import { Verifone2checkoutClient } from './client'
import {
  parseVerifone2checkoutWebhookEvents,
  verifyVerifone2checkoutWebhook,
} from './webhook'

import { transformCharge, type RawVerifone2checkoutOrder } from './transform/charge'
import { transformCustomer, type RawVerifone2checkoutCustomer } from './transform/customer'
import {
  transformSubscription,
  type RawVerifone2checkoutSubscription,
} from './transform/subscription'
import { transformRefund, type RawVerifone2checkoutRefund } from './transform/refund'
import { transformInvoice, type RawVerifone2checkoutInvoice } from './transform/invoice'
import { transformPlan, type RawVerifone2checkoutPricingConfig } from './transform/plan'
import {
  transformPaymentMethod,
  type RawVerifone2checkoutExistingCard,
} from './transform/payment-method'
import { transformPayout, type RawVerifone2checkoutPayout } from './transform/payout'

/** Connect Link form — merchant code + secret key, both stored on credentials. */
const CREDENTIAL_FORM = customForm({
  fields: [
    {
      name: 'merchantCode',
      label: 'Merchant code',
      type: 'text',
      required: true,
      helpText: 'Your 2Checkout account number, from Integrations → Webhooks & API.',
    },
    {
      name: 'secretKey',
      label: 'Secret key',
      type: 'password',
      required: true,
      helpText: 'The Secret Key from Integrations → Webhooks & API. Never shared on the wire.',
    },
  ],
  exchange: async (fields) => buildCredentials(fields),
})

export class Verifone2checkoutAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'verifone-2checkout'
  readonly version = '0.1.0'

  // ── Auth ────────────────────────────────────────────────────────────────

  getAuthUrl(): string {
    throw new Error('2Checkout uses an API key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('2Checkout uses an API key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return CREDENTIAL_FORM.credentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return CREDENTIAL_FORM.exchangeCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // API-key auth — nothing to refresh; the per-request header is recomputed
    // on every call by the client.
    return credentials
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyVerifone2checkoutWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseVerifone2checkoutWebhookEvents(payload)
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private client(credentials: Credentials): Verifone2checkoutClient {
    return new Verifone2checkoutClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      Limit: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    if (typeof params.page === 'number') out.Page = params.page
    return out
  }

  // ── Charges (2Checkout Orders) ─────────────────────────────────────────────

  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const items = await this.client(credentials).list<RawVerifone2checkoutOrder>(
      '/orders/',
      this.listParams(params),
    )
    return items.map(transformCharge)
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const raw = await this.client(credentials).get<RawVerifone2checkoutOrder>(`/orders/${id}/`)
    return transformCharge(raw ?? {})
  }

  // ── Customers ───────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const items = await this.client(credentials).list<RawVerifone2checkoutCustomer>(
      '/customers/',
      this.listParams(params),
    )
    return items.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const raw = await this.client(credentials).get<RawVerifone2checkoutCustomer>(
      `/customers/${id}/`,
    )
    return transformCustomer(raw ?? {})
  }

  // ── Refunds ────────────────────────────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    // 2Checkout refunds are scoped to an order; without a chargeId filter we
    // page through orders and collect their refund lists.
    const orders = await this.client(credentials).list<RawVerifone2checkoutOrder>(
      '/orders/',
      this.listParams(params),
    )
    const nested = await Promise.all(
      orders.map((order) => {
        const refNo = String(order.RefNo ?? order.OrderNo ?? '')
        if (!refNo) return Promise.resolve([])
        return this.client(credentials)
          .list<RawVerifone2checkoutRefund>(`/orders/${refNo}/refunds/`, {})
          .catch(() => [] as RawVerifone2checkoutRefund[])
      }),
    )
    return nested.flat().map(transformRefund)
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    // id is expected as "<orderRefNo>/<refundId>" — a composite key that lets
    // the client reconstruct the scoped endpoint.
    const [orderRefNo, refundId] = id.includes('/') ? id.split('/') : ['', id]
    if (orderRefNo && refundId) {
      const raw = await this.client(credentials).get<RawVerifone2checkoutRefund>(
        `/orders/${orderRefNo}/refunds/${refundId}/`,
      )
      return transformRefund(raw ?? {})
    }
    // Fallback: the id is a bare RefundId; we cannot resolve without the order
    // reference, so return a minimal skeleton with the id set.
    return transformRefund({ RefundId: id })
  }

  // ── Subscriptions ─────────────────────────────────────────────────────────

  async listSubscriptions(credentials: Credentials, params: QueryParams): Promise<Subscription[]> {
    const items = await this.client(credentials).list<RawVerifone2checkoutSubscription>(
      '/subscriptions/',
      this.listParams(params),
    )
    return items.map(transformSubscription)
  }

  async getSubscription(credentials: Credentials, id: string): Promise<Subscription> {
    const raw = await this.client(credentials).get<RawVerifone2checkoutSubscription>(
      `/subscriptions/${id}/`,
    )
    return transformSubscription(raw ?? {})
  }

  // ── Invoices ───────────────────────────────────────────────────────────────

  /**
   * List invoices. 2Checkout invoices are available at `/invoices/` and
   * represent individual billing cycle charges for subscriptions and one-off
   * orders.
   */
  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const items = await this.client(credentials).list<RawVerifone2checkoutInvoice>(
      '/invoices/',
      this.listParams(params),
    )
    return items.map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const raw = await this.client(credentials).get<RawVerifone2checkoutInvoice>(`/invoices/${id}/`)
    return transformInvoice(raw ?? {})
  }

  // ── Plans (Pricing Configurations) ────────────────────────────────────────

  /**
   * List pricing plans across all products. Since 2Checkout scopes pricing
   * configurations per product, this method paginates through products and
   * fetches their pricing configurations, returning a flat list of Plans.
   * For a product-scoped query, pass `params.productCode` (or `params.productId`).
   */
  async listPlans(credentials: Credentials, params: QueryParams): Promise<Plan[]> {
    const productCode =
      (params as Record<string, unknown>)['productCode'] ??
      (params as Record<string, unknown>)['productId']

    if (productCode) {
      const items = await this.client(credentials).list<RawVerifone2checkoutPricingConfig>(
        `/products/${String(productCode)}/pricing-configurations/`,
        {},
      )
      return items.map((cfg) =>
        transformPlan({ ...cfg, ProductCode: String(productCode) }),
      )
    }

    // No product filter — page through products and flatten their configs.
    const products = await this.client(credentials).list<{ ProductCode?: string }>(
      '/products/',
      this.listParams(params),
    )
    const nestedConfigs = await Promise.all(
      products.map(async (p) => {
        const code = p.ProductCode
        if (!code) return []
        const cfgs = await this.client(credentials)
          .list<RawVerifone2checkoutPricingConfig>(
            `/products/${code}/pricing-configurations/`,
            {},
          )
          .catch(() => [] as RawVerifone2checkoutPricingConfig[])
        return cfgs.map((cfg) => transformPlan({ ...cfg, ProductCode: code }))
      }),
    )
    return nestedConfigs.flat()
  }

  async getPlan(credentials: Credentials, id: string): Promise<Plan> {
    // id is expected as `<productCode>:<pricingConfigCode>`.
    const sep = id.indexOf(':')
    if (sep <= 0) {
      throw new Error('2Checkout getPlan expects id in the form "<productCode>:<pricingConfigCode>"')
    }
    const productCode = id.slice(0, sep)
    const configCode = id.slice(sep + 1)
    const raw = await this.client(credentials).get<RawVerifone2checkoutPricingConfig>(
      `/products/${productCode}/pricing-configurations/${configCode}/`,
    )
    return transformPlan({ ...(raw ?? {}), ProductCode: productCode })
  }

  // ── Payment Methods (derived from customer ExistingCards) ───────────────────

  /**
   * List saved payment methods across all customers. 2Checkout does not expose
   * a dedicated payment-methods endpoint; stored cards are returned inside each
   * customer object when fetched with `IncludePaymentData=true`. This method
   * pages through customers and flattens their `ExistingCards` arrays.
   */
  async listPaymentMethods(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PaymentMethod[]> {
    interface RawCustomerWithCards {
      AvangateCustomerReference?: string | number
      ExistingCards?: RawVerifone2checkoutExistingCard[] | null
      [k: string]: unknown
    }
    const customers = await this.client(credentials).list<RawCustomerWithCards>(
      '/customers/',
      { ...this.listParams(params), IncludePaymentData: true },
    )
    return customers.flatMap((c) => {
      const customerId = String(c.AvangateCustomerReference ?? '')
      return (c.ExistingCards ?? []).map((card) => transformPaymentMethod(card, customerId))
    })
  }

  async getPaymentMethod(credentials: Credentials, id: string): Promise<PaymentMethod> {
    // id is expected as `<customerId>/<token>` — a composite key so we can
    // resolve the scoped customer endpoint.
    const sep = id.indexOf('/')
    const customerId = sep > 0 ? id.slice(0, sep) : id
    interface RawCustomerWithCards {
      AvangateCustomerReference?: string | number
      ExistingCards?: RawVerifone2checkoutExistingCard[] | null
      [k: string]: unknown
    }
    const raw = await this.client(credentials).get<RawCustomerWithCards>(
      `/customers/${customerId}/`,
      { IncludePaymentData: true },
    )
    const cards = raw?.ExistingCards ?? []
    const token = sep > 0 ? id.slice(sep + 1) : ''
    const card = token ? cards.find((c) => c.Token === token) ?? cards[0] : cards[0]
    return transformPaymentMethod(card ?? {}, customerId)
  }

  // ── Payouts ─────────────────────────────────────────────────────────────────

  /**
   * List merchant payouts. Backed by `GET /payouts/` in the REST 6.0 API.
   */
  async listPayouts(credentials: Credentials, params: QueryParams): Promise<Payout[]> {
    const items = await this.client(credentials).list<RawVerifone2checkoutPayout>(
      '/payouts/',
      this.listParams(params),
    )
    return items.map(transformPayout)
  }

  async getPayout(credentials: Credentials, id: string): Promise<Payout> {
    // 2Checkout does not expose a single-payout GET endpoint; fetch the list
    // and find the record matching `Reference`.
    const items = await this.client(credentials).list<RawVerifone2checkoutPayout>(
      '/payouts/',
      { Limit: DEFAULT_PAGE_SIZE },
    )
    const match = items.find((p) => String(p.Reference ?? '') === id)
    return transformPayout(match ?? { Reference: id })
  }
}
