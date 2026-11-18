import { toCalendarDate, toIsoDateTime } from '../shared/transform'
/**
 * Ramp accounting adapter.
 *
 * Ramp is a spend management platform with a REST API at:
 *   https://api.ramp.com/developer/v1/
 *
 * Supported canonical resources:
 *   - Organization   (GET /business)
 *   - Account        (GET /accounting/accounts — GL chart of accounts)
 *   - Contact        (GET /accounting/vendors — supplier contacts)
 *   - Transaction    (GET /transactions — card transactions)
 *   - Expense        (GET /reimbursements — out-of-pocket employee reimbursements)
 *   - Bill           (GET/POST /bills — AP invoices)
 *   - PurchaseOrder  (GET /purchase-orders)
 *   - TaxRate        (GET /accounting/tax/rates)
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: invoice    — Ramp is AP/spend-only; no AR invoice endpoint exists in the API
 * Unavailable: creditmemo — Ramp has no credit memo concept; no endpoint in the API
 * Unavailable: journal    — No journal entry endpoint in the Ramp API
 * Unavailable: order      — No generic order endpoint in the Ramp API
 * Unavailable: salesorder — Ramp has no sales order concept; no endpoint in the API
 */

import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  pageByRows,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Account } from '../../schema/account'
import type { Contact } from '../../schema/contact'
import type { Organization } from '../../schema/organization'
import type { Transaction } from '../../schema/transaction'
import type { Expense } from '../../schema/expense'
import type { Bill } from '../../schema/bill'
import type { PurchaseOrder } from '../../schema/purchaseorder'
import type { TaxRate } from '../../schema/taxrate'
import type { WebhookEvent } from '../../schema/webhook'

import { buildAuthUrl, exchangeCode, refreshAccessToken } from './auth'
import { RampClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, MIN_PAGE_SIZE } from './constants'

import { transformAccount, type RampGLAccount } from './transform/account'
import { transformVendor, type RampVendor } from './transform/contact'
import { transformOrganization, type RampBusiness } from './transform/organization'
import { transformTransaction, type RampTransaction } from './transform/transaction'
import { transformExpense, type RampReimbursement } from './transform/expense'
import { transformBill, type RampBill } from './transform/bill'
import { transformPurchaseOrder, type RampPurchaseOrder } from './transform/purchaseorder'
import { transformTaxRate, type RampTaxRate } from './transform/taxrate'
import { rampWebhook } from './webhook'

interface RampAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}

