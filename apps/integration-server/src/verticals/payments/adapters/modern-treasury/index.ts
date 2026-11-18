/**
 * Modern Treasury adapter — payments vertical.
 *
 * Auth: HTTP basic, username = Organization ID, password = API key
 * (https://docs.moderntreasury.com/platform/reference/authentication.md).
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unlisted:    refund       — reversals are listed only per payment order
 *                              (GET /api/payment_orders/{payment_order_id}/reversals); listRefunds refuses
 * Unavailable: dispute       — Modern Treasury has no dispute/chargeback concept; it is a treasury/payment-ops platform, not a card-payment gateway
 * Unavailable: payout        — No dedicated payout resource; outbound transfers are payment orders
 * Unavailable: plan          — No subscription billing / plan concept
 * Unavailable: subscription  — No subscription concept
 */

import {
  connectionScope,
  cursorPagerKey,
  pageByRows,
  type BaseAdapter,
  type CredentialField,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Customer } from '../../schema/customer'
import type { Refund } from '../../schema/refund'
import type { BalanceTransaction } from '../../schema/balance-transaction'
import type { Invoice, InvoiceLineItem } from '../../schema/invoice'
import type { PaymentMethod } from '../../schema/payment-method'
import type { WebhookEvent } from '../../schema/webhook'

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { buildCredentials } from './auth'
import { ModernTreasuryClient } from './client'
import { verifyModernTreasuryWebhook, parseModernTreasuryWebhookEvents } from './webhook'

import { transformCustomer, type RawModernTreasuryCounterparty } from './transform/customer'
import { transformCharge, type RawModernTreasuryPaymentOrder } from './transform/charge'
import { transformRefund, type RawModernTreasuryReversal } from './transform/refund'
import {
  transformBalanceTransaction,
  type RawModernTreasuryTransaction,
} from './transform/balance-transaction'
import {
  transformInvoice,
  transformInvoiceLineItem,
  type RawModernTreasuryInvoice,
  type RawModernTreasuryInvoiceLineItem,
} from './transform/invoice'
import {
  transformPaymentMethod,
  type RawModernTreasuryExternalAccount,
} from './transform/payment-method'

