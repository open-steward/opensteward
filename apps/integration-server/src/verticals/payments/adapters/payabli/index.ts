/**
 * Payabli adapter — payments vertical.
 *
 * Auth: API token in the `requestToken` header
 * (https://docs.payabli.com/developers/api-tokens.md).
 *
 * Lists are the Query endpoints, GET /Query/<resource>/{entry}, where `entry`
 * is "The entity's entrypoint identifier." They page by offset: `fromRecord`
 * ("The number of records to skip before starting to collect the result
 * set.") and `limitRecord` ("Max number of records to return for the query.
 * Use `0` or negative value to return all records.", default 20, no maximum
 * documented), and answer `{ Records, Summary }` where `Summary.totalRecords`
 * is the total across pages.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: plan — Payabli subscriptions embed amount/frequency directly; no Plan/Price/Product catalog entity
 * Unavailable: balance-transaction — no per-transaction balance record endpoint; settlement data is at batch level only (GET /api/Query/batches/org/{orgId})
 * Unverified:  payment-method — TokenStorage POST/PUT/DELETE confirmed; no GET list or GET-by-id endpoint with confirmed response fields found in public docs
 * Unverified:  payout — Payabli's payout concept is B2B money-out to vendors (PayoutSubscription/MoneyOut API), not merchant bank settlement; no endpoint cleanly maps to canonical Payout resource
 */

import { DEFAULT_PAGE_LIMIT, pageOffset, reportUpstreamPage } from '@opensteward/shared'
import type { BaseAdapter, CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Customer } from '../../schema/customer'
import type { Dispute } from '../../schema/dispute'
import type { Invoice } from '../../schema/invoice'
import type { Refund } from '../../schema/refund'
import type { Subscription } from '../../schema/subscription'

import { buildCredentials, connectionCurrency, connectionEntry } from './auth'
import { PayabliClient } from './client'

import { transformCustomer, type RawPayabliCustomer } from './transform/customer'
import { transformCharge, type RawPayabliTransaction } from './transform/charge'
import { transformRefund, type RawPayabliRefund } from './transform/refund'
import { transformDispute, type RawPayabliChargeback } from './transform/dispute'
import { transformInvoice, type RawPayabliInvoice } from './transform/invoice'
import { transformSubscription, type RawPayabliSubscription } from './transform/subscription'

/** The `{ Records, Summary }` body every Query list returns. */
interface QueryResponse<T> {
  Records?: T[] | null
  Summary?: { totalRecords?: number | null } | null
}

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

/** "2024-04-01T00:00:00", the form of the documented `transactionDate` filter example. */
function transactionDateFilter(d: Date): string {
  return d.toISOString().slice(0, 19)
}

