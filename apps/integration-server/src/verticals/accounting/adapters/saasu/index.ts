/**
 * Saasu adapter.
 *
 * Every endpoint, parameter and field below comes from the Saasu API help at
 * https://api.saasu.com/Help and its per-endpoint pages, fetched 2026-09-29.
 * Base URL https://api.saasu.com/; every call carries the documented `FileId`
 * and `wsAccessKey` URL arguments (see ./client.ts).
 *
 *  - Organization   GET FileIdentity                 /Help/Api/GET-FileIdentity
 *  - Invoices       GET Invoices, Invoice/{id}       /Help/Api/GET-Invoices,
 *                                                    /Help/Api/GET-Invoice-id-optionalargs
 *  - Bills, expenses, credit memos, orders, sales orders, purchase orders:
 *                   the same two endpoints — Saasu keeps them all as invoices,
 *                   told apart by `TransactionType` ('S' = sale, 'P' =
 *                   purchase) and `InvoiceType` (see ./constants.ts)
 *  - Contacts       GET Contacts, Contact/{id}       /Help/Api/GET-Contacts,
 *                                                    /Help/Api/GET-Contact-id-optionalargs
 *  - Accounts       GET Accounts, Account/{Id}       /Help/Api/GET-Accounts,
 *                                                    /Help/Api/GET-Account-Id-optionalargs
 *  - Journals       GET Journals, Journal/{id}       /Help/Api/GET-Journals,
 *                                                    /Help/Api/GET-Journal-id-optionalargs
 *  - Tax rates      GET TaxCodes, TaxCode/{id}       /Help/Api/GET-TaxCodes,
 *                                                    /Help/Api/GET-TaxCode-id
 *
 * Each list answers an envelope keyed by the resource — `Invoices`,
 * `Contacts`, `Accounts`, `Journals`, `TaxCodes` — beside `_links`; each
 * single GET answers the record at the top level. A body without the
 * documented array is refused (502) rather than read as an empty page.
 *
 * ── Paging ─────────────────────────────────────────────────────────
 * Every list takes `Page` ("the page number of the result set") and
 * `PageSize` ("Maximum page size is 100. Defaults to 25 if not specified"),
 * so `capabilities.maxPageSize` declares 100. `hasMore` is judged on the
 * unfiltered upstream page: a page shorter than the size asked for is the
 * last (the documented samples show `rel: "next"` even on a 2-row page at
 * PageSize 25, so the link alone is not proof of more); a full page has more
 * when `_links` carries `rel: "next"`, or, with no `_links`, by its length.
 *
 * GET Invoices has no `InvoiceType` filter (its documented filters are
 * InvoiceNumber, PurchaseOrderNumber, LastModifiedFromDate/ToDate,
 * TransactionType, Tags, TagSelection, InvoiceFromDate/ToDate, InvoiceStatus,
 * PaymentStatus, BillingContactId). `TransactionType` narrows each list to its
 * side upstream; the `InvoiceType` is then checked on each row here. A
 * filtered page can be short, or empty, and still not be the last, so
 * `hasMore` is always the upstream page's, never the filtered row count's.
 * `InvoiceStatus` (Q/O/I) is not sent: it is "inferred from InvoiceType" and
 * the docs give no mapping from the nine types to the three statuses.
 *
 * List rows are summaries: invoice rows carry no `LineItems` and journal rows
 * no `Items`, so `lineItems` is unset on lists and present on the single GET.
 * Fetching each row's detail would spend one request per row against Saasu's
 * 10,000-a-day limit, so it is not done.
 *
 * ── updated_after ──────────────────────────────────────────────────
 * GET Invoices, Contacts and Journals take `LastModifiedFromDate` ("greater
 * than or equal to a date in UTC (must also specifiy LastModifiedToDate)")
 * and `LastModifiedToDate`, both dates. The from-date is the UTC day of
 * `updatedAfter` (inclusive, a superset); the to-date is tomorrow's UTC day,
 * so nothing modified today falls outside a date-only upper bound. GET
 * Accounts and GET TaxCodes list no modification filter, so they are served
 * whole — a superset of the changed rows, never a gap.
 *
 * ── Refused (501 NOT_SUPPORTED, before any request) ─────────────────
 * listTransactions / getTransaction: the help index lists no transaction,
 * bank-transaction or ledger-entry resource (its sections are Accounts,
 * Activities, Attachments, Company, Contacts, DeletedEntities, FileIdentity,
 * Invoices, Items, Journals, LookupData, OAuth, Payments, Payroll, Reports,
 * Search, Settings, User).
 */
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
import type { Order } from '../../schema/order'
import type { SalesOrder } from '../../schema/salesorder'
import type { PurchaseOrder } from '../../schema/purchaseorder'
import type { Organization } from '../../schema/organization'

