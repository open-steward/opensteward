/**
 * Asaas adapter — payments vertical (Brazil anchor).
 *
 * Asaas is a Brazilian payment gateway. A **Payment** carries the amount,
 * customer and settlement status, so it maps onto the canonical **Charge**.
 * Customers and Subscriptions are first-class resources. Refunds are taken
 * against a payment (`POST /payments/{id}/refund`) and returned nested in the
 * payment's `refunds[]` array — there is no standalone refund list, so only
 * `createRefund` is implemented.
 *
 * Money note: Asaas denominates everything in **reais as a decimal** (e.g.
 * `129.9`); the transforms convert to/from integer centavos. Currency is
 * always BRL.
 *
 * Auth: a single API key sent in the `access_token` header (raw, no `Bearer`
 * prefix). The key selects sandbox vs production, so there is no host/mode
 * flag. No OAuth, no refresh.
 *
 * Webhooks: no cryptographic signature — Asaas echoes a configured static
 * token in the `asaas-access-token` header, verified by constant-time
 * equality (see webhook.ts).
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: payment-method — Asaas uses per-transaction card tokens (creditCardToken);
 *   there is no endpoint to list saved payment methods for a customer.
 * Unavailable: plan — Asaas subscriptions inline their amount+cycle directly;
 *   no /plans or /products endpoint exists.
 */

import { pageOffset, reportUpstreamPage } from '@opensteward/shared'
import type {
  BaseAdapter,
  CredentialField,
  Credentials,
  QueryParams,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { BalanceTransaction } from '../../schema/balance-transaction'
import type { Charge } from '../../schema/charge'
import type { Customer } from '../../schema/customer'
import type { Dispute } from '../../schema/dispute'
import type { Invoice } from '../../schema/invoice'
import type { Payout } from '../../schema/payout'
import type { Refund } from '../../schema/refund'
import type { Subscription } from '../../schema/subscription'
import type { WebhookEvent } from '../../schema/webhook'

import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  CHARGEBACKS_PATH,
  CUSTOMERS_PATH,
  FINANCIAL_TRANSACTIONS_PATH,
  INVOICES_PATH,
  PAYMENTS_PATH,
  SUBSCRIPTIONS_PATH,
  TRANSFERS_PATH,
  chargebackDisputePath,
  paymentRefundPath,
} from './constants'
import { buildCredentials } from './auth'
import { AsaasClient, type AsaasListResponse } from './client'
import { parseAsaasWebhookEvents, verifyAsaasWebhook } from './webhook'

import {
  transformCustomer,
  untransformCustomer,
  type RawAsaasCustomer,
} from './transform/customer'
import {
  transformCharge,
  untransformCharge,
  type RawAsaasPayment,
} from './transform/charge'
import {
  transformRefund,
  extractLatestRefund,
  type RawAsaasRefund,
} from './transform/refund'
import {
  transformSubscription,
  type RawAsaasSubscription,
} from './transform/subscription'
import {
  transformBalanceTransaction,
  type RawAsaasFinancialTransaction,
} from './transform/balance-transaction'
import {
  transformDispute,
  type RawAsaasChargeback,
} from './transform/dispute'
import {
  transformInvoice,
  type RawAsaasInvoice,
} from './transform/invoice'
import {
  transformPayout,
  type RawAsaasTransfer,
} from './transform/payout'

