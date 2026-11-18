/**
 * Rillet accounting adapter.
 *
 * Rillet is a revenue-recognition and accounting platform for SaaS companies.
 * Auth: API key (Bearer token) — no OAuth2 code flow.
 * API version: v4.0, sent as `X-Rillet-API-Version: 4` (constants.ts).
 * Reference: https://docs.api.rillet.com/llms.txt; every page cited below is
 * a v4.0 page under https://docs.api.rillet.com/reference/ (fetched
 * 2026-09-29). v4.0 changes no path, list parameter, list key or paging
 * shape the adapter uses; see README.md for the per-resource check.
 *
 * Supported resources:
 *   - Organization (GET /organizations/self)
 *   - Invoices     (GET, POST, DELETE /invoices)
 *   - Bills        (GET, POST, DELETE /bills)
 *   - Contacts     (customers: /customers, vendors: /vendors; update is
 *                   read-merge-write, see contact-update.ts)
 *   - Accounts     (GET /accounts)
 *   - Journals     (GET, POST /journal-entries)
 *   - Transactions (GET /bank-transactions)
 *   - Tax Rates    (GET /tax-rates)
 *   - Credit Memos (GET /credit-memos)
 *   - Expenses     (GET, POST /charges — Rillet's card charge model)
 *
 * ── Refused (501 NOT_SUPPORTED, before any request) ─────────────────
 * updateInvoice: PUT /invoices/{id} is a full replace whose FULL scope
 *   requires `bank_account_id` (UpdateFullInvoiceRequest), which no canonical
 *   Invoice field carries, and the Invoice response has no `scope` to tell a
 *   FULL invoice from a REVENUE_RECOGNITION_ONLY one, whose update body differs.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: order       — Rillet has no order-management concept; sales flow via contracts/invoices
 * Unavailable: salesorder  — no sales-order endpoint in Rillet API
 * Unavailable: purchaseorder — no purchase-order endpoint in Rillet API
 */

import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  pageByRows,
  pageLocally,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Journal } from '../../schema/journal'
import type { Transaction } from '../../schema/transaction'
import type { TaxRate } from '../../schema/taxrate'
import type { Expense } from '../../schema/expense'
import type { CreditMemo } from '../../schema/creditmemo'
import type { Organization } from '../../schema/organization'

import { credentialsFromApiKey, refreshCredentials } from './auth'
import { RilletClient } from './client'
import { minorToRilletAmount } from './money'
import { customerUpdateBody, vendorUpdateBody } from './contact-update'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { toCalendarDate } from '../shared/transform'
import { transformInvoice, type RilletInvoice } from './transform/invoice'
import { transformBill, type RilletBill } from './transform/bill'
import {
  transformCustomer,
  transformVendor,
  type RilletCustomer,
  type RilletVendor,
} from './transform/contact'
import { transformAccount, type RilletAccount } from './transform/account'
import { transformOrganization, type RilletOrganization } from './transform/organization'
import { transformJournal, type RilletJournalEntry } from './transform/journal'
import { transformTransaction, type RilletBankTransaction } from './transform/transaction'
import { transformTaxRate, type RilletTaxRate } from './transform/taxrate'
import { transformCreditMemo, type RilletCreditMemo } from './transform/creditmemo'
import { transformExpense, type RilletCharge } from './transform/expense'

interface RilletAdapterConfig {
  /** Rillet API key (long-lived; managed in Rillet organization settings). */
  apiKey?: string
}

/**
 * A position in the contact stream: the customer list, then the vendor list,
 * each at its own `next_cursor` (or its first page). Cursors are per list, so
 * each position names the list it belongs to.
 */
interface ContactCursor {
  list: 'customers' | 'vendors'
  cursor?: string
}

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

function invalid(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 400, code: 'VALIDATION_ERROR' })
}

/** A request amount in the currency's own decimals, or a 400 naming the field. */
function requestAmount(minor: number | null | undefined, currency: string, field: string) {
  if (minor === undefined || minor === null) throw invalid(`Rillet: ${field} is required`)
  const amount = minorToRilletAmount(minor, currency)
  if (!amount) throw invalid(`Rillet: ${field} is not an amount in ${currency}`)
  return amount
}

/** The document currency, which every Rillet request amount carries. */
function requireCurrency(currency: string | undefined, what: string): string {
  if (!currency)
    throw invalid(
      `Rillet: ${what} needs a currency; every request amount is a { amount, currency } pair`,
    )
  return currency
}

