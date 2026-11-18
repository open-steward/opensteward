import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Journal } from '../../schema/journal'
import type { Transaction } from '../../schema/transaction'
import type { TaxRate } from '../../schema/taxrate'
import type { CreditMemo } from '../../schema/creditmemo'
import type { Order } from '../../schema/order'
import type { SalesOrder } from '../../schema/salesorder'
import type { Organization } from '../../schema/organization'

import { buildAuthUrl, exchangeCode, refreshAccessToken } from './auth'
import { MoneyForwardClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type MoneyForwardBilling } from './transform/invoice'
import { transformContact, type MoneyForwardPartner } from './transform/contact'
import { transformAccount, type MoneyForwardAccountItem } from './transform/account'
import { transformJournal, type MoneyForwardJournalEntry } from './transform/journal'
import { transformTransaction, type MoneyForwardBankAccountTransaction } from './transform/transaction'
import {
  transformTaxRate,
  MONEYFORWARD_HARDCODED_TAX_RATES,
} from './transform/taxrate'
import { transformCreditMemo, type MoneyForwardCreditNote } from './transform/creditmemo'
import { transformOrder, type MoneyForwardQuote } from './transform/order'
import { transformSalesOrder, type MoneyForwardQuoteSO } from './transform/salesorder'
import { transformOrganization, type MoneyForwardMe } from './transform/organization'

interface MoneyForwardAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}

export class MoneyForwardAdapter implements AccountingAdapter {
  readonly platform = 'moneyforward'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: MoneyForwardAdapterConfig) {
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

  private paginationParams(params: QueryParams): Record<string, unknown> {
    return {
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      page: params.page ?? 1,
    }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new MoneyForwardClient(credentials)
    const res = await client.get<MoneyForwardMe>('me')
    return transformOrganization(res)
  }

  // --- Invoices (Billings) ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new MoneyForwardClient(credentials)
    const res = await client.get<{ data: MoneyForwardBilling[] }>(
      'billings',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new MoneyForwardClient(credentials)
    const res = await client.get<{ data: MoneyForwardBilling }>(`billings/${id}`)
    return transformInvoice(res.data)
  }

  // --- Contacts (Partners) ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new MoneyForwardClient(credentials)
    const res = await client.get<{ data: MoneyForwardPartner[] }>(
      'partners',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new MoneyForwardClient(credentials)
    const res = await client.get<{ data: MoneyForwardPartner }>(`partners/${id}`)
    return transformContact(res.data)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new MoneyForwardClient(credentials)
    const res = await client.get<{ data: MoneyForwardAccountItem[] }>(
      'account_items',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new MoneyForwardClient(credentials)
    const res = await client.get<{ data: MoneyForwardAccountItem }>(`account_items/${id}`)
    return transformAccount(res.data)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new MoneyForwardClient(credentials)
    const res = await client.get<{ data: MoneyForwardJournalEntry[] }>(
      'journal_entries',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new MoneyForwardClient(credentials)
    const res = await client.get<{ data: MoneyForwardJournalEntry }>(`journal_entries/${id}`)
    return transformJournal(res.data)
  }

  // --- Transactions (Bank Account Transactions) ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new MoneyForwardClient(credentials)
    const res = await client.get<{ data: MoneyForwardBankAccountTransaction[] }>(
      'bank_account_transactions',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new MoneyForwardClient(credentials)
    const res = await client.get<{ data: MoneyForwardBankAccountTransaction }>(
      `bank_account_transactions/${id}`,
    )
    return transformTransaction(res.data)
  }

  // --- Tax Rates (Hardcoded Japanese rates) ---

  async listTaxRates(_credentials: Credentials, _params: QueryParams): Promise<TaxRate[]> {
    return MONEYFORWARD_HARDCODED_TAX_RATES.map(transformTaxRate)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new MoneyForwardClient(credentials)
    const res = await client.get<{ data: MoneyForwardCreditNote[] }>(
      'credit_notes',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new MoneyForwardClient(credentials)
    const res = await client.get<{ data: MoneyForwardCreditNote }>(`credit_notes/${id}`)
    return transformCreditMemo(res.data)
  }

  // --- Orders (Quotes) ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new MoneyForwardClient(credentials)
    const res = await client.get<{ data: MoneyForwardQuote[] }>(
      'quotes',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new MoneyForwardClient(credentials)
    const res = await client.get<{ data: MoneyForwardQuote }>(`quotes/${id}`)
    return transformOrder(res.data)
  }

  // --- Sales Orders (Quotes) ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new MoneyForwardClient(credentials)
    const res = await client.get<{ data: MoneyForwardQuoteSO[] }>(
      'quotes',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new MoneyForwardClient(credentials)
    const res = await client.get<{ data: MoneyForwardQuoteSO }>(`quotes/${id}`)
    return transformSalesOrder(res.data)
  }
}