export class AsaasAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'asaas'
  readonly version = '0.1.0'
  /** "The `limit` must be a numeric value between 1 and 100." Every list method pages at it. */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  getAuthUrl(): string {
    throw new Error('Asaas uses an API key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Asaas uses an API key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'apiKey',
        label: 'API key',
        type: 'password',
        required: true,
        placeholder: '$aact_prod_xxxxxxxxxxxxxxxx',
        helpText:
          'Your Asaas API key (Settings → Integrations → API Key). Production keys start $aact_prod_…, sandbox keys $aact_hmlg_…; the key itself selects the environment.',
      },
    ]
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return buildCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyAsaasWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseAsaasWebhookEvents(payload)
  }

  private client(credentials: Credentials): AsaasClient {
    return new AsaasClient(credentials)
  }

  /**
   * Asaas paginates offset-based: `offset` + `limit` (1–100), documented at
   * https://docs.asaas.com/reference/listing-and-pagination. The 1-based
   * `page` becomes an offset at the size actually sent, after the clamp.
   */
  private pageParams(params: QueryParams): Record<string, unknown> {
    const asked = params.limit ?? DEFAULT_PAGE_SIZE
    const size = Math.min(
      Math.max(Math.floor(Number.isFinite(asked) ? asked : 1), 1),
      MAX_PAGE_SIZE,
    )
    return { limit: size, offset: pageOffset(params, size) }
  }

  /** Get one offset page and report the envelope's end signal to the caller. */
  private async listRows<T>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
  ): Promise<T[]> {
    const query = this.pageParams(params)
    const res = await this.client(credentials).get<AsaasListResponse<T>>(path, query)
    reportUpstreamPage(params, {
      ...(typeof res.hasMore === 'boolean' ? { hasMore: res.hasMore } : {}),
      ...(typeof res.totalCount === 'number' ? { totalCount: res.totalCount } : {}),
      pageSize: query.limit as number,
    })
    return res.data ?? []
  }

  // ── Customers ───────────────────────────────────────────────────────────────
  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const rows = await this.listRows<RawAsaasCustomer>(credentials, CUSTOMERS_PATH, params)
    return rows.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.client(credentials).get<RawAsaasCustomer>(`${CUSTOMERS_PATH}/${id}`)
    return transformCustomer(res ?? {})
  }

  async createCustomer(credentials: Credentials, data: Partial<Customer>): Promise<Customer> {
    const res = await this.client(credentials).post<RawAsaasCustomer>(
      CUSTOMERS_PATH,
      untransformCustomer(data),
    )
    return transformCustomer(res ?? {})
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    // Asaas uses POST /customers/{id} for partial updates.
    const res = await this.client(credentials).post<RawAsaasCustomer>(
      `${CUSTOMERS_PATH}/${id}`,
      untransformCustomer(data),
    )
    return transformCustomer(res ?? {})
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    // DELETE /customers/{id} returns the removed customer; we discard it.
    await this.client(credentials).delete<RawAsaasCustomer>(`${CUSTOMERS_PATH}/${id}`)
  }

  // ── Charges (Asaas Payments) ──────────────────────────────────────────────────
  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const rows = await this.listRows<RawAsaasPayment>(credentials, PAYMENTS_PATH, params)
    return rows.map(transformCharge)
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).get<RawAsaasPayment>(`${PAYMENTS_PATH}/${id}`)
    return transformCharge(res ?? {})
  }

  async createCharge(credentials: Credentials, data: Partial<Charge>): Promise<Charge> {
    const res = await this.client(credentials).post<RawAsaasPayment>(
      PAYMENTS_PATH,
      untransformCharge(data),
    )
    return transformCharge(res ?? {})
  }

  // ── Refunds (POST /payments/{id}/refund) ─────────────────────────────────────
  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    const paymentId = data.chargeId
    if (!paymentId) throw new Error('chargeId (Asaas payment id) is required for a refund')
    // Asaas expects the refund value in reais; canonical amount is centavos.
    const body: Record<string, unknown> = {}
    if (typeof data.amount === 'number') body.value = data.amount / 100
    if (typeof data.reason === 'string') body.description = data.reason
    const res = await this.client(credentials).post<
      { id?: string; refunds?: RawAsaasRefund[] } & Record<string, unknown>
    >(paymentRefundPath(paymentId), body)

    const extracted = extractLatestRefund(res ?? {})
    if (extracted) {
      return transformRefund(extracted.refund, extracted.chargeId, extracted.index)
    }
    // Never throw out of the resource method — synthesise a pending refund
    // keyed on the payment when the response omits the refunds array.
    return transformRefund(
      { value: data.amount != null ? data.amount / 100 : undefined, status: 'PENDING' },
      paymentId,
      0,
    )
  }

  // ── Subscriptions ─────────────────────────────────────────────────────────────
  async listSubscriptions(credentials: Credentials, params: QueryParams): Promise<Subscription[]> {
    const rows = await this.listRows<RawAsaasSubscription>(credentials, SUBSCRIPTIONS_PATH, params)
    return rows.map(transformSubscription)
  }

  async getSubscription(credentials: Credentials, id: string): Promise<Subscription> {
    const res = await this.client(credentials).get<RawAsaasSubscription>(
      `${SUBSCRIPTIONS_PATH}/${id}`,
    )
    return transformSubscription(res ?? {})
  }

  async cancelSubscription(credentials: Credentials, id: string): Promise<Subscription> {
    // Asaas DELETE /subscriptions/{id} removes recurrence; re-fetch is not
    // possible afterwards, so we return a synthetic INACTIVE view keyed on id.
    await this.client(credentials).delete<{ deleted?: boolean; id?: string }>(
      `${SUBSCRIPTIONS_PATH}/${id}`,
    )
    return transformSubscription({ id, status: 'INACTIVE' })
  }

  // ── Balance Transactions (GET /financialTransactions) ────────────────────────
  async listBalanceTransactions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<BalanceTransaction[]> {
    const rows = await this.listRows<RawAsaasFinancialTransaction>(
      credentials,
      FINANCIAL_TRANSACTIONS_PATH,
      params,
    )
    return rows.map(transformBalanceTransaction)
  }

  // ── Disputes / Chargebacks (GET /chargebacks) ────────────────────────────────
  async listDisputes(credentials: Credentials, params: QueryParams): Promise<Dispute[]> {
    const rows = await this.listRows<RawAsaasChargeback>(credentials, CHARGEBACKS_PATH, params)
    return rows.map(transformDispute)
  }

  async getDispute(credentials: Credentials, id: string): Promise<Dispute> {
    const res = await this.client(credentials).get<RawAsaasChargeback>(
      `${CHARGEBACKS_PATH}/${id}`,
    )
    return transformDispute(res ?? {})
  }

  async submitDisputeEvidence(
    credentials: Credentials,
    id: string,
    data: Record<string, unknown>,
  ): Promise<Dispute> {
    const res = await this.client(credentials).post<RawAsaasChargeback>(
      chargebackDisputePath(id),
      data,
    )
    return transformDispute(res ?? {})
  }

  // ── Invoices / NFS-e (GET /invoices) ────────────────────────────────────────
  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const rows = await this.listRows<RawAsaasInvoice>(credentials, INVOICES_PATH, params)
    return rows.map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const res = await this.client(credentials).get<RawAsaasInvoice>(`${INVOICES_PATH}/${id}`)
    return transformInvoice(res ?? {})
  }

  // ── Payouts / Transfers (GET /transfers) ─────────────────────────────────────
  async listPayouts(credentials: Credentials, params: QueryParams): Promise<Payout[]> {
    const rows = await this.listRows<RawAsaasTransfer>(credentials, TRANSFERS_PATH, params)
    return rows.map(transformPayout)
  }

  async getPayout(credentials: Credentials, id: string): Promise<Payout> {
    const res = await this.client(credentials).get<RawAsaasTransfer>(`${TRANSFERS_PATH}/${id}`)
    return transformPayout(res ?? {})
  }
}
