/**
 * NMI (Network Merchants Inc.) adapter — payments vertical (US gateway).
 *
 * NMI is a white-label US payment gateway. It exposes two form-encoded
 * endpoints under the same host:
 *  - Payment API (/api/transact.php) for processing — sale, auth, capture,
 *    void, refund. Responses are URL-encoded key/value strings.
 *  - Query API   (/api/query.php)   for reporting — transaction lookups and
 *    Customer Vault reports. Responses are XML.
 *
 * Auth: a single API `security_key` (api_key) generated in the merchant
 * control panel and submitted via the Connect Link form. No OAuth.
 *
 * Resources NMI supports here: Charges (create/get/list/capture/cancel),
 * Refunds (create/get/list), Customers (get/list, via Customer Vault),
 * Subscriptions (list/get, report_type=recurring), Plans (list/get,
 * report_type=recurring_plans), Invoices (list/get, report_type=invoicing),
 * PaymentMethods (list/get, derived from report_type=customer_vault).
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: balance-transaction — NMI has no balance/ledger query endpoint; settlement is batch-level via webhooks only
 * Unavailable: payout — NMI settlement is batch-level events (settlement-events webhook); no queryable payout listing endpoint
 * Unavailable: dispute — NMI chargebacks are webhook-only notifications (chargeback-events); no queryable dispute endpoint
 */

import type { BaseAdapter, CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import { pageOffset, reportUpstreamPage } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Customer } from '../../schema/customer'
import type { Invoice } from '../../schema/invoice'
import type { PaymentMethod } from '../../schema/payment-method'
import type { Plan } from '../../schema/plan'
import type { Refund } from '../../schema/refund'
import type { Subscription } from '../../schema/subscription'
import type { WebhookEvent } from '../../schema/webhook'