import { reportUpstreamPage } from '@opensteward/shared'
import { CREDENTIAL_FORM, buildAuthUrl, exchangeCode, refreshCredentials } from './auth'
import { SaasuClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, TRANSACTION_TYPE } from './constants'
import type { SaasuInvoiceDetail, SaasuInvoiceSummary } from './invoice-shapes'

import { isSaleInvoice, transformInvoice } from './transform/invoice'
import { isPurchaseBill, transformBill } from './transform/bill'
import { transformContact, type SaasuContact } from './transform/contact'
import { transformAccount, type SaasuAccount } from './transform/account'
import { transformJournal, type SaasuJournal } from './transform/journal'
import { transformOrganization, type SaasuFileIdentity } from './transform/organization'
import { transformTaxRate, type SaasuTaxCode } from './transform/taxrate'
import { isExpense, transformExpense } from './transform/expense'
import { isSaleAdjustmentNote, transformCreditMemo } from './transform/creditmemo'
import { isPurchaseOrder, isSaleOrder, transformOrder } from './transform/order'
import { transformSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder } from './transform/purchaseorder'

interface SaasuAdapterConfig {
  wsaccessKey: string
  fileUid: string
}

/** A hypermedia link: `rel`, `href`, `method`, `title` (the `Link` model). */
interface SaasuLink {
  rel?: string | null
  href?: string | null
}

type Envelope = Record<string, unknown> & { _links?: SaasuLink[] | null }

function badGateway(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 502, code: 'UPSTREAM_ERROR' })
}

function notFound(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 404, code: 'NOT_FOUND' })
}

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

/** 1-based page; a missing, zero, negative or non-numeric page is the first. */
function pageNumber(params: QueryParams): number {
  const page = params.page
  return typeof page === 'number' && Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1
}

/** The caller's limit as `PageSize`, at most the documented 100. */
function pageSize(params: QueryParams): number {
  const limit = params.limit
  const size =
    typeof limit === 'number' && Number.isFinite(limit) && limit >= 1
      ? Math.floor(limit)
      : DEFAULT_PAGE_SIZE
  return Math.min(size, MAX_PAGE_SIZE)
}

/**
 * Whether the list has a page after this one. A short (or empty) upstream
 * page is the last, whatever `_links` says: every documented list sample
 * (GET Invoices, Journals, TaxCodes) carries a `rel: "next"` link on a page
 * of 2 rows at `PageSize=25`, so the link alone does not prove another page
 * exists, and trusting it would walk empty pages until the sync worker's page
 * cap — against Saasu's 10,000-requests-a-day limit. A full page has more
 * only when the `next` link says so (or, without `_links`, by its length).
 */
function upstreamHasMore(res: Envelope, upstreamRows: number, size: number): boolean {
  if (upstreamRows < size) return false
  if (Array.isArray(res._links)) return res._links.some((l) => l?.rel === 'next')
  return true
}

/** `LastModifiedFromDate` + `LastModifiedToDate` for `updatedAfter` (see the header). */
function lastModifiedRange(updatedAfter: Date | undefined): Record<string, string> {
  if (!updatedAfter) return {}
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
  return {
    LastModifiedFromDate: updatedAfter.toISOString().slice(0, 10),
    LastModifiedToDate: tomorrow.toISOString().slice(0, 10),
  }
}

/**
 * Every documented id is an integer ("Invoice Id (Transaction Id)", "Journal
 * Id", "The id/key of the account", ...). Anything else cannot name a record,
 * so it is answered 404 without spending a request.
 */
function integerId(id: string, what: string): string {
  if (!/^\d+$/.test(id))
    throw notFound(`Saasu ${what} ids are integers; ${JSON.stringify(id)} is not one`)
  return id
}

export class SaasuAdapter implements AccountingAdapter {
  // Connect Link support — per-customer form (see ./auth.ts).