/**
 * Bill and charge line tax has no canonical mapping (see createBill), so a
 * line that carries any is refused before any request rather than dropped.
 */
function refuseLineTax(
  lines: Array<{ taxAmount?: number | null; taxrateId?: string | null }>,
  what: string,
): void {
  if (lines.some((li) => li.taxAmount || li.taxrateId))
    throw notSupported(
      `Rillet: ${what} line tax needs an ExpenseTaxRate (coverage, country, description, percentage, type), which no canonical field carries`,
    )
}

/** A line's ledger reference: the chart-of-accounts code, or the Account.id to look it up by. */
interface AccountRef {
  accountCode?: string | null
  accountId?: string | null
}

/**
 * Pager scope for one connection. Rillet credentials are an API key and carry
 * no organization id, so the connection is told apart by the fingerprint
 * `connectionScope` takes of the key, never by the key itself.
 */
function pagerScope(credentials: Credentials): string {
  return connectionScope('rillet', credentials)
}

export class RilletAdapter implements AccountingAdapter {
  readonly platform = 'rillet'
  readonly version = '0.1.0'
  /**
   * "Page size is defined by the `limit` query parameter. If no value is
   * defined, a default size of 25 is used. The maximum allowed value for the
   * page size is 100." (https://docs.api.rillet.com/docs/getting-started.md;
   * PageLimit maximum 100 on every cursor-paged list). Every list pages at
   * the size it is asked for up to that, reports its end, or pages locally.
   */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  private apiKey: string

  constructor(config: RilletAdapterConfig) {
    this.apiKey = config.apiKey ?? ''
  }

  // ── Auth ─────────────────────────────────────────────────────────────────────