import { DEFAULT_ENVIRONMENT, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { buildCredentials } from './auth'
import { NmiClient } from './client'
import { parseNmiWebhookEvents, verifyNmiWebhook } from './webhook'

import {
  transformCharge,
  chargeFromTransactResponse,
  chargeFromTransactionXml,
} from './transform/charge'
import { transformRefund, refundFromTransactResponse } from './transform/refund'
import { transformCustomer, customerFromVaultXml } from './transform/customer'
import { transformSubscription, subscriptionFromXml } from './transform/subscription'
import { transformPlan, planFromXml } from './transform/plan'
import { transformInvoice, invoiceFromXml } from './transform/invoice'
import { transformPaymentMethod, paymentMethodFromVaultXml } from './transform/payment-method'
import { xmlBlocks } from './transform/shared'

/**
 * One caller page of a Query API report, as its XML row blocks.
 *
 * "Determines which "page" of results are returned. For example,
 * `result_limit=100&page_number=0` will return the first 100 results. Using
 * `page_number=1` will return the next 100 results. Default - `0`."
 * (https://docs.nmi.com/reference/query, page_number)
 *
 * page_number is 0-based and strides by result_limit, so caller page `p` of
 * `limit` rows is `page_number = p - 1` at `result_limit = limit`. No maximum
 * is documented for result_limit, so the caller's limit is sent as is.
 *
 * The XML carries no total and no has-more field. A short page is the end; a
 * full page is followed by a one-row probe at the next row's index
 * (`result_limit=1`, `page_number = p * limit`), so `hasMore` is exact even
 * when the collection is an exact multiple of `limit`.
 */
async function queryPage(
  client: NmiClient,
  params: QueryParams,
  fields: Record<string, string>,
  tag: string,
): Promise<string[]> {
  // A zero, negative or fractional limit is not a page size NMI can stride by.
  const limit = Math.max(1, Math.floor(params.limit ?? DEFAULT_PAGE_SIZE))
  // pageOffset treats a missing, 0, negative or non-finite page as page 1 and
  // floors a fractional one, so page_number is never negative or fractional.
  const offset = pageOffset(params, limit)
  const xml = await client.query({ ...fields, result_limit: limit, page_number: offset / limit })
  const blocks = xmlBlocks(xml, tag)
  let hasMore = false
  if (blocks.length >= limit) {
    // result_limit=1 strides by one row, so page_number is the next row's index.
    const next = await client.query({ ...fields, result_limit: 1, page_number: offset + limit })
    hasMore = xmlBlocks(next, tag).length > 0
  }
  reportUpstreamPage(params, { hasMore })
  return blocks
}

/** transact.php approves with response=1; anything else is a decline/error. */
function assertApproved(res: Record<string, string>, op: string): void {
  if (res.response !== '1') {
    throw new Error(
      `NMI ${op} failed (response=${res.response ?? '?'} code=${res.response_code ?? '?'}): ${res.responsetext ?? 'unknown error'}`,
    )
  }
}

export class NmiAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'nmi'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error('NMI uses an API security key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('NMI uses an API security key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'environment',
        label: 'Environment',
        type: 'select',
        required: true,
        options: [
          { value: 'sandbox', label: 'Sandbox' },
          { value: 'live', label: 'Production' },
        ],
      },
      {
        name: 'securityKey',
        label: 'API security key',
        type: 'password',
        required: true,
        helpText:
          'Generate an "API"-type key in the merchant control panel under Settings → Security Keys.',
      },
    ]
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return buildCredentials({ environment: DEFAULT_ENVIRONMENT, ...fields })
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyNmiWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseNmiWebhookEvents(payload)
  }

  private client(credentials: Credentials): NmiClient {
    return new NmiClient(credentials)
  }

  // ── Charges ───────────────────────────────────────────────────────────────

  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const blocks = await queryPage(
      this.client(credentials),
      params,
      { report_type: 'transaction' },
      'transaction',
    )
    return blocks.map((b) => transformCharge(chargeFromTransactionXml(b)))
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const xml = await this.client(credentials).query({ transaction_id: id })
    const [block] = xmlBlocks(xml, 'transaction')
    return transformCharge(chargeFromTransactionXml(block ?? xml))
  }

  async createCharge(credentials: Credentials, data: Partial<Charge>): Promise<Charge> {
    const amountMajor = ((data.amount ?? 0) / 100).toFixed(2)
    // Uncaptured authorisations use type=auth; otherwise charge immediately.
    const type = data.captured === false ? 'auth' : 'sale'
    const res = await this.client(credentials).transact({
      type,
      amount: amountMajor,
      currency: data.currency,
      customer_vault_id: data.customerId ?? undefined,
      orderid: data.description ?? undefined,
      email: data.receiptEmail ?? undefined,
    })
    assertApproved(res, type)
    return transformCharge(
      chargeFromTransactResponse(res, {
        amount: data.amount,
        currency: data.currency,
        orderId: data.description ?? undefined,
      }),
    )
  }

  async captureCharge(
    credentials: Credentials,
    id: string,
    data?: { amount?: number },
  ): Promise<Charge> {
    const res = await this.client(credentials).transact({
      type: 'capture',
      transactionid: id,
      amount: data?.amount !== undefined ? (data.amount / 100).toFixed(2) : undefined,
    })
    assertApproved(res, 'capture')
    return transformCharge(chargeFromTransactResponse(res, { amount: data?.amount }))
  }

  async cancelCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).transact({ type: 'void', transactionid: id })
    assertApproved(res, 'void')
    return transformCharge(chargeFromTransactResponse(res))
  }

  // ── Refunds ─────────────────────────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const xml = await this.client(credentials).query({
      report_type: 'transaction',
      transaction_type: 'refund',
      result_limit: limit,
      page_number: 1,
    })
    return xmlBlocks(xml, 'transaction').map((b) => {
      const c = chargeFromTransactionXml(b)
      return transformRefund({
        transactionId: c.transactionId,
        chargeId: c.transactionId ?? '',
        amount: c.amount,
        currency: c.currency,
        responseCode: c.responseCode,
        date: c.date,
        // A settled refund record in the Query API is a completed refund.
        response: (c.condition ?? '').toLowerCase() === 'complete' ? '1' : undefined,
        raw: b,
      })
    })
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const xml = await this.client(credentials).query({ transaction_id: id })
    const [block] = xmlBlocks(xml, 'transaction')
    const c = chargeFromTransactionXml(block ?? xml)
    return transformRefund({
      transactionId: c.transactionId,
      chargeId: c.transactionId ?? '',
      amount: c.amount,
      currency: c.currency,
      responseCode: c.responseCode,
      date: c.date,
      response: (c.condition ?? '').toLowerCase() === 'complete' ? '1' : undefined,
      raw: block ?? xml,
    })
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId)
      throw new Error('chargeId (originating transactionid) required for NMI refund')
    const res = await this.client(credentials).transact({
      type: 'refund',
      transactionid: data.chargeId,
      amount: data.amount !== undefined ? (data.amount / 100).toFixed(2) : undefined,
      currency: data.currency,
    })
    assertApproved(res, 'refund')
    return transformRefund(
      refundFromTransactResponse(res, {
        chargeId: data.chargeId,
        amount: data.amount,
        currency: data.currency,
      }),
    )
  }

  // ── Customers (Customer Vault) ──────────────────────────────────────────

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const xml = await this.client(credentials).query({
      report_type: 'customer_vault',
      customer_vault_id: id,
    })
    const [block] = xmlBlocks(xml, 'customer')
    return transformCustomer(customerFromVaultXml(block ?? xml))
  }

  async listCustomers(credentials: Credentials, _params: QueryParams): Promise<Customer[]> {
    const xml = await this.client(credentials).query({ report_type: 'customer_vault' })
    return xmlBlocks(xml, 'customer').map((b) => transformCustomer(customerFromVaultXml(b)))
  }

  // ── Payment Methods (derived from Customer Vault) ───────────────────────────

  async listPaymentMethods(
    credentials: Credentials,
    _params: QueryParams,
  ): Promise<PaymentMethod[]> {
    const xml = await this.client(credentials).query({ report_type: 'customer_vault' })
    return xmlBlocks(xml, 'customer').map((b) =>
      transformPaymentMethod(paymentMethodFromVaultXml(b)),
    )
  }

  async getPaymentMethod(credentials: Credentials, id: string): Promise<PaymentMethod> {
    // id is a customer_vault_id; query returns a single <customer> block.
    const xml = await this.client(credentials).query({
      report_type: 'customer_vault',
      customer_vault_id: id,
    })
    const [block] = xmlBlocks(xml, 'customer')
    return transformPaymentMethod(paymentMethodFromVaultXml(block ?? xml))
  }

  // ── Subscriptions (report_type=recurring) ──────────────────────────────────

  async listSubscriptions(credentials: Credentials, params: QueryParams): Promise<Subscription[]> {
    const blocks = await queryPage(
      this.client(credentials),
      params,
      { report_type: 'recurring' },
      'subscription',
    )
    return blocks.map((b) => transformSubscription(subscriptionFromXml(b)))
  }

  async getSubscription(credentials: Credentials, id: string): Promise<Subscription> {
    const xml = await this.client(credentials).query({
      report_type: 'recurring',
      subscription_id: id,
    })
    const [block] = xmlBlocks(xml, 'subscription')
    return transformSubscription(subscriptionFromXml(block ?? xml))
  }

  // ── Plans (report_type=recurring_plans) ────────────────────────────────────

  async listPlans(credentials: Credentials, _params: QueryParams): Promise<Plan[]> {
    const xml = await this.client(credentials).query({ report_type: 'recurring_plans' })
    return xmlBlocks(xml, 'plan').map((b) => transformPlan(planFromXml(b)))
  }

  async getPlan(credentials: Credentials, id: string): Promise<Plan> {
    const xml = await this.client(credentials).query({
      report_type: 'recurring_plans',
      plan_id: id,
    })
    const [block] = xmlBlocks(xml, 'plan')
    return transformPlan(planFromXml(block ?? xml))
  }

  // ── Invoices (report_type=invoicing) ───────────────────────────────────────

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const blocks = await queryPage(
      this.client(credentials),
      params,
      { report_type: 'invoicing' },
      'invoice',
    )
    return blocks.map((b) => transformInvoice(invoiceFromXml(b)))
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const xml = await this.client(credentials).query({
      report_type: 'invoicing',
      invoice_id: id,
    })
    const [block] = xmlBlocks(xml, 'invoice')
    return transformInvoice(invoiceFromXml(block ?? xml))
  }
}