  credentialFields = CREDENTIAL_FORM.credentialFields

  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  readonly platform = 'saasu'
  readonly version = '0.2.0'
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  private fileUid: string

  constructor(config: SaasuAdapterConfig) {
    this.fileUid = config.fileUid
  }

  getAuthUrl(_state: string): string {
    return buildAuthUrl(_state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    const creds = await exchangeCode(code)
    return { ...creds, extra: { fileUid: this.fileUid } }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshCredentials(credentials)
  }

  private client(credentials: Credentials): SaasuClient {
    return new SaasuClient(credentials, this.fileUid)
  }

  /**
   * One upstream page of a documented list: `Page`/`PageSize`, the given
   * filters, and the documented `{ <key>[], _links[] }` envelope. Reports the
   * upstream page's `hasMore` and the size asked for.
   */
  private async listPage<T>(
    credentials: Credentials,
    path: string,
    key: string,
    params: QueryParams,
    filters: Record<string, unknown>,
  ): Promise<T[]> {
    const size = pageSize(params)
    const res = await this.client(credentials).get<Envelope | undefined>(path, {
      Page: pageNumber(params),
      PageSize: size,
      ...filters,
    })
    const rows = res && typeof res === 'object' ? res[key] : undefined
    if (!res || !Array.isArray(rows)) {
      throw badGateway(`Saasu GET ${path} did not return the documented { ${key}[] } envelope`)
    }
    reportUpstreamPage(params, { hasMore: upstreamHasMore(res, rows.length, size), pageSize: size })
    return rows as T[]
  }

  /** A page of GET Invoices on one side (or both), filtered to the kind asked for. */
  private async listInvoicePage(
    credentials: Credentials,
    params: QueryParams,
    transactionType: string | undefined,
    keep: (row: SaasuInvoiceSummary) => boolean,
  ): Promise<SaasuInvoiceSummary[]> {
    const rows = await this.listPage<SaasuInvoiceSummary>(
      credentials,
      'Invoices',
      'Invoices',
      params,
      {
        ...(transactionType ? { TransactionType: transactionType } : {}),
        ...lastModifiedRange(params.updatedAfter),
      },
    )
    return rows.filter(keep)
  }

  /**
   * GET Invoice/{id}, the `InvoiceTransactionDetail` at the top level, answered
   * 404 when it is not the kind of document asked for.
   */
  private async getInvoiceDetail(
    credentials: Credentials,
    id: string,
    kind: string,
    keep: (row: SaasuInvoiceSummary) => boolean,
  ): Promise<SaasuInvoiceDetail> {
    const res = await this.client(credentials).get<SaasuInvoiceDetail | undefined>(
      `Invoice/${integerId(id, 'invoice')}`,
    )
    if (!res || typeof res !== 'object' || res.TransactionId == null) {
      throw badGateway('Saasu GET Invoice/{id} did not return an InvoiceTransactionDetail')
    }
    if (!keep(res)) throw notFound(`Saasu transaction ${id} is not ${kind}`)
    return res
  }

  /** A single GET whose documented body is the record itself, keyed by `idField`. */
  private async getRecord<T extends object>(
    credentials: Credentials,
    path: string,
    idField: string,
  ): Promise<T> {
    const res = await this.client(credentials).get<T | undefined>(path)
    if (!res || typeof res !== 'object' || (res as Record<string, unknown>)[idField] == null) {
      throw badGateway(
        `Saasu GET ${path.replace(/\/\d+$/, '/{id}')} did not return the documented record`,
      )
    }
    return res
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = this.client(credentials)
    const res = await client.get<SaasuFileIdentity | undefined>('FileIdentity')
    if (!res || typeof res !== 'object' || Array.isArray(res)) {
      throw badGateway('Saasu GET FileIdentity did not return a FileIdentityDetail')
    }
    return transformOrganization(res, client.fileId)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const rows = await this.listInvoicePage(
      credentials,
      params,
      TRANSACTION_TYPE.SALE,
      isSaleInvoice,
    )
    return rows.map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    return transformInvoice(
      await this.getInvoiceDetail(credentials, id, 'a sale tax invoice', isSaleInvoice),
    )
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const rows = await this.listInvoicePage(
      credentials,
      params,
      TRANSACTION_TYPE.PURCHASE,
      isPurchaseBill,
    )
    return rows.map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    return transformBill(
      await this.getInvoiceDetail(credentials, id, 'a purchase tax or RCT invoice', isPurchaseBill),
    )
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const rows = await this.listInvoicePage(
      credentials,
      params,
      TRANSACTION_TYPE.PURCHASE,
      isExpense,
    )
    return rows.map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    return transformExpense(
      await this.getInvoiceDetail(credentials, id, 'a Money Out (Expense) purchase', isExpense),
    )
  }

  // --- Credit Memos ---
  //
  // A customer credit note is a sale whose InvoiceType is "Adjustment Note"
  // (see ./transform/creditmemo.ts for the doc citations).

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const rows = await this.listInvoicePage(
      credentials,
      params,
      TRANSACTION_TYPE.SALE,
      isSaleAdjustmentNote,
    )
    return rows.map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    return transformCreditMemo(
      await this.getInvoiceDetail(
        credentials,
        id,
        'a sale adjustment note (credit note)',
        isSaleAdjustmentNote,
      ),
    )
  }

