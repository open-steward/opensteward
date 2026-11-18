import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Journal } from '../../schema/journal'
import type { Organization } from '../../schema/organization'
import type { Order } from '../../schema/order'
import type { SalesOrder } from '../../schema/salesorder'
import type { Transaction } from '../../schema/transaction'
import type { CreditMemo } from '../../schema/creditmemo'

import { reportUpstreamPage } from '@opensteward/shared'
import { buildAuthUrl, exchangeCode, refreshAccessToken } from './auth'
import { FortnoxClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, untransformInvoice, type FortnoxInvoice } from './transform/invoice'
import { transformBill, type FortnoxSupplierInvoice } from './transform/bill'
import { transformCustomer, transformSupplier, type FortnoxCustomer, type FortnoxSupplier } from './transform/contact'
import { transformAccount, type FortnoxAccount } from './transform/account'
import { transformJournal, untransformJournal, type FortnoxVoucher } from './transform/journal'
import { transformOrganization, type FortnoxCompanyInfo } from './transform/organization'
import { transformOrder, type FortnoxOrder } from './transform/order'
import { transformSalesOrder, type FortnoxSalesOrder } from './transform/salesorder'
import { transformTransaction, type FortnoxPayment } from './transform/transaction'
import { transformCreditMemo, type FortnoxCreditInvoice } from './transform/creditmemo'

interface FortnoxAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}

interface MetaInfo {
  '@TotalResources': number
  '@CurrentPage': number
  '@TotalPages': number
}

/** Fortnox pages are 1-based. A missing, zero, negative or non-numeric page is
 *  the first page. */
function fortnoxPage(page: number | undefined): number {
  return typeof page === 'number' && Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1
}

/** An invoice row whose own `Credit` flag says it is not a credit invoice. The
 *  flag is a string ("false") on the wire; a boolean is read the same way. */
function isMarkedDebit(row: FortnoxCreditInvoice): boolean {
  const flag = row['Credit']
  return flag === false || (typeof flag === 'string' && flag.toLowerCase() === 'false')
}