export class ModernTreasuryAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'modern-treasury'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error('Modern Treasury uses an API key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Modern Treasury uses an API key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'organizationId',
        label: 'Organization ID',
        type: 'text',
        required: true,
      },
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

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyModernTreasuryWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseModernTreasuryWebhookEvents(payload)
  }

  private client(credentials: Credentials): ModernTreasuryClient {
    return new ModernTreasuryClient(credentials)
  }

  /**
   * The caller's page of a Modern Treasury list, walked by `after_cursor`.
   *
   * "You may use the query params `after_cursor` and `per_page` to control the
   * number of results you see. For `per_page` the default will be 25 but can
   * optionally be increased to a maximum of 100."
   * (https://docs.moderntreasury.com/platform/reference/pagination.md). The
   * body is a bare array; the next cursor is the `X-After-Cursor` response
   * header, "missing" when there are no more pages. The same page warns that
   * the count returned "may be less than, equal to, or more than the requested
   * amount" and that pages may be blank, so one upstream page is not one caller
   * page: `pageByRows` follows the cursor chain and cuts exactly the caller's
   * rows, reporting `hasMore` exactly. `per_page` is the caller's limit capped
   * at 100, and is part of the walk's key.
   */
  private async listByAfterCursor<R, T>(
    credentials: Credentials,
    params: QueryParams,
    path: string,
    transform: (raw: R) => T,
    pick: (body: unknown) => R[] = (body) => (Array.isArray(body) ? (body as R[]) : []),
    filters: Record<string, string> = {},
  ): Promise<T[]> {
    const perPage = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const key = cursorPagerKey(connectionScope('modern-treasury', credentials), path, {
      ...filters,
      per_page: perPage,
    })
    const client = this.client(credentials)
    const { items } = await pageByRows<T>(
      key,
      params,
      async (afterCursor) => {
        const { data, headers } = await client.getWithHeaders<unknown>(path, {
          ...filters,
          per_page: perPage,
          ...(afterCursor !== undefined ? { after_cursor: afterCursor } : {}),
        })
        const next = Object.entries(headers).find(
          ([name]) => name.toLowerCase() === 'x-after-cursor',
        )?.[1]
        return {
          items: pick(data).map(transform),
          next: typeof next === 'string' && next !== '' ? next : undefined,
        }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items
  }

  // ── Customers (counterparties) ─────────────────────────────────────────────

  /**
   * "Get a paginated list of all counterparties."
   * (https://docs.moderntreasury.com/platform/reference/list-counterparties.md):
   * `GET /counterparties` with `after_cursor` and `per_page`; the 200 body is
   * an array of `counterparty`.
   */
  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    return this.listByAfterCursor<RawModernTreasuryCounterparty, Customer>(
      credentials,
      params,
      '/counterparties',
      transformCustomer,
    )
  }

  /** "Get details on a single counterparty." — `GET /counterparties/{id}`. */
  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.client(credentials).get<RawModernTreasuryCounterparty>(
      `/counterparties/${encodeURIComponent(id)}`,
    )
    return transformCustomer(res)
  }

  // ── Charges (debit payment orders) ─────────────────────────────────────────

  /**
   * "Get a list of all payment orders"
   * (https://docs.moderntreasury.com/platform/reference/list-payment-orders.md),
   * filtered with the documented `direction` query parameter to `debit`: "A
   * `debit` pulls money from someone else's account to your own." A `credit`
   * "moves money from your account to someone else's" and is not a charge.
   */
  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    return this.listByAfterCursor<RawModernTreasuryPaymentOrder, Charge>(
      credentials,
      params,
      '/payment_orders',
      transformCharge,
      undefined,
      { direction: 'debit' },
    )
  }

  /** `GET /payment_orders/{id}`; a credit payment order is not a charge. */
  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).get<RawModernTreasuryPaymentOrder>(
      `/payment_orders/${encodeURIComponent(id)}`,
    )
    if (res.direction !== 'debit')
      throw Object.assign(
        new Error(
          `Modern Treasury payment order ${id} is a ${String(res.direction)}, not a charge`,
        ),
        { statusCode: 404, code: 'NOT_FOUND' },
      )
    return transformCharge(res)
  }

  /**
   * Refused before any request. Modern Treasury documents no list of refunds or
   * reversals across payment orders; reversals are listed only per parent:
   * `/payment_orders/{payment_order_id}/reversals`
   * (https://docs.moderntreasury.com/platform/reference/list-reversals.md).
   */
  async listRefunds(_credentials: Credentials, _params: QueryParams): Promise<Refund[]> {
    throw Object.assign(
      new Error(
        'Modern Treasury cannot list refunds: reversals are listed only per payment order ' +
          '("/payment_orders/{payment_order_id}/reversals"), with no account-wide list',
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    const res = await this.client(credentials).post<{ data?: RawModernTreasuryReversal }>(
      '/refunds',
      {
        chargeId: data.chargeId,
        amount: data.amount,
      },
    )
    return transformRefund(res.data ?? {})
  }

  // ── Invoices ───────────────────────────────────────────────────────────────

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    return this.listByAfterCursor<RawModernTreasuryInvoice, Invoice>(
      credentials,
      params,
      '/invoices',
      transformInvoice,
    )
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const res = await this.client(credentials).get<RawModernTreasuryInvoice>(`/invoices/${id}`)
    return transformInvoice(res)
  }

  async listInvoiceLineItems(
    credentials: Credentials,
    invoiceId: string,
    params: QueryParams,
  ): Promise<InvoiceLineItem[]> {
    return this.listByAfterCursor<RawModernTreasuryInvoiceLineItem, InvoiceLineItem>(
      credentials,
      params,
      `/invoices/${invoiceId}/invoice_line_items`,
      (item) => transformInvoiceLineItem(item, invoiceId),
    )
  }

  // ── Payment Methods (External Accounts) ────────────────────────────────────

  async listPaymentMethods(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PaymentMethod[]> {
    return this.listByAfterCursor<RawModernTreasuryExternalAccount, PaymentMethod>(
      credentials,
      params,
      '/external_accounts',
      transformPaymentMethod,
    )
  }

  async getPaymentMethod(credentials: Credentials, id: string): Promise<PaymentMethod> {
    const res = await this.client(credentials).get<RawModernTreasuryExternalAccount>(
      `/external_accounts/${id}`,
    )
    return transformPaymentMethod(res)
  }

  // ── Balance Transactions (MT transactions) ─────────────────────────────────

  async listBalanceTransactions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<BalanceTransaction[]> {
    return this.listByAfterCursor<RawModernTreasuryTransaction, BalanceTransaction>(
      credentials,
      params,
      '/transactions',
      transformBalanceTransaction,
      (body) =>
        Array.isArray(body)
          ? (body as RawModernTreasuryTransaction[])
          : ((body as { items?: RawModernTreasuryTransaction[] } | null)?.items ?? []),
    )
  }

  async getBalanceTransaction(credentials: Credentials, id: string): Promise<BalanceTransaction> {
    const res = await this.client(credentials).get<RawModernTreasuryTransaction>(
      `/transactions/${id}`,
    )
    return transformBalanceTransaction(res)
  }
}
