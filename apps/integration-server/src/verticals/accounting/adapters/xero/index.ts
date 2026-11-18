import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Organization } from '../../schema/organization'
import type { Bill } from '../../schema/bill'
import type { TaxRate } from '../../schema/taxrate'
import type { CreditMemo } from '../../schema/creditmemo'
import type { Quote } from '../../schema/quote'
import type { PurchaseOrder } from '../../schema/purchaseorder'
import type { Order } from '../../schema/order'
import type { Transaction } from '../../schema/transaction'
import type { Journal } from '../../schema/journal'
import type { Expense } from '../../schema/expense'

import { buildAuthUrl, exchangeCode, refreshAccessToken } from './auth'
import { pageLocally } from '@opensteward/shared'
import { XeroClient } from './client'
import { withResolvedAccountIds } from './account-index'
import { DEFAULT_PAGE_SIZE } from './constants'

import { transformInvoice, untransformInvoice, type XeroInvoice } from './transform/invoice'
import { transformContact, type XeroContact } from './transform/contact'
import { transformAccount, type XeroAccount } from './transform/account'
import { transformOrganization, type XeroOrganisation } from './transform/organization'
import { transformBill, type XeroBill } from './transform/bill'
import { transformTaxRate, type XeroTaxRate } from './transform/taxrate'
import { transformCreditMemo, type XeroCreditNote } from './transform/creditmemo'
import { transformQuote, type XeroQuote } from './transform/quote'
import { transformPurchaseOrder, type XeroPurchaseOrder } from './transform/purchaseorder'
import { transformOrder } from './transform/order'
import { transformTransaction, type XeroBankTransaction } from './transform/transaction'
import { transformExpense } from './transform/expense'
import { transformJournal, type XeroJournal } from './transform/journal'

interface XeroAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}

/**
 * Xero's incremental-sync filter travels as the `If-Modified-Since` request
 * header. It was previously passed inside the axios `params` object as
 * `IFModifiedSince`, which put it on the query string, where Xero ignores it —
 * so `updated_after` was accepted by us and silently discarded upstream.
 * Verified live: a `2099` timestamp returned the same 32 records as a `2000`
 * one.
 *
 * Returns `undefined` when the caller named no timestamp, so no header is sent
 * at all rather than an empty one.
 */
function ifModifiedSince(params: QueryParams): Record<string, string> | undefined {
  const d = params.updatedAfter
  if (!(d instanceof Date) || isNaN(d.getTime())) return undefined
  return { 'If-Modified-Since': d.toISOString() }
}

