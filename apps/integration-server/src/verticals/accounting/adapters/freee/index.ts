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
import type { Organization } from '../../schema/organization'

import { pageLocally } from '@opensteward/shared'
import { buildAuthUrl, exchangeCode, refreshAccessToken } from './auth'
import { FreeeClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type FreeeInvoice } from './transform/invoice'
import { transformBill, type FreeeBill } from './transform/bill'
import { transformContact, type FreeePartner } from './transform/contact'
import { transformAccount, type FreeeAccountItem } from './transform/account'
import { transformJournal, type FreeeDeal } from './transform/journal'
import { transformTransaction, type FreeeBankTransaction } from './transform/transaction'
import { transformTaxRate, type FreeeTaxRate } from './transform/taxrate'
import { transformExpense, type FreeeExpenseApplication } from './transform/expense'
import { transformOrder, type FreeeQuote } from './transform/order'
import { transformSalesOrder, type FreeeQuoteSO } from './transform/salesorder'
import { transformOrganization, type FreeeCompany } from './transform/organization'

const CREDIT_MEMO_REFUSAL =
  'freee publishes no credit-note endpoint: neither the accounting API (v2020_06_15) nor the freee Invoice API ' +
  'spec at https://github.com/freee/freee-api-schema documents a credit invoice or credit note.'

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

interface FreeeAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
  companyId: number
}

export class FreeeAdapter implements AccountingAdapter {
  readonly platform = 'freee'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]
  private companyId: number

  constructor(config: FreeeAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes
    this.companyId = config.companyId
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

  private paginationParams(params: QueryParams): Record<string, unknown> {
    return {
      limit: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      offset: ((params.page ?? 1) - 1) * Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      company_id: this.companyId,
    }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new FreeeClient(credentials)
    const res = await client.get<{ company: FreeeCompany }>(`companies/${this.companyId}`)
    return transformOrganization(res.company)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new FreeeClient(credentials)
    const res = await client.get<{ invoices: FreeeInvoice[] }>(
      'invoices',
      this.paginationParams(params),
    )
    return (res.invoices ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new FreeeClient(credentials)
    const res = await client.get<{ invoice: FreeeInvoice }>(`invoices/${id}`, {
      company_id: this.companyId,
    })
    return transformInvoice(res.invoice)
  }

  // --- Bills (Expense Reports / purchase invoices) ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new FreeeClient(credentials)
    const res = await client.get<{ expense_applications: FreeeBill[] }>(
      'expense_applications',
      this.paginationParams(params),
    )
    return (res.expense_applications ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new FreeeClient(credentials)
    const res = await client.get<{ expense_application: FreeeBill }>(`expense_applications/${id}`, {
      company_id: this.companyId,
    })
    return transformBill(res.expense_application)
  }

  // --- Contacts (Partners) ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new FreeeClient(credentials)
    const res = await client.get<{ partners: FreeePartner[] }>(
      'partners',
      this.paginationParams(params),
    )
    return (res.partners ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new FreeeClient(credentials)
    const res = await client.get<{ partner: FreeePartner }>(`partners/${id}`, {
      company_id: this.companyId,
    })
    return transformContact(res.partner)
  }

  // --- Accounts ---

  // GET /api/1/account_items takes no limit or offset: its query parameters
  // are company_id (required) and the filters base_date, start_update_date,
  // end_update_date and keyword, and it answers with every account item in one
  // { account_items } response. Page it here.
  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new FreeeClient(credentials)
    const res = await client.get<{ account_items: FreeeAccountItem[] }>('account_items', {
      company_id: this.companyId,
    })
    return pageLocally((res.account_items ?? []).map(transformAccount), params)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new FreeeClient(credentials)
    const res = await client.get<{ account_item: FreeeAccountItem }>(`account_items/${id}`, {
      company_id: this.companyId,
    })
    return transformAccount(res.account_item)
  }

  // --- Journals (Deals) ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new FreeeClient(credentials)
    const res = await client.get<{ deals: FreeeDeal[] }>('deals', this.paginationParams(params))
    return (res.deals ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new FreeeClient(credentials)
    const res = await client.get<{ deal: FreeeDeal }>(`deals/${id}`, {
      company_id: this.companyId,
    })
    return transformJournal(res.deal)
  }

  // --- Transactions (Bank Transactions) ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new FreeeClient(credentials)
    const res = await client.get<{ bank_transactions: FreeeBankTransaction[] }>(
      'bank_transactions',
      this.paginationParams(params),
    )
    return (res.bank_transactions ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new FreeeClient(credentials)
    const res = await client.get<{ bank_transaction: FreeeBankTransaction }>(
      `bank_transactions/${id}`,
      { company_id: this.companyId },
    )
    return transformTransaction(res.bank_transaction)
  }

  // --- Tax Rates ---

  // GET /api/1/taxes/companies/{company_id} takes no limit or offset: its only
  // query parameters are the filters display_category and available, and it
  // answers with every tax category in one { taxes } response. Page it here.
  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new FreeeClient(credentials)
    const res = await client.get<{ taxes: FreeeTaxRate[] }>(`taxes/companies/${this.companyId}`)
    return pageLocally((res.taxes ?? []).map(transformTaxRate), params)
  }

  // --- Expenses (Expense Applications) ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new FreeeClient(credentials)
    const res = await client.get<{ expense_applications: FreeeExpenseApplication[] }>(
      'expense_applications',
      this.paginationParams(params),
    )
    return (res.expense_applications ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new FreeeClient(credentials)
    const res = await client.get<{ expense_application: FreeeExpenseApplication }>(
      `expense_applications/${id}`,
      { company_id: this.companyId },
    )
    return transformExpense(res.expense_application)
  }

  // --- Credit Memos ---
  //
  // Refused before any request. The previous methods called
  // `GET credit_invoices` and `GET credit_invoices/{id}`, which freee does
  // not publish. The freee accounting API spec (v2020_06_15,
  // https://raw.githubusercontent.com/freee/freee-api-schema/master/v2020_06_15/open-api-3/api-schema.json,
  // fetched 2026-09-29) has no credit_invoice path or schema anywhere, and
  // the freee Invoice (freee請求書) API spec
  // (https://raw.githubusercontent.com/freee/freee-api-schema/master/iv/open-api-3/api-schema.yml)
  // has invoices, quotations, delivery slips, receipts, payment notices and
  // purchase orders, each with cancel/uncancel, but no credit note either.

  async listCreditMemos(_credentials: Credentials, _params: QueryParams): Promise<CreditMemo[]> {
    throw notSupported(CREDIT_MEMO_REFUSAL)
  }

  async getCreditMemo(_credentials: Credentials, _id: string): Promise<CreditMemo> {
    throw notSupported(CREDIT_MEMO_REFUSAL)
  }

  // --- Orders (Quotes) ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new FreeeClient(credentials)
    const res = await client.get<{ quotations: FreeeQuote[] }>(
      'quotations',
      this.paginationParams(params),
    )
    return (res.quotations ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new FreeeClient(credentials)
    const res = await client.get<{ quotation: FreeeQuote }>(`quotations/${id}`, {
      company_id: this.companyId,
    })
    return transformOrder(res.quotation)
  }

  // --- Sales Orders (Quotations) ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new FreeeClient(credentials)
    const res = await client.get<{ quotations: FreeeQuoteSO[] }>(
      'quotations',
      this.paginationParams(params),
    )
    return (res.quotations ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new FreeeClient(credentials)
    const res = await client.get<{ quotation: FreeeQuoteSO }>(`quotations/${id}`, {
      company_id: this.companyId,
    })
    return transformSalesOrder(res.quotation)
  }
}
