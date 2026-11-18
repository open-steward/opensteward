/**
 * Belvo adapter — payments vertical (LatAm open-finance anchor).
 *
 * Belvo is a banking-data AGGREGATOR (Brazil, Mexico, Colombia), not a
 * charge/refund gateway. Each end-user connection is a "Link"; behind it
 * Belvo exposes read-only accounts, balances, transactions, owners and
 * institutions. This adapter surfaces that data through the closest
 * canonical payments resources, all READ-ONLY:
 *   - Customers   ← Owners       (the account holder behind a Link)
 *   - Charges     ← Transactions (bank-account movements, amount + currency)
 *   - BalanceTxns ← Transactions (the same movements as signed ledger entries)
 *   - Invoices    ← Invoices     (Mexican fiscal/CFDI tax documents from SAT)
 *
 * There is no create / capture / refund / payout / dispute concept on the
 * platform, so those interface methods are intentionally left unimplemented
 * and the router auto-returns 501 for them. Belvo lists are Link-scoped:
 * pass the Link id via `params.link` to filter to one connection.
 *
 * Auth: HTTP Basic (secretId : secretPassword); no OAuth / token refresh.
 * Pagination: DRF-style `page` / `page_size` with `count` / `next` /
 * `previous` / `results`.
 *
 * Money: Belvo quotes MAJOR units (decimals); the canonical schema is integer
 * MINOR units — transforms scale by 100.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: dispute        — Belvo is a read-only banking aggregator; no chargeback/dispute concept exists.
 * Unavailable: payment-method — Belvo does not vault cards or bank accounts in a retrievable payment-method store.
 * Unavailable: payout         — No payout/settlement disbursement concept; Belvo is not a payment processor.
 * Unavailable: plan           — No subscription billing plans; Belvo has no billing engine.
 * Unavailable: refund         — No refund concept; all data is read-only from bank statements.
 * Unavailable: subscription   — No subscription billing; Recurring Expenses are derived insights, not managed subscriptions.
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
import type { BalanceTransaction } from '../../schema/balance-transaction'
import type { Invoice } from '../../schema/invoice'
import type { WebhookEvent } from '../../schema/webhook'

import { DEFAULT_PAGE_SIZE } from './constants'
import { buildCredentials } from './auth'
import { BelvoClient } from './client'
import { parseBelvoWebhookEvents, verifyBelvoWebhook } from './webhook'

import { transformCustomer, type RawBelvoOwner } from './transform/customer'
import { transformCharge, type RawBelvoTransaction } from './transform/charge'
import { transformBalanceTransaction } from './transform/balance-transaction'
import { transformInvoice, type RawBelvoInvoiceDetail } from './transform/invoice'

export class BelvoAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'belvo'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error(
      'Belvo uses HTTP Basic API keys; submit the secret ID + secret password via the Connect Link form.',
    )
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Belvo uses HTTP Basic API keys; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'environment',
        label: 'Environment',
        type: 'select',
        required: true,
        options: [
          { value: 'sandbox', label: 'Sandbox (test)' },
          { value: 'production', label: 'Production (live)' },
        ],
      },
      {
        name: 'secretId',
        label: 'Secret ID',
        type: 'text',
        required: true,
        helpText:
          'The Basic-auth username. Generate a key pair under Settings → API keys in your Belvo dashboard.',
      },
      {
        name: 'secretPassword',
        label: 'Secret password',
        type: 'password',
        required: true,
        helpText: 'The Basic-auth password, shown once when the key pair is generated.',
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
    return verifyBelvoWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseBelvoWebhookEvents(payload)
  }

  private client(credentials: Credentials): BelvoClient {
    return new BelvoClient(credentials)
  }

  /** Build Belvo's DRF-style list params, threading the optional Link filter. */
  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      page_size: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    if (typeof params.page === 'number') out.page = params.page
    if (typeof params.link === 'string') out.link = params.link
    if (typeof params.account === 'string') out.account = params.account
    return out
  }

  // ── Customers (Belvo Owners) ──────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const res = await this.client(credentials).list<RawBelvoOwner>('/owners/', this.listParams(params))
    return res.results.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const raw = await this.client(credentials).get<RawBelvoOwner>(
      `/owners/${encodeURIComponent(id)}/`,
    )
    return transformCustomer(raw ?? {})
  }

  // ── Charges (Belvo Transactions) ──────────────────────────────────────────

  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const res = await this.client(credentials).list<RawBelvoTransaction>(
      '/transactions/',
      this.listParams(params),
    )
    return res.results.map(transformCharge)
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const raw = await this.client(credentials).get<RawBelvoTransaction>(
      `/transactions/${encodeURIComponent(id)}/`,
    )
    return transformCharge(raw ?? {})
  }

  // ── Balance transactions (Belvo Transactions, signed) ─────────────────────

  async listBalanceTransactions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<BalanceTransaction[]> {
    const res = await this.client(credentials).list<RawBelvoTransaction>(
      '/transactions/',
      this.listParams(params),
    )
    return res.results.map(transformBalanceTransaction)
  }

  async getBalanceTransaction(
    credentials: Credentials,
    id: string,
  ): Promise<BalanceTransaction> {
    const raw = await this.client(credentials).get<RawBelvoTransaction>(
      `/transactions/${encodeURIComponent(id)}/`,
    )
    return transformBalanceTransaction(raw ?? {})
  }

  // ── Invoices (Belvo SAT fiscal/CFDI invoices — Mexico only) ──────────────

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const res = await this.client(credentials).list<RawBelvoInvoiceDetail>(
      '/invoices/',
      this.listParams(params),
    )
    return res.results.map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const raw = await this.client(credentials).get<RawBelvoInvoiceDetail>(
      `/invoices/${encodeURIComponent(id)}/`,
    )
    return transformInvoice(raw ?? {})
  }
}