export class PayabliAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'payabli'
  readonly version = '0.2.0'

  getAuthUrl(): string {
    throw new Error('Payabli uses an API key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Payabli uses an API key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'apiKey',
        label: 'API Key',
        type: 'password',
        required: true,
      },
    ]
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return buildCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): PayabliClient {
    return new PayabliClient(credentials)
  }

  private entry(credentials: Credentials, resource: string): string {
    const entry = connectionEntry(credentials)
    if (!entry) {
      throw notSupported(
        `Payabli cannot list ${resource} for this connection: GET /Query/${resource}/{entry} requires entry ("The entity's entrypoint identifier."), and the connection has no entry.`,
      )
    }
    return entry
  }

  /**
   * One caller page of a Query list: `fromRecord` from the caller's 1-based
   * page, `limitRecord` at the caller's limit (never 0, which returns every
   * record), and the end reported from `Summary.totalRecords` or a short page.
   */
  private async queryPage<T>(
    credentials: Credentials,
    resource: string,
    entry: string,
    params: QueryParams,
    filters: Record<string, string> = {},
  ): Promise<T[]> {
    const size =
      typeof params.limit === 'number' && Number.isFinite(params.limit) && params.limit >= 1
        ? Math.floor(params.limit)
        : DEFAULT_PAGE_LIMIT
    const res = await this.client(credentials).get<QueryResponse<T>>(
      `/Query/${resource}/${encodeURIComponent(entry)}`,
      { fromRecord: pageOffset(params, size), limitRecord: size, ...filters },
    )
    const rows = res.Records ?? []
    const total = res.Summary?.totalRecords
    if (typeof total === 'number') reportUpstreamPage(params, { totalCount: total })
    if (rows.length < size) reportUpstreamPage(params, { hasMore: false })
    return rows
  }

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const entry = this.entry(credentials, 'customers')
    const rows = await this.queryPage<RawPayabliCustomer>(credentials, 'customers', entry, params)
    return rows.map(transformCustomer)
  }

  /** GET /Customer/{customerId}: "Retrieves a customer's record and details." */
  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const raw = await this.client(credentials).get<RawPayabliCustomer>(
      `/Customer/${encodeURIComponent(id)}`,
    )
    return transformCustomer(raw)
  }

  /**
   * GET /Query/transactions/{entry} filtered to `operation(eq)=Sale`.
   *
   * "By default, this endpoint returns only transactions from the last 60
   * days. To query transactions outside of this period, include
   * `transactionDate` filters." An unfiltered call is therefore a 60-day
   * window, not the collection, and no retention limit is documented to
   * bound a full walk, so it is refused; a call with `updatedAfter` is served
   * with `transactionDate(ge)`.
   */
  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const entry = this.entry(credentials, 'transactions')
    const after = params.updatedAfter
    if (!(after instanceof Date) || Number.isNaN(after.getTime())) {
      throw notSupported(
        'Payabli cannot list charges without a lower date bound: GET /Query/transactions/{entry} "By default, this endpoint returns only transactions from the last 60 days. To query transactions outside of this period, include `transactionDate` filters." Pass updatedAfter.',
      )
    }
    const rows = await this.queryPage<RawPayabliTransaction>(
      credentials,
      'transactions',
      entry,
      params,
      {
        'transactionDate(ge)': transactionDateFilter(after),
        'operation(eq)': 'Sale',
      },
    )
    const currency = connectionCurrency(credentials)
    return rows.map((r) => transformCharge(r, currency))
  }

  /** GET /MoneyIn/details/{transId}: "Retrieve a processed transaction's details." */
  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const raw = await this.client(credentials).get<RawPayabliTransaction>(
      `/MoneyIn/details/${encodeURIComponent(id)}`,
    )
    return transformCharge(raw, connectionCurrency(credentials))
  }

  /**
   * Payabli documents no refund list. Its only refund paths are the writes
   * /MoneyIn/refund/{transId} and /MoneyIn/refund/{transId}/{amount}; refunds
   * are otherwise rows of GET /Query/transactions/{entry}, whose `Operation`
   * values are not enumerated ("The transaction's operation.").
   */
  async listRefunds(_credentials: Credentials, _params: QueryParams): Promise<Refund[]> {
    throw notSupported(
      'Payabli cannot list refunds: it documents no refund list endpoint, only the refund writes /MoneyIn/refund/{transId}, and the Operation value a refund row carries is not enumerated ("The transaction\'s operation.").',
    )
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    const res = await this.client(credentials).post<{ data?: RawPayabliRefund }>('/refunds', {
      chargeId: data.chargeId,
      amount: data.amount,
    })
    return transformRefund(res.data ?? {})
  }

  // ── Disputes ──────────────────────────────────────────────────────────────

  /** GET /ChargeBacks/read/{Id}: "Retrieves a chargeback record and its details." */
  async getDispute(credentials: Credentials, id: string): Promise<Dispute> {
    const raw = await this.client(credentials).get<RawPayabliChargeback>(
      `/ChargeBacks/read/${encodeURIComponent(id)}`,
    )
    return transformDispute(raw, connectionCurrency(credentials))
  }

  /** GET /Query/chargebacks/{entry}: "a list of chargebacks and returned transactions for a paypoint." */
  async listDisputes(credentials: Credentials, params: QueryParams): Promise<Dispute[]> {
    const entry = this.entry(credentials, 'chargebacks')
    const rows = await this.queryPage<RawPayabliChargeback>(
      credentials,
      'chargebacks',
      entry,
      params,
    )
    const currency = connectionCurrency(credentials)
    return rows.map((r) => transformDispute(r, currency))
  }

  // ── Invoices ──────────────────────────────────────────────────────────────
  // Invoice records document no currency field, so both methods need the
  // connection's currency and refuse before any request without one.

  private invoiceCurrency(credentials: Credentials): string {
    const currency = connectionCurrency(credentials)
    if (!currency) {
      throw notSupported(
        'Payabli invoices carry no currency field (GET /Query/invoices/{entry}, GET /Invoice/{idInvoice}), and the connection has no currency (USD or CAD) to read them in.',
      )
    }
    return currency
  }

  /** GET /Invoice/{idInvoice}: "Retrieves a single invoice by ID." */
  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const currency = this.invoiceCurrency(credentials)
    const raw = await this.client(credentials).get<RawPayabliInvoice>(
      `/Invoice/${encodeURIComponent(id)}`,
    )
    return transformInvoice(raw, currency)
  }

  /** GET /Query/invoices/{entry}: "Returns a list of invoices for an entrypoint." */
  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const entry = this.entry(credentials, 'invoices')
    const currency = this.invoiceCurrency(credentials)
    const rows = await this.queryPage<RawPayabliInvoice>(credentials, 'invoices', entry, params)
    return rows.map((r) => transformInvoice(r, currency))
  }

  // ── Subscriptions ─────────────────────────────────────────────────────────

  /** GET /Subscription/{subId}: "Retrieves a single subscription's details." */
  async getSubscription(credentials: Credentials, id: string): Promise<Subscription> {
    const raw = await this.client(credentials).get<RawPayabliSubscription>(
      `/Subscription/${encodeURIComponent(id)}`,
    )
    return transformSubscription(raw)
  }

  /** GET /Query/subscriptions/{entry}: "Returns a list of subscriptions for a single paypoint." */
  async listSubscriptions(credentials: Credentials, params: QueryParams): Promise<Subscription[]> {
    const entry = this.entry(credentials, 'subscriptions')
    const rows = await this.queryPage<RawPayabliSubscription>(
      credentials,
      'subscriptions',
      entry,
      params,
    )
    return rows.map(transformSubscription)
  }
}