export class FortnoxAdapter implements AccountingAdapter {
  readonly platform = 'fortnox'
  readonly version = '0.1.0'
  /** `limit` is clamped to Fortnox's documented 500, so the sync worker must
   *  not read a clamped 500 as a short last page. */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: FortnoxAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, (overrideScopes ?? this.scopes), state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return exchangeCode(code, this.clientId, this.clientSecret, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) throw new Error('No refresh token available')
    return refreshAccessToken(credentials.refreshToken, this.clientId, this.clientSecret)
  }

  /**
   * Hand Fortnox's own pagination back to the router.
   *
   * Every list response carries `MetaInformation`, and every list method
   * already destructured it — then returned only the rows, so a caller could
   * not tell 100 of 100 from 100 of 1,339. Reported rather than derived from
   * `rows.length === limit`, which is a guess that misfires on exact multiples.
   *
   * Silent when the platform omitted the block: an unknown total stays unknown.
   */
  private reportPage(params: QueryParams, meta: MetaInfo | undefined): void {
    if (!meta) return
    reportUpstreamPage(params, {
      totalCount: meta['@TotalResources'],
      totalPages: meta['@TotalPages'],
      currentPage: meta['@CurrentPage'],
    })
  }

  private paginationParams(params: QueryParams): Record<string, unknown> {
    return {
      limit: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      page: fortnoxPage(params.page),
      ...(params.updatedAfter && {
        lastmodified: params.updatedAfter.toISOString().split('T')[0],
      }),
    }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new FortnoxClient(credentials)
    const res = await client.get<{ Company: FortnoxCompanyInfo }>('companyinformation')
    return transformOrganization(res.Company)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new FortnoxClient(credentials)
    const res = await client.get<{ Invoices: FortnoxInvoice[]; MetaInformation: MetaInfo }>(
      'invoices',
      this.paginationParams(params),
    )
    this.reportPage(params, res.MetaInformation)
    return (res.Invoices ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new FortnoxClient(credentials)
    const res = await client.get<{ Invoice: FortnoxInvoice }>(`invoices/${id}`)
    return transformInvoice(res.Invoice)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new FortnoxClient(credentials)
    const res = await client.post<{ Invoice: FortnoxInvoice }>('invoices', {
      Invoice: untransformInvoice(data),
    })
    return transformInvoice(res.Invoice)
  }

  async updateInvoice(
    credentials: Credentials,
    id: string,
    data: Partial<Invoice>,
  ): Promise<Invoice> {
    const client = new FortnoxClient(credentials)
    const res = await client.put<{ Invoice: FortnoxInvoice }>(`invoices/${id}`, {
      Invoice: untransformInvoice(data),
    })
    return transformInvoice(res.Invoice)
  }

  // --- Bills (Supplier Invoices) ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new FortnoxClient(credentials)
    const res = await client.get<{
      SupplierInvoices: FortnoxSupplierInvoice[]
      MetaInformation: MetaInfo
    }>('supplierinvoices', this.paginationParams(params))
    this.reportPage(params, res.MetaInformation)
    return (res.SupplierInvoices ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new FortnoxClient(credentials)
    const res = await client.get<{ SupplierInvoice: FortnoxSupplierInvoice }>(
      `supplierinvoices/${id}`,
    )
    return transformBill(res.SupplierInvoice)
  }

  // --- Contacts (Customers + Suppliers) ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new FortnoxClient(credentials)
    const [custRes, suppRes] = await Promise.all([
      client.get<{ Customers: FortnoxCustomer[] }>('customers', this.paginationParams(params)),
      client.get<{ Suppliers: FortnoxSupplier[] }>('suppliers', this.paginationParams(params)),
    ])
    const customers = (custRes.Customers ?? []).map(transformCustomer)
    const suppliers = (suppRes.Suppliers ?? []).map(transformSupplier)
    return [...customers, ...suppliers]
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new FortnoxClient(credentials)
    if (id.startsWith('cust_')) {
      const num = id.slice(5)
      const res = await client.get<{ Customer: FortnoxCustomer }>(`customers/${num}`)
      return transformCustomer(res.Customer)
    }
    if (id.startsWith('supp_')) {
      const num = id.slice(5)
      const res = await client.get<{ Supplier: FortnoxSupplier }>(`suppliers/${num}`)
      return transformSupplier(res.Supplier)
    }
    throw new Error(`Invalid contact id format: ${id}. Expected cust_<n> or supp_<n>`)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new FortnoxClient(credentials)
    if (data.isSupplier && !data.isCustomer) {
      const res = await client.post<{ Supplier: FortnoxSupplier }>('suppliers', {
        Supplier: {
          Name: data.name,
          OrganisationNumber: data.identification,
          Email: data.emails?.[0]?.email,
          Currency: data.currency,
        },
      })
      return transformSupplier(res.Supplier)
    }
    const res = await client.post<{ Customer: FortnoxCustomer }>('customers', {
      Customer: {
        Name: data.name,
        OrganisationNumber: data.identification,
        Email: data.emails?.[0]?.email,
        Currency: data.currency,
        Address1: data.billingAddress?.address1,
        City: data.billingAddress?.city,
        ZipCode: data.billingAddress?.postalCode,
        CountryCode: data.billingAddress?.country,
      },
    })
    return transformCustomer(res.Customer)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const client = new FortnoxClient(credentials)
    if (id.startsWith('supp_')) {
      const num = id.slice(5)
      const res = await client.put<{ Supplier: FortnoxSupplier }>(`suppliers/${num}`, {
        Supplier: { Name: data.name, Email: data.emails?.[0]?.email },
      })
      return transformSupplier(res.Supplier)
    }
    const num = id.slice(5)
    const res = await client.put<{ Customer: FortnoxCustomer }>(`customers/${num}`, {
      Customer: {
        Name: data.name,
        Email: data.emails?.[0]?.email,
        Address1: data.billingAddress?.address1,
        City: data.billingAddress?.city,
        ZipCode: data.billingAddress?.postalCode,
        CountryCode: data.billingAddress?.country,
      },
    })
    return transformCustomer(res.Customer)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new FortnoxClient(credentials)
    const res = await client.get<{ Accounts: FortnoxAccount[]; MetaInformation: MetaInfo }>(
      'accounts',
      this.paginationParams(params),
    )
    this.reportPage(params, res.MetaInformation)
    return (res.Accounts ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new FortnoxClient(credentials)
    const res = await client.get<{ Account: FortnoxAccount }>(`accounts/${id}`)
    return transformAccount(res.Account)
  }

  // --- Journals (Vouchers) ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new FortnoxClient(credentials)
    const res = await client.get<{ Vouchers: FortnoxVoucher[]; MetaInformation: MetaInfo }>(
      'vouchers',
      this.paginationParams(params),
    )
    this.reportPage(params, res.MetaInformation)
    return (res.Vouchers ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    // Fortnox vouchers are identified by series + number, e.g. "A1"
    const series = id.replace(/\d+$/, '')
    const number = id.replace(/^\D+/, '')
    const client = new FortnoxClient(credentials)
    const res = await client.get<{ Voucher: FortnoxVoucher }>(
      `vouchers/${series}/${number}`,
    )
    return transformJournal(res.Voucher)
  }

  async createJournal(credentials: Credentials, data: Partial<Journal>): Promise<Journal> {
    const client = new FortnoxClient(credentials)
    const res = await client.post<{ Voucher: FortnoxVoucher }>('vouchers', {
      Voucher: untransformJournal(data),
    })
    return transformJournal(res.Voucher)
  }

  // --- Orders ---
  //
  // Fortnox models a single order entity at /orders, which the canonical layer
  // splits into `orders` and `salesorders`. Both list methods read the same
  // endpoint through their own transform — the same shape visma and the other
  // ~124 accounting adapters that implement both methods use.

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new FortnoxClient(credentials)
    const res = await client.get<{ Orders: FortnoxOrder[]; MetaInformation: MetaInfo }>(
      'orders',
      this.paginationParams(params),
    )
    this.reportPage(params, res.MetaInformation)
    return (res.Orders ?? []).map(transformOrder)
  }

  // --- Sales orders ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new FortnoxClient(credentials)
    const res = await client.get<{ Orders: FortnoxSalesOrder[]; MetaInformation: MetaInfo }>(
      'orders',
      this.paginationParams(params),
    )
    this.reportPage(params, res.MetaInformation)
    return (res.Orders ?? []).map(transformSalesOrder)
  }

  // --- Purchase orders: NOT IMPLEMENTED, on purpose ---
  //
  // `/3/purchaseorders` does not exist. Fortnox answers a GET to it with:
  //
  //   {"error":1,"message":"No such route.(method: GET, path: 3/purchaseorders)",
  //    "code":2000764}
  //
  // It was implemented anyway on the strength of a documentation summary that
  // listed the path — the exact failure mode transform-conformance.md §7 warns
  // about, where something that was never a real response gets treated as
  // evidence. The cost was a sync job that reported `failed` on every run for a
  // resource that cannot exist, and an MCP `list_purchase_orders` call
  // returning an unexplained 400.
  //
  // Leaving the method off is what makes the sync worker mark the resource
  // `skipped` (it duck-types each method, sync-worker.ts:236) — the same honest
  // state taxrates and expenses carry, for the same reason: Fortnox has no such
  // endpoint. Re-add ONLY against a captured live response proving otherwise.
  //
  // The transform and its tests are kept: they are correct, and cost nothing.

  // --- Transactions (Invoice Payments) ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new FortnoxClient(credentials)
    const res = await client.get<{
      InvoicePayments: FortnoxPayment[]
      MetaInformation: MetaInfo
    }>('invoicepayments', this.paginationParams(params))
    this.reportPage(params, res.MetaInformation)
    return (res.InvoicePayments ?? []).map(transformTransaction)
  }

  // --- Credit memos (credit invoices) ---
  //
  // Fortnox exposes no credit-invoice endpoint: a credit invoice is an
  // /invoices row whose `Credit` property is set. That property is documented
  // as "searchable", and GET /3/invoices takes it as the `credit` query
  // parameter — so Fortnox does the filtering, and credit invoices page exactly
  // like invoices: the caller's `limit` and a 1-based `page`, one request each.
  //
  // The value `true` is not spelled out in Fortnox's docs; it is the reading of
  // a boolean field that single-invoice responses send as "true"/"false". If
  // Fortnox ignored it, every invoice would come back, so a row Fortnox itself
  // marks as not a credit invoice fails the call instead of being returned.
  //
  // Do not filter client-side instead. Recorded list responses carry no
  // `Credit` on their rows (the current spec's list schema declares one), and a
  // filtered page is short whenever it held a debit invoice, which the sync
  // worker reads as the last page.

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new FortnoxClient(credentials)
    const res = await client.get<{
      Invoices: FortnoxCreditInvoice[]
      MetaInformation: MetaInfo
    }>('invoices', { ...this.paginationParams(params), credit: 'true' })
    const rows = res.Invoices ?? []
    const debit = rows.find(isMarkedDebit)
    if (debit) {
      throw new Error(
        `Fortnox ignored credit=true: invoice ${debit.DocumentNumber} is not a credit invoice`,
      )
    }
    this.reportPage(params, res.MetaInformation)
    return rows.map(transformCreditMemo)
  }
}