  // --- Orders ---
  //
  // Sale and purchase orders are invoices of InvoiceType "Sale Order" /
  // "Purchase Order" (see ./transform/order.ts). The canonical Order covers
  // both, so its list reads both sides.

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const rows = await this.listInvoicePage(
      credentials,
      params,
      undefined,
      (r) => isSaleOrder(r) || isPurchaseOrder(r),
    )
    return rows.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    return transformOrder(
      await this.getInvoiceDetail(
        credentials,
        id,
        'a sale or purchase order',
        (r) => isSaleOrder(r) || isPurchaseOrder(r),
      ),
    )
  }

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const rows = await this.listInvoicePage(credentials, params, TRANSACTION_TYPE.SALE, isSaleOrder)
    return rows.map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    return transformSalesOrder(
      await this.getInvoiceDetail(credentials, id, 'a sale order', isSaleOrder),
    )
  }

  async listPurchaseOrders(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PurchaseOrder[]> {
    const rows = await this.listInvoicePage(
      credentials,
      params,
      TRANSACTION_TYPE.PURCHASE,
      isPurchaseOrder,
    )
    return rows.map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    return transformPurchaseOrder(
      await this.getInvoiceDetail(credentials, id, 'a purchase order', isPurchaseOrder),
    )
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const rows = await this.listPage<SaasuContact>(
      credentials,
      'Contacts',
      'Contacts',
      params,
      lastModifiedRange(params.updatedAfter),
    )
    return rows.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    return transformContact(
      await this.getRecord<SaasuContact>(credentials, `Contact/${integerId(id, 'contact')}`, 'Id'),
    )
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const rows = await this.listPage<SaasuAccount>(credentials, 'Accounts', 'Accounts', params, {})
    return rows.map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    return transformAccount(
      await this.getRecord<SaasuAccount>(credentials, `Account/${integerId(id, 'account')}`, 'Id'),
    )
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const rows = await this.listPage<SaasuJournal>(
      credentials,
      'Journals',
      'Journals',
      params,
      lastModifiedRange(params.updatedAfter),
    )
    return rows.map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    return transformJournal(
      await this.getRecord<SaasuJournal>(
        credentials,
        `Journal/${integerId(id, 'journal')}`,
        'TransactionId',
      ),
    )
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const rows = await this.listPage<SaasuTaxCode>(credentials, 'TaxCodes', 'TaxCodes', params, {})
    return rows.map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    return transformTaxRate(
      await this.getRecord<SaasuTaxCode>(credentials, `TaxCode/${integerId(id, 'tax code')}`, 'Id'),
    )
  }

  // --- Transactions ---

  async listTransactions(_credentials: Credentials, _params: QueryParams): Promise<Transaction[]> {
    throw notSupported(TRANSACTIONS_REFUSAL)
  }

  async getTransaction(_credentials: Credentials, _id: string): Promise<Transaction> {
    throw notSupported(TRANSACTIONS_REFUSAL)
  }
}

const TRANSACTIONS_REFUSAL =
  'Saasu documents no transaction resource: the API help (https://api.saasu.com/Help) lists ' +
  'no Transactions endpoint, and its invoices, payments and journals are served as their own ' +
  'resources.'