export class XeroAdapter implements AccountingAdapter {
  readonly platform = 'xero'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: XeroAdapterConfig) {
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
    return refreshAccessToken(
      credentials.refreshToken,
      this.clientId,
      this.clientSecret,
      credentials.tenantId,
    )
  }

  /** Xero tenant id captured at OAuth; matches the `tenantId` on inbound
   *  webhook events for connection routing. */
  externalAccountId(credentials: Credentials): string | undefined {
    return credentials.tenantId || undefined
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new XeroClient(credentials)
    const res = await client.get<{ Organisations: XeroOrganisation[] }>('Organisation')
    return transformOrganization(res.Organisations[0])
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new XeroClient(credentials)
    const page = params.page ?? 1
    const res = await client.get<{ Invoices: XeroInvoice[] }>('Invoices', {
      page,
      pageSize: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 1000),
      // Xero has no separate bills endpoint: ACCREC is a sales invoice, ACCPAY
      // is a supplier bill, and they share /Invoices. Without this filter a
      // live org returned 78 "invoices" that were 32 invoices and 46 bills,
      // while `bills` reported nothing — so anyone summing invoices for revenue
      // was counting payables into it. Filtered upstream rather than after the
      // fetch so a page of 100 is 100 invoices, not 100 mixed rows.
      where: 'Type=="ACCREC"',
    }, ifModifiedSince(params))
    // Belt and braces: the `where` is what makes paging correct, but a platform
    // that ignored it must not have its bills published as invoices.
    return (res.Invoices ?? []).filter((i) => i.Type !== 'ACCPAY').map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new XeroClient(credentials)
    const res = await client.get<{ Invoices: XeroInvoice[] }>(`Invoices/${id}`)
    return transformInvoice(res.Invoices[0])
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new XeroClient(credentials)
    const res = await client.post<{ Invoices: XeroInvoice[] }>('Invoices', {
      Invoices: [untransformInvoice(data)],
    })
    return transformInvoice(res.Invoices[0])
  }

  async updateInvoice(
    credentials: Credentials,
    id: string,
    data: Partial<Invoice>,
  ): Promise<Invoice> {
    const client = new XeroClient(credentials)
    const res = await client.post<{ Invoices: XeroInvoice[] }>(`Invoices/${id}`, {
      Invoices: [untransformInvoice(data)],
    })
    return transformInvoice(res.Invoices[0])
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new XeroClient(credentials)
    const res = await client.get<{ Contacts: XeroContact[] }>('Contacts', {
      page: params.page ?? 1,
      pageSize: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 100),
    }, ifModifiedSince(params))
    return (res.Contacts ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new XeroClient(credentials)
    const res = await client.get<{ Contacts: XeroContact[] }>(`Contacts/${id}`)
    return transformContact(res.Contacts[0])
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new XeroClient(credentials)
    const res = await client.post<{ Contacts: XeroContact[] }>('Contacts', {
      Contacts: [
        {
          Name: data.name,
          FirstName: data.firstName,
          LastName: data.lastName,
          EmailAddress: data.emails?.[0]?.email,
          TaxNumber: data.taxNumber,
          IsCustomer: data.isCustomer,
          IsSupplier: data.isSupplier,
          DefaultCurrency: data.currency,
        },
      ],
    })
    return transformContact(res.Contacts[0])
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const client = new XeroClient(credentials)
    const res = await client.post<{ Contacts: XeroContact[] }>(`Contacts/${id}`, {
      Contacts: [
        {
          Name: data.name,
          FirstName: data.firstName,
          LastName: data.lastName,
          EmailAddress: data.emails?.[0]?.email,
        },
      ],
    })
    return transformContact(res.Contacts[0])
  }

  // --- Accounts ---

  // Xero's /Accounts endpoint takes no paging parameters — it returns the
  // whole chart of accounts in one response ("Retrieves the full chart of
  // accounts": getAccounts in Xero's OpenAPI takes only If-Modified-Since,
  // `where` and `order`). That is why this method used to take `_params` and
  // ignore them, and why `limit=2` came back with ~60 rows under
  // `meta: { limit: 2 }`. "The platform does not paginate" is a reason to
  // paginate here, not a reason to ignore the caller: `pageLocally` slices
  // the one response so `page`/`limit` mean the same thing on this resource
  // as on every other one, and reports the total, an exact `hasMore` and
  // `pagedLocally` so neither the router nor the sync worker has to guess.
  //
  // `updated_after` goes upstream as the If-Modified-Since header getAccounts
  // documents ("Only accounts created or modified since this timestamp will
  // be returned"). Without it the whole chart came back and pageLocally
  // reported its size as the total of a filtered query; with it, the rows
  // paged here are exactly the rows that match.
  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new XeroClient(credentials)
    const res = await client.get<{ Accounts: XeroAccount[] }>(
      'Accounts',
      undefined,
      ifModifiedSince(params),
    )
    return pageLocally((res.Accounts ?? []).map(transformAccount), params)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new XeroClient(credentials)
    const res = await client.get<{ Accounts: XeroAccount[] }>(`Accounts/${id}`)
    return transformAccount(res.Accounts[0])
  }

  // --- Bills (ACCPAY invoices) ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new XeroClient(credentials)
    const res = await client.get<{ Invoices: XeroBill[] }>('Invoices', {
      page: params.page ?? 1,
      pageSize: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 1000),
      where: 'Type=="ACCPAY"',
    }, ifModifiedSince(params))
    return (res.Invoices ?? [])
      .filter((i) => (i as { Type?: string }).Type !== 'ACCREC')
      .map(transformBill)
  }

  // --- Tax rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    // Not paged by Xero — the endpoint returns the org's full rate table
    // (getTaxRates takes only `where` and `order`, and TaxRates is not on
    // Xero's list of paged endpoints). Returned whole, the router truncated
    // every page to page 1's rows, so rates past the first page were
    // unreachable; sliced here, each is served once with an exact end.
    //
    // `updated_after` cannot narrow it. getTaxRates documents no
    // If-Modified-Since and the TaxRate elements include no UpdatedDateUTC, so
    // there is nothing to filter on, upstream or here. Every rate is served:
    // too many rows is the safe direction for an incremental reader, which
    // misses nothing modified since its timestamp.
    const client = new XeroClient(credentials)
    const res = await client.get<{ TaxRates: XeroTaxRate[] }>('TaxRates')
    return pageLocally((res.TaxRates ?? []).map(transformTaxRate), params)
  }

  // --- Credit memos (credit notes) ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new XeroClient(credentials)
    const res = await client.get<{ CreditNotes: XeroCreditNote[] }>('CreditNotes', {
      page: params.page ?? 1,
    }, ifModifiedSince(params))
    return (res.CreditNotes ?? []).map(transformCreditMemo)
  }

  // --- Quotes ---

  async listQuotes(credentials: Credentials, params: QueryParams): Promise<Quote[]> {
    const client = new XeroClient(credentials)
    const res = await client.get<{ Quotes: XeroQuote[] }>('Quotes', {
      page: params.page ?? 1,
    }, ifModifiedSince(params))
    return (res.Quotes ?? []).map(transformQuote)
  }

  async getQuote(credentials: Credentials, id: string): Promise<Quote> {
    const client = new XeroClient(credentials)
    const res = await client.get<{ Quotes: XeroQuote[] }>(`Quotes/${id}`)
    const quote = (res.Quotes ?? [])[0]
    if (!quote) throw new Error(`Xero quote ${id} not found`)
    return transformQuote(quote)
  }

  // --- Purchase orders ---

  async listPurchaseOrders(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PurchaseOrder[]> {
    const client = new XeroClient(credentials)
    const res = await client.get<{ PurchaseOrders: XeroPurchaseOrder[] }>('PurchaseOrders', {
      page: params.page ?? 1,
    }, ifModifiedSince(params))
    return withResolvedAccountIds(
      credentials,
      (res.PurchaseOrders ?? []).map(transformPurchaseOrder),
    )
  }

  // --- Orders (union view across order-like documents) ---
  //
  // Xero has no sales-order entity and no order-union endpoint of its own:
  // PurchaseOrders is the only order-like document it exposes, so `orders`
  // reads the exact same endpoint `purchaseorders` does and returns the same
  // records, tagged `type: 'PURCHASE'`. Quotes (sales quotes) are a different
  // lifecycle and are not read here — they have their own canonical
  // resource, served by listQuotes/getQuote above.

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new XeroClient(credentials)
    const res = await client.get<{ PurchaseOrders: XeroPurchaseOrder[] }>('PurchaseOrders', {
      page: params.page ?? 1,
    }, ifModifiedSince(params))
    return withResolvedAccountIds(
      credentials,
      (res.PurchaseOrders ?? []).map(transformOrder),
    )
  }

  // --- Transactions (bank transactions) ---
  //
  // Needs `accounting.banktransactions.read`; a grant without it 401s here.

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new XeroClient(credentials)
    const res = await client.get<{ BankTransactions: XeroBankTransaction[] }>('BankTransactions', {
      page: params.page ?? 1,
    }, ifModifiedSince(params))
    return (res.BankTransactions ?? []).map(transformTransaction)
  }

  // --- Journals (manual journals) ---
  //
  // Needs `accounting.manualjournals.read`; a grant without it 401s here.

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new XeroClient(credentials)
    const res = await client.get<{ ManualJournals: XeroJournal[] }>('ManualJournals', {
      page: params.page ?? 1,
    }, ifModifiedSince(params))
    return (res.ManualJournals ?? []).map(transformJournal)
  }

  // --- Expenses (spend-money bank transactions) ---
  //
  // Not `ExpenseClaims`. That endpoint needs `accounting.transactions`, which a
  // Xero app created on or after 2026-03-02 cannot request at all — probed
  // live, Xero rejects the authorize request outright, so wiring it would have
  // 401'd on every sync. `BankTransactions` needs only
  // `accounting.banktransactions.read`, which read-only links already carry.
  //
  // Filtered upstream to the SPEND family, the same way `listInvoices` and
  // `listBills` split one Invoices endpoint on `Type`. `startsWith` rather than
  // equality because Xero also emits SPEND-OVERPAYMENT and SPEND-PREPAYMENT,
  // which are money out too — an `=="SPEND"` filter would silently drop them.
  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new XeroClient(credentials)
    const res = await client.get<{ BankTransactions: XeroBankTransaction[] }>('BankTransactions', {
      page: params.page ?? 1,
      where: 'Type.StartsWith("SPEND")',
    }, ifModifiedSince(params))
    // Filtered again in-process: `where` is Xero's own expression language and
    // an org that ignores or mis-parses it must not turn money-in into an
    // expense. Same belt-and-braces as listInvoices' ACCPAY exclusion.
    return (res.BankTransactions ?? [])
      .filter((t) => String(t.Type).startsWith('SPEND'))
      .map(transformExpense)
  }
}