export class RampAdapter implements AccountingAdapter {
  readonly platform = 'ramp'
  readonly version = '0.1.0'
  /**
   * `page_size` on every list endpoint here: "The value must be between 2 and
   * 100." (https://docs.ramp.com/openapi/developer-api.json). Every list pages
   * at the size it is asked for up to this.
   */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: RampAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return exchangeCode(code, this.clientId, this.clientSecret, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) throw new Error('No refresh token available')
    return refreshAccessToken(credentials.refreshToken, this.clientId, this.clientSecret)
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return rampWebhook.verifyWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return rampWebhook.parseWebhookEvents(payload)
  }

  // ── Paging ─────────────────────────────────────────────────────────────────

  /**
   * The caller's page `page` of one Ramp list, at `limit`.
   *
   * Every list endpoint pages by keyset: `start` ("The ID of the last entity
   * of the previous page") and `page_size` (2-100), with the complete URL of
   * the next page in `page.next`, null on the last page
   * (https://docs.ramp.com/llms-guides/pagination.txt). The lists used to send
   * `page_size` and never follow `page.next`, so page 2 was page 1 again.
   *
   * At a limit of 2-100 one upstream page is one caller page: `pageByCursor`
   * walks the `page.next` chain to page `page` and remembers where each page
   * starts. A limit outside that range cannot be sent as `page_size` (1 is
   * below the floor, a direct call can exceed the ceiling), so the list is
   * read in upstream pages of the nearest allowed size and `pageByRows` cuts
   * exactly the caller's rows out of them.
   *
   * The key names the connection (Ramp credentials carry no business id, so
   * `connectionScope` fingerprints the refresh token, which Ramp does not
   * rotate), the list, every filter and the upstream page size.
   */
  private async pagedList<R, T>(
    credentials: Credentials,
    params: QueryParams,
    path: string,
    filters: Record<string, unknown>,
    transform: (raw: R) => T,
  ): Promise<T[]> {
    const client = new RampClient(credentials)
    const limit = Math.floor(params.limit ?? DEFAULT_PAGE_SIZE)
    const size = Math.min(Math.max(limit, MIN_PAGE_SIZE), MAX_PAGE_SIZE)
    const key = cursorPagerKey(connectionScope('ramp', credentials), path, {
      ...filters,
      page_size: size,
    })
    const fetch = async (next: string | undefined) => {
      const res = await client.list<R>(path, filters, size, next)
      return { items: res.data ?? [], next: res.page?.next || undefined }
    }
    if (size === limit) {
      const { items, hasMore } = await pageByCursor<R, string>(key, params.page, fetch)
      reportUpstreamPage(params, { hasMore })
      return items.map(transform)
    }
    const { items } = await pageByRows<R, string>(key, params, fetch)
    return items.map(transform)
  }

  // ── Organization ───────────────────────────────────────────────────────────

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new RampClient(credentials)
    const res = await client.get<RampBusiness>('business')
    return transformOrganization(res)
  }

  // ── GL Accounts ────────────────────────────────────────────────────────────

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    return this.pagedList<RampGLAccount, Account>(
      credentials,
      params,
      'accounting/accounts',
      {},
      transformAccount,
    )
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new RampClient(credentials)
    const res = await client.get<RampGLAccount>(`accounting/accounts/${id}`)
    return transformAccount(res)
  }

  // ── Vendors (Contacts / suppliers) ────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    return this.pagedList<RampVendor, Contact>(
      credentials,
      params,
      'accounting/vendors',
      {},
      transformVendor,
    )
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new RampClient(credentials)
    const res = await client.get<RampVendor>(`accounting/vendors/${id}`)
    return transformVendor(res)
  }

  // ── Transactions (card transactions) ──────────────────────────────────────

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const query: Record<string, unknown> = {}
    if (params.updatedAfter) {
      query['from_date'] = params.updatedAfter.toISOString().split('T')[0]
    }
    return this.pagedList<RampTransaction, Transaction>(
      credentials,
      params,
      'transactions',
      query,
      transformTransaction,
    )
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new RampClient(credentials)
    const res = await client.get<RampTransaction>(`transactions/${id}`)
    return transformTransaction(res)
  }

  // ── Reimbursements (Expenses) ──────────────────────────────────────────────

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const query: Record<string, unknown> = {}
    if (params.updatedAfter) {
      query['from_date'] = params.updatedAfter.toISOString().split('T')[0]
    }
    return this.pagedList<RampReimbursement, Expense>(
      credentials,
      params,
      'reimbursements',
      query,
      transformExpense,
    )
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new RampClient(credentials)
    const res = await client.get<RampReimbursement>(`reimbursements/${id}`)
    return transformExpense(res)
  }

  // ── Bills ──────────────────────────────────────────────────────────────────

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    return this.pagedList<RampBill, Bill>(credentials, params, 'bills', {}, transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new RampClient(credentials)
    const res = await client.get<RampBill>(`bills/${id}`)
    return transformBill(res)
  }

  async createBill(credentials: Credentials, data: Partial<Bill>): Promise<Bill> {
    const client = new RampClient(credentials)
    const body: Record<string, unknown> = {}
    if (data.billNumber) body['invoice_number'] = data.billNumber
    if (data.contactId) body['vendor'] = { id: data.contactId }
    if (data.totalAmount !== undefined || data.currency) {
      body['amount'] = {
        amount: data.totalAmount,
        currency_code: data.currency,
      }
    }
    if (data.dueAt) body['due_date'] = toCalendarDate(data.dueAt)
    if (data.postedAt) body['issued_at'] = toIsoDateTime(data.postedAt)
    if (data.lineItems?.length) {
      body['line_items'] = data.lineItems.map((li) => ({
        gl_account_id: li.accountId,
        amount: li.totalAmount,
        memo: li.itemDescription,
      }))
    }
    const res = await client.post<RampBill>('bills', body)
    return transformBill(res)
  }

  async updateBill(credentials: Credentials, id: string, data: Partial<Bill>): Promise<Bill> {
    const client = new RampClient(credentials)
    const body: Record<string, unknown> = {}
    if (data.billNumber !== undefined) body['invoice_number'] = data.billNumber
    if (data.dueAt !== undefined) body['due_date'] = toCalendarDate(data.dueAt)
    if (data.postedAt !== undefined) body['issued_at'] = toIsoDateTime(data.postedAt)
    if (data.lineItems?.length) {
      body['line_items'] = data.lineItems.map((li) => ({
        gl_account_id: li.accountId,
        amount: li.totalAmount,
        memo: li.itemDescription,
      }))
    }
    const res = await client.patch<RampBill>(`bills/${id}`, body)
    return transformBill(res)
  }

  // ── Purchase Orders ────────────────────────────────────────────────────────

  async listPurchaseOrders(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PurchaseOrder[]> {
    return this.pagedList<RampPurchaseOrder, PurchaseOrder>(
      credentials,
      params,
      'purchase-orders',
      {},
      transformPurchaseOrder,
    )
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new RampClient(credentials)
    const res = await client.get<RampPurchaseOrder>(`purchase-orders/${id}`)
    return transformPurchaseOrder(res)
  }

  // ── Tax Rates ──────────────────────────────────────────────────────────────

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    return this.pagedList<RampTaxRate, TaxRate>(
      credentials,
      params,
      'accounting/tax/rates',
      {},
      transformTaxRate,
    )
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new RampClient(credentials)
    const res = await client.get<RampTaxRate>(`accounting/tax/rates/${id}`)
    return transformTaxRate(res)
  }
}