  /**
   * Rillet uses API keys, not OAuth2. This method is a no-op that returns a
   * synthetic "auth URL" pointing to Rillet's API key settings page so the
   * connection wizard can direct users to obtain their key.
   */
  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    return 'https://app.rillet.io/settings/api-access'
  }

  /**
   * Not applicable for API-key auth. Stores the API key as the access token.
   */
  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return credentialsFromApiKey(this.apiKey)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshCredentials(credentials)
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): RilletClient {
    return new RilletClient(credentials)
  }

  /** The documented `updated.gt` filter, when the caller asked for changes only. */
  private filters(params: QueryParams): Record<string, unknown> {
    return params.updatedAfter ? { 'updated.gt': params.updatedAfter.toISOString() } : {}
  }

  /** The caller's limit, clamped to the documented maximum of 100. */
  private upstreamSize(params: QueryParams): number {
    return Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
  }

  /**
   * The chart of accounts by `Account.id`, read once per write and only when
   * something needs it. GET /accounts returns the whole chart, each row with
   * its `id`, `code` and `type` (ASSET | LIABILITY | EQUITY | EXPENSE |
   * INCOME) (https://docs.api.rillet.com/reference/list-all-accounts.md).
   */
  private lazyChart(client: RilletClient): () => Promise<Map<string, RilletAccount>> {
    let chart: Promise<Map<string, RilletAccount>> | undefined
    return () =>
      (chart ??= client
        .listAll<RilletAccount>('accounts', 'accounts')
        .then((rows) => new Map(rows.filter((a) => a.id && a.code).map((a) => [a.id, a]))))
  }

  /**
   * The `account_code` each line posts to. Bill, charge and journal entry
   * lines take the chart-of-accounts code, not the account id
   * (`BillItemRequest.account_code`, https://docs.api.rillet.com/reference/create-a-bill-1.md;
   * `ChargeItemRequest.account_code`, https://docs.api.rillet.com/reference/create-a-charge.md;
   * `JournalEntryItemRequest.account_code`, required,
   * https://docs.api.rillet.com/reference/create-a-journal-entry.md), and so
   * does an invoice item's `ItemRevenue.account_code`
   * (https://docs.api.rillet.com/reference/create-an-invoice-1.md). A line's
   * `accountCode` is used as given; otherwise its `accountId` (an
   * `Account.id`, the id space reads return) is looked up in the chart (see
   * {@link lazyChart}), which is read only when some line needs it. A line
   * with neither, or an id the chart does not have, is refused with a 400
   * before anything is written.
   */
  private async accountCodes(
    chart: () => Promise<Map<string, RilletAccount>>,
    lines: AccountRef[],
    what: string,
  ): Promise<string[]> {
    lines.forEach((li, i) => {
      if (!li.accountCode && !li.accountId)
        throw invalid(`Rillet: ${what} line ${i + 1} needs an accountCode or an accountId`)
    })
    const byId = lines.some((li) => !li.accountCode) ? await chart() : undefined
    return lines.map((li, i) => {
      if (li.accountCode) return li.accountCode
      const code = byId?.get(li.accountId as string)?.code
      if (!code)
        throw invalid(
          `Rillet: ${what} line ${i + 1}: accountId ${li.accountId} is not in the chart of accounts`,
        )
      return code
    })
  }

  /**
   * The caller's page of one cursor-paged list: `limit` and `cursor` in, the
   * rows under `key` and `pagination.next_cursor` out ("In order to access the
   * next page, the cursor is passed with the `cursor` query parameter.
   * Subsequent calls will also return a next cursor or no cursor if this is
   * the last page." — https://docs.api.rillet.com/docs/getting-started.md).
   *
   * One upstream page is one caller page, so `pageByCursor` walks the chain to
   * page `page` and remembers where each page starts. The list used to send
   * no cursor, so page 2 was page 1 again, and read its rows from `data`,
   * which no Rillet list response has. The size is the caller's limit,
   * clamped to 100; a clamped page reports the size it sent, so it is judged
   * at it. The key holds the size, because a cursor points at a row, and the
   * row that starts page N differs by size.
   *
   * Cursors live 2 hours upstream and an expired one silently restarts from
   * page 1. That is safe for a walk that moves forward (the sync worker, a
   * client paging on): each page's cursor was minted by the request just
   * before it. It is not a guarantee for jumps back. The pager forgets a walk
   * after a minute IDLE, and that clock slides with every use while a
   * remembered cursor is never aged on its own, so a key kept busy for over
   * two hours could hand a jump back to an early page a dead cursor, and
   * Rillet would answer with page 1's rows. Aging each cursor belongs in the
   * shared pager.
   */
  private async cursorList<R, T>(
    credentials: Credentials,
    params: QueryParams,
    path: string,
    key: string,
    transform: (raw: R) => T,
  ): Promise<T[]> {
    const client = this.client(credentials)
    const size = this.upstreamSize(params)
    const filters = this.filters(params)
    const { items, hasMore } = await pageByCursor<R, string>(
      cursorPagerKey(pagerScope(credentials), path, { ...filters, limit: size }),
      params.page,
      (cursor) =>
        client.listPage<R>(path, key, {
          ...filters,
          limit: size,
          ...(cursor !== undefined ? { cursor } : {}),
        }),
    )
    reportUpstreamPage(params, {
      hasMore,
      ...(params.limit !== undefined && size < params.limit ? { pageSize: size } : {}),
    })
    return items.map(transform)
  }

  // ── Organization ─────────────────────────────────────────────────────────────

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = this.client(credentials)
    const raw = await client.get<RilletOrganization>('organizations/self')
    return transformOrganization(raw)
  }

  // ── Invoices ─────────────────────────────────────────────────────────────────

  /** GET /invoices: rows under `invoices`, paged by `cursor` (see {@link cursorList}). */
  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    return this.cursorList<RilletInvoice, Invoice>(
      credentials,
      params,
      'invoices',
      'invoices',
      transformInvoice,
    )
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = this.client(credentials)
    const raw = await client.get<RilletInvoice>(`invoices/${id}`)
    return transformInvoice(raw)
  }

  /**
   * POST /invoices with `scope: "FULL"`, the scope "used when the invoice is
   * generated and sent directly from Rillet", where "Rillet automatically
   * assigns the invoice number" (https://docs.api.rillet.com/reference/create-an-invoice-1.md).
   * `CreateFullInvoiceRequest` requires `customer_id`, `invoice_date` and at
   * least one item; each `CreateFullInvoiceItemRequest` requires
   * `description` and `price`, whose `InvoiceItemPriceRequest` requires
   * `product_id`, `quantity` and `amount_per_unit` (a MonetaryAmount).
   * `ItemRevenue.account_code` is optional ("If not provided, the one from the
   * product will be used"); it is sent when a line names its ledger account,
   * by `accountCode` or by `accountId` resolved through the chart (see
   * {@link accountCodes}), so a line never silently posts to the product's
   * default account instead of the one the caller named.
   *
   * A missing required value is a 400. Values Rillet would take through a
   * shape no canonical field maps to are refused with a 501 rather than
   * dropped, since dropping them would change the invoice: an
   * `invoiceNumber` (FULL assigns its own; REVENUE_RECOGNITION_ONLY also
   * requires `external_references` on the invoice and every item), a line
   * discount (`amount_per_unit` is the rate "after applying the discount",
   * and `Discount` is an `AmountDiscount.amount_off` or a percentage whose
   * basis, per unit or per line, the reference does not state), and line tax
   * (`TaxRateWithOptionalAmountAndCode` is a `TaxRateWithOptionalAmount`,
   * which requires `country`, `description`, `percentage` and `type`).
   */
  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    if (data.invoiceNumber)
      throw notSupported(
        'Rillet assigns the number of an invoice it issues (scope FULL); an invoiceNumber cannot be set',
      )
    const lines = data.lineItems ?? []
    for (const li of lines) {
      if (li.discountAmount)
        throw notSupported('Rillet: line discounts are not mapped to an invoice item price')
      if (li.taxAmount || li.taxrateId)
        throw notSupported(
          'Rillet: line tax needs a tax rate country, description, percentage and type, which no canonical field carries',
        )
    }
    if (!data.contactId) throw invalid('Rillet: an invoice needs contactId (customer_id)')
    const invoiceDate = toCalendarDate(data.postedAt)
    if (!invoiceDate) throw invalid('Rillet: an invoice needs postedAt (invoice_date)')
    if (lines.length === 0) throw invalid('Rillet: an invoice needs at least one line item')
    const currency = requireCurrency(data.currency, 'an invoice')
    const prepared = lines.map((li, i) => {
      const n = i + 1
      const description = li.itemDescription ?? li.itemName
      if (!description) throw invalid(`Rillet: invoice line ${n} needs itemDescription`)
      if (!li.itemId) throw invalid(`Rillet: invoice line ${n} needs itemId (the Rillet product)`)
      if (li.unitQuantity === undefined || li.unitQuantity === null)
        throw invalid(`Rillet: invoice line ${n} needs unitQuantity`)
      return {
        description,
        price: {
          product_id: li.itemId,
          quantity: li.unitQuantity,
          amount_per_unit: requestAmount(li.unitAmount, currency, `invoice line ${n} unitAmount`),
        },
      }
    })
    const client = this.client(credentials)
    const named = lines.flatMap((li, i) => (li.accountCode || li.accountId ? [i] : []))
    const codes = await this.accountCodes(
      this.lazyChart(client),
      named.map((i) => lines[i]),
      'invoice',
    )
    const revenueCode = new Map(named.map((lineIndex, k) => [lineIndex, codes[k]]))
    const items = prepared.map((item, i) => {
      const code = revenueCode.get(i)
      return code ? { ...item, revenue: { account_code: code } } : item
    })
    const dueDate = toCalendarDate(data.dueAt)
    const raw = await client.post<RilletInvoice>('invoices', {
      scope: 'FULL',
      customer_id: data.contactId,
      invoice_date: invoiceDate,
      ...(dueDate ? { due_date: dueDate } : {}),
      ...(data.notes ? { memo: data.notes } : {}),
      ...(data.reference ? { purchase_order_number: data.reference } : {}),
      items,
    })
    return transformInvoice(raw)
  }

  /**
   * Refused before any request. PUT /invoices/{id} "is a full-replace
   * operation" (https://docs.api.rillet.com/reference/update-an-invoice-1.md),
   * and its FULL body (`UpdateFullInvoiceRequest`) requires `bank_account_id`,
   * which no canonical Invoice field carries. The `Invoice` response has no
   * `scope` either, so an update cannot tell a FULL invoice from a
   * REVENUE_RECOGNITION_ONLY one, whose body (`UpdateRevenueRecognitionOnlyInvoiceRequest`)
   * differs.
   */
  async updateInvoice(
    _credentials: Credentials,
    _id: string,
    _data: Partial<Invoice>,
  ): Promise<Invoice> {
    throw notSupported(
      'Rillet invoice updates need bank_account_id and the invoice scope, which the canonical invoice does not carry',
    )
  }

  async deleteInvoice(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`invoices/${id}`)
  }

  // ── Bills ─────────────────────────────────────────────────────────────────────

  /** GET /bills: rows under `bills`, paged by `cursor` (see {@link cursorList}). */
  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    return this.cursorList<RilletBill, Bill>(credentials, params, 'bills', 'bills', transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = this.client(credentials)
    const raw = await client.get<RilletBill>(`bills/${id}`)
    return transformBill(raw)
  }

  /**
   * POST /bills. `CreateBillRequest` requires `vendor_id`, `expense_number`,
   * `bill_date`, `due_date` and at least one item; `BillItemRequest`
   * requires `account_code` and `amount`
   * (https://docs.api.rillet.com/reference/create-a-bill-1.md). A missing one
   * is a 400; line codes resolve as in {@link accountCodes}.
   *
   * Line tax is a 501: `BillItemRequest.tax_rate` is an `ExpenseTaxRate`,
   * which requires `coverage` (INCLUSIVE | EXCLUSIVE) and the
   * `TaxRateWithOptionalAmount` fields `country`, `description`,
   * `percentage` and `type`, none of which a canonical line carries.
   * Sending the line without it would book the tax as expense.
   */
  async createBill(credentials: Credentials, data: Partial<Bill>): Promise<Bill> {
    if (!data.contactId) throw invalid('Rillet: a bill needs contactId (vendor_id)')
    if (!data.billNumber) throw invalid('Rillet: a bill needs billNumber (expense_number)')
    const billDate = toCalendarDate(data.postedAt)
    if (!billDate) throw invalid('Rillet: a bill needs postedAt (bill_date)')
    const dueDate = toCalendarDate(data.dueAt)
    if (!dueDate) throw invalid('Rillet: a bill needs dueAt (due_date)')
    const lines = data.lineItems ?? []
    refuseLineTax(lines, 'bill')
    if (lines.length === 0) throw invalid('Rillet: a bill needs at least one line item')
    const currency = requireCurrency(data.currency, 'a bill')
    const amounts = lines.map((li, i) =>
      requestAmount(li.totalAmount, currency, `bill line ${i + 1} totalAmount`),
    )
    const client = this.client(credentials)
    const codes = await this.accountCodes(this.lazyChart(client), lines, 'bill')
    const raw = await client.post<RilletBill>('bills', {
      vendor_id: data.contactId,
      expense_number: data.billNumber,
      bill_date: billDate,
      due_date: dueDate,
      items: lines.map((li, i) => ({
        ...(li.itemDescription ? { description: li.itemDescription } : {}),
        account_code: codes[i],
        amount: amounts[i],
      })),
    })
    return transformBill(raw)
  }

  async deleteBill(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`bills/${id}`)
  }

  // ── Contacts ─────────────────────────────────────────────────────────────────

  /**
   * Customers, then vendors, as one stream.
   *
   * GET /customers and GET /vendors each take `limit`, `cursor` and
   * `updated.gt`, and answer under `customers` and `vendors` with their own
   * `pagination.next_cursor`. The stream reads the customer list to its end,
   * then the vendor list, each by its own cursor, and `pageByRows` cuts
   * exactly the caller's rows out of it with `hasMore` exact. This used to
   * send the caller's limit to both lists with no cursor and return up to
   * twice the limit, the same rows on every page.
   *
   * Each upstream page is sized by the caller's limit, clamped to 100, so the
   * size is in the key; the rows served per page are always the caller's
   * limit. The positions are objects, so a list whose `next_cursor` repeats
   * the cursor it was sent is caught in `client.listPage`, not by the row
   * pager's identity check. The cursor-lifetime caveat on
   * {@link cursorList} applies here too: the row pager's memo slides the
   * same way.
   */
  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = this.client(credentials)
    const size = this.upstreamSize(params)
    const filters = this.filters(params)
    const { items } = await pageByRows<Contact, ContactCursor>(
      cursorPagerKey(pagerScope(credentials), 'customers+vendors', { ...filters, limit: size }),
      params,
      async (at) => {
        const list = at?.list ?? 'customers'
        const query = {
          ...filters,
          limit: size,
          ...(at?.cursor !== undefined ? { cursor: at.cursor } : {}),
        }
        if (list === 'customers') {
          const page = await client.listPage<RilletCustomer>('customers', 'customers', query)
          const next: ContactCursor =
            page.next !== undefined ? { list: 'customers', cursor: page.next } : { list: 'vendors' }
          return { items: page.items.map(transformCustomer), next }
        }
        const page = await client.listPage<RilletVendor>('vendors', 'vendors', query)
        return {
          items: page.items.map(transformVendor),
          next: page.next !== undefined ? { list: 'vendors', cursor: page.next } : undefined,
        }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items
  }

  /**
   * A contact id names a customer or a vendor, and nothing says which: the
   * customer is tried first, and the vendor only when Rillet answers 404 for
   * the customer. Any other failure (401, 429 past retries, 5xx, network) is
   * thrown as it is; it used to fall through to the vendor lookup, whose 404
   * then hid the real error.
   */
  private async findContact(
    client: RilletClient,
    id: string,
  ): Promise<{ kind: 'customer'; raw: RilletCustomer } | { kind: 'vendor'; raw: RilletVendor }> {
    try {
      return { kind: 'customer', raw: await client.get<RilletCustomer>(`customers/${id}`) }
    } catch (err) {
      if ((err as { response?: { status?: number } })?.response?.status !== 404) throw err
    }
    return { kind: 'vendor', raw: await client.get<RilletVendor>(`vendors/${id}`) }
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const found = await this.findContact(this.client(credentials), id)
    return found.kind === 'customer' ? transformCustomer(found.raw) : transformVendor(found.raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = this.client(credentials)
    if (data.isSupplier && !data.isCustomer) {
      const raw = await client.post<RilletVendor>('vendors', {
        name: data.name,
        email: data.emails?.[0]?.email,
        address: data.billingAddress
          ? {
              line1: data.billingAddress.address1,
              line2: data.billingAddress.address2 ?? undefined,
              city: data.billingAddress.city,
              state: data.billingAddress.region,
              zip_code: data.billingAddress.postalCode,
              country: data.billingAddress.country,
            }
          : undefined,
      })
      return transformVendor(raw)
    }
    const raw = await client.post<RilletCustomer>('customers', {
      name: data.name,
      emails: data.emails?.map((e) => ({ email: e.email, type: 'MAIN_SENDER' })),
      address: data.billingAddress
        ? {
            line1: data.billingAddress.address1,
            line2: data.billingAddress.address2 ?? undefined,
            city: data.billingAddress.city,
            state: data.billingAddress.region,
            zip_code: data.billingAddress.postalCode,
            country: data.billingAddress.country,
          }
        : undefined,
    })
    return transformCustomer(raw)
  }

  /**
   * Read, merge, write. PUT /customers/{id} and PUT /vendors/{id} are full
   * replaces ("omitting any field will set it to null, wiping existing data";
   * https://docs.api.rillet.com/reference/update-a-customer-1.md,
   * https://docs.api.rillet.com/reference/update-a-vendor-1.md), so the record
   * is read first (customer, then vendor on 404 only), rebuilt from all of its
   * documented request fields with the canonical changes applied, and PUT
   * whole. A change no documented field takes is refused with 400 before the
   * PUT; see contact-update.ts. This used to send only name and emails, which
   * wiped payment terms, addresses, tax ids and the rest.
   */
  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const client = this.client(credentials)
    const found = await this.findContact(client, id)
    if (found.kind === 'customer') {
      const body = customerUpdateBody(found.raw, data)
      return transformCustomer(await client.put<RilletCustomer>(`customers/${id}`, body))
    }
    const body = vendorUpdateBody(found.raw, data)
    return transformVendor(await client.put<RilletVendor>(`vendors/${id}`, body))
  }

  // ── Accounts ─────────────────────────────────────────────────────────────────

  /**
   * The whole chart of accounts, sliced to the caller's page.
   *
   * GET /accounts documents one query parameter, `updated.gt`, and no
   * `pagination` object: its 200 body is `{ accounts: Account[] }`, "the chart
   * of accounts for the organization tied to the API credentials"
   * (https://docs.api.rillet.com/reference/list-all-accounts.md). So one
   * request returns every account, and `pageLocally` serves each once. Should
   * the response carry a `next_cursor` all the same, as getting started says
   * every list does, `client.listAll` follows it, so no account is dropped
   * and the chart is never reported complete at its first page. It used to
   * return that response whole on every page, read from `data`, which the
   * response does not have.
   */
  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = this.client(credentials)
    const accounts = await client.listAll<RilletAccount>(
      'accounts',
      'accounts',
      this.filters(params),
    )
    return pageLocally(accounts.map(transformAccount), params)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    // Rillet does not expose a single-account GET; fetch all and filter.
    // Return undefined (cast to Account) when not found so callers receive a
    // graceful 404 from the router layer rather than an unhandled exception.
    const accounts = await this.listAccounts(credentials, {})
    return accounts.find((a) => a.id === id) as Account
  }

  // ── Journals ─────────────────────────────────────────────────────────────────

  /** GET /journal-entries: rows under `journal_entries`, paged by `cursor` (see {@link cursorList}). */
  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    return this.cursorList<RilletJournalEntry, Journal>(
      credentials,
      params,
      'journal-entries',
      'journal_entries',
      transformJournal,
    )
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = this.client(credentials)
    const raw = await client.get<RilletJournalEntry>(`journal-entries/${id}`)
    return transformJournal(raw)
  }

  /**
   * POST /journal-entries, "a balanced manual journal entry with explicit
   * debit and credit lines" (https://docs.api.rillet.com/reference/create-a-journal-entry.md).
   * `CreateJournalEntryRequest` requires `name`, `currency`, `date` and at
   * least two items; `JournalEntryItemRequest` requires `amount`,
   * `account_code` and `side` (DEBIT | CREDIT). It takes no account id, and
   * the canonical journal line has no account code, so each line's
   * `accountId` is looked up in the chart (see {@link accountCodes}).
   *
   * Each line posts one side: a positive `debitAmount` or a positive
   * `creditAmount`, not both. Everything the body needs is checked, and the
   * debits must equal the credits, before the chart is read or anything is
   * written; a failure is a 400.
   */
  async createJournal(credentials: Credentials, data: Partial<Journal>): Promise<Journal> {
    if (!data.description) throw invalid('Rillet: a journal entry needs description (name)')
    const date = toCalendarDate(data.postedAt)
    if (!date) throw invalid('Rillet: a journal entry needs postedAt (date)')
    const currency = requireCurrency(data.currency, 'a journal entry')
    const lines = data.lineItems ?? []
    if (lines.length < 2) throw invalid('Rillet: a journal entry needs at least two lines')
    let debits = 0
    let credits = 0
    const sided = lines.map((li, i) => {
      const debit = li.debitAmount ?? 0
      const credit = li.creditAmount ?? 0
      if (debit < 0 || credit < 0 || debit > 0 === credit > 0)
        throw invalid(
          `Rillet: journal line ${i + 1} needs exactly one positive debitAmount or creditAmount`,
        )
      debits += debit
      credits += credit
      return debit > 0
        ? {
            side: 'DEBIT' as const,
            amount: requestAmount(debit, currency, `journal line ${i + 1}`),
          }
        : {
            side: 'CREDIT' as const,
            amount: requestAmount(credit, currency, `journal line ${i + 1}`),
          }
    })
    if (debits !== credits)
      throw invalid(`Rillet: journal debits (${debits}) and credits (${credits}) do not balance`)
    const client = this.client(credentials)
    const codes = await this.accountCodes(
      this.lazyChart(client),
      lines.map((li) => ({ accountId: li.accountId })),
      'journal',
    )
    const raw = await client.post<RilletJournalEntry>('journal-entries', {
      name: data.description,
      currency,
      date,
      items: lines.map((li, i) => ({
        account_code: codes[i],
        side: sided[i].side,
        amount: sided[i].amount,
        ...(li.description ? { description: li.description } : {}),
      })),
    })
    return transformJournal(raw)
  }

  // ── Transactions ──────────────────────────────────────────────────────────────

  /** GET /bank-transactions: rows under `bank_transactions`, paged by `cursor` (see {@link cursorList}). */
  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    return this.cursorList<RilletBankTransaction, Transaction>(
      credentials,
      params,
      'bank-transactions',
      'bank_transactions',
      transformTransaction,
    )
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = this.client(credentials)
    const raw = await client.get<RilletBankTransaction>(`bank-transactions/${id}`)
    return transformTransaction(raw)
  }

  // ── Tax Rates ─────────────────────────────────────────────────────────────────

  /**
   * Every tax rate, sliced to the caller's page.
   *
   * GET /tax-rates documents one optional query parameter, `country`, and no
   * `pagination` object: its 200 body is `{ tax_rates: TaxRateResource[] }`,
   * "all available tax rates"
   * (https://docs.api.rillet.com/reference/list-all-tax-rates.md). So one
   * request returns every rate, and `pageLocally` serves each once; a
   * `next_cursor` that comes back anyway is followed (see `client.listAll`).
   * `updated.gt` is not documented here, so it is not sent.
   */
  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = this.client(credentials)
    const rates = await client.listAll<RilletTaxRate>('tax-rates', 'tax_rates')
    return pageLocally(rates.map(transformTaxRate), params)
  }

  // ── Credit Memos ──────────────────────────────────────────────────────────────

  /** GET /credit-memos: rows under `credit_memos`, paged by `cursor` (see {@link cursorList}). */
  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    return this.cursorList<RilletCreditMemo, CreditMemo>(
      credentials,
      params,
      'credit-memos',
      'credit_memos',
      transformCreditMemo,
    )
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = this.client(credentials)
    const raw = await client.get<RilletCreditMemo>(`credit-memos/${id}`)
    return transformCreditMemo(raw)
  }

  // ── Expenses ──────────────────────────────────────────────────────────────────
  // Rillet models employee and card expenses as "charges" (/charges endpoint).

  /** GET /charges: rows under `charges`, paged by `cursor` (see {@link cursorList}). */
  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    return this.cursorList<RilletCharge, Expense>(
      credentials,
      params,
      'charges',
      'charges',
      transformExpense,
    )
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = this.client(credentials)
    const raw = await client.get<RilletCharge>(`charges/${id}`)
    return transformExpense(raw)
  }

  /**
   * POST /charges. `ChargeRequest` requires `vendor_id`, `charge_date` and
   * at least one item, and is "A card charge. Exactly one of
   * credit_card_account_code or funding_account_code must be provided":
   * "The Credit Card liability account for a post-paid card charge", or "The
   * bank account reduced directly by a pre-funded card charge"
   * (https://docs.api.rillet.com/reference/create-a-charge.md).
   * `ChargeItemRequest` requires `account_code` and `amount`
   * (a RoundedMonetaryAmount).
   *
   * The paying account is the canonical `Expense.accountId`, the account the
   * expense was paid from (Xero `BankAccount`, QuickBooks Purchase
   * `AccountRef`). It is looked up in the chart, and its documented `type`
   * picks the field: a LIABILITY account is a credit card, so
   * `credit_card_account_code`; an ASSET account is a bank account, so
   * `funding_account_code`. Any other type, a missing `accountId`, or one
   * the chart does not have is a 400. Line codes resolve as in
   * {@link accountCodes}; line tax is a 501, as on bills.
   */
  async createExpense(credentials: Credentials, data: Partial<Expense>): Promise<Expense> {
    const lines = data.lineItems ?? []
    refuseLineTax(lines, 'charge')
    if (!data.contactId) throw invalid('Rillet: a charge needs contactId (vendor_id)')
    const chargeDate = toCalendarDate(data.postedAt)
    if (!chargeDate) throw invalid('Rillet: a charge needs postedAt (charge_date)')
    if (!data.accountId)
      throw invalid(
        'Rillet: a charge needs accountId, the credit card or bank account that paid it (credit_card_account_code or funding_account_code)',
      )
    if (lines.length === 0) throw invalid('Rillet: a charge needs at least one line item')
    const currency = requireCurrency(data.currency, 'a charge')
    const amounts = lines.map((li, i) =>
      requestAmount(li.totalAmount, currency, `charge line ${i + 1} totalAmount`),
    )
    const client = this.client(credentials)
    const chart = this.lazyChart(client)
    const codes = await this.accountCodes(chart, lines, 'charge')
    const payer = (await chart()).get(data.accountId)
    if (!payer) throw invalid(`Rillet: accountId ${data.accountId} is not in the chart of accounts`)
    const paidFrom =
      payer.type === 'LIABILITY'
        ? { credit_card_account_code: payer.code }
        : payer.type === 'ASSET'
          ? { funding_account_code: payer.code }
          : undefined
    if (!paidFrom)
      throw invalid(
        `Rillet: accountId ${data.accountId} is a ${payer.type} account; a charge is paid from a credit card (LIABILITY) or bank (ASSET) account`,
      )
    const raw = await client.post<RilletCharge>('charges', {
      vendor_id: data.contactId,
      charge_date: chargeDate,
      ...paidFrom,
      items: lines.map((li, i) => ({
        ...(li.itemDescription ? { description: li.itemDescription } : {}),
        account_code: codes[i],
        amount: amounts[i],
      })),
    })
    return transformExpense(raw)
  }
}
