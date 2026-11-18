import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Journal } from '../../schema/journal'
import type { Organization } from '../../schema/organization'
import type { Transaction } from '../../schema/transaction'
import type { TaxRate } from '../../schema/taxrate'
import type { Expense } from '../../schema/expense'
import type { CreditMemo } from '../../schema/creditmemo'
import type { Order } from '../../schema/order'
import type { SalesOrder } from '../../schema/salesorder'
import type { PurchaseOrder } from '../../schema/purchaseorder'

import { buildAuthUrl, exchangeCode, refreshAccessToken } from './auth'
import { SageBusinessCloudClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type SageInvoice } from './transform/invoice'
import { transformBill, type SageBill } from './transform/bill'
import { transformContact, type SageContact } from './transform/contact'
import { transformAccount, type SageAccount } from './transform/account'
import { transformJournal, type SageJournal } from './transform/journal'
import { transformOrganization, type SageOrganization } from './transform/organization'
import { transformTransaction, type SageTransaction } from './transform/transaction'
import { transformTaxRate, type SageTaxRate } from './transform/taxrate'

interface SageBusinessCloudAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}

interface SagePagedResponse<T> {
  $items?: T[]
  items?: T[]
}

export class SageBusinessCloudAdapter implements AccountingAdapter {
  readonly platform = 'sagebusinesscloud'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: SageBusinessCloudAdapterConfig) {
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
      $page: params.page ?? 1,
      $page_size: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      ...(params.updatedAfter && { $updated_or_created_since: params.updatedAfter.toISOString() }),
    }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new SageBusinessCloudClient(credentials)
    const res = await client.get<SageOrganization>('business')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new SageBusinessCloudClient(credentials)
    const res = await client.get<SagePagedResponse<SageInvoice>>('sales_invoices', this.paginationParams(params))
    return (res.$items ?? res.items ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new SageBusinessCloudClient(credentials)
    const res = await client.get<SageInvoice>(`sales_invoices/${id}`)
    return transformInvoice(res)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new SageBusinessCloudClient(credentials)
    const res = await client.get<SagePagedResponse<SageBill>>('purchase_invoices', this.paginationParams(params))
    return (res.$items ?? res.items ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new SageBusinessCloudClient(credentials)
    const res = await client.get<SageBill>(`purchase_invoices/${id}`)
    return transformBill(res)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new SageBusinessCloudClient(credentials)
    const res = await client.get<SagePagedResponse<SageContact>>('contacts', this.paginationParams(params))
    return (res.$items ?? res.items ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new SageBusinessCloudClient(credentials)
    const res = await client.get<SageContact>(`contacts/${id}`)
    return transformContact(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new SageBusinessCloudClient(credentials)
    const res = await client.get<SagePagedResponse<SageAccount>>('ledger_accounts', this.paginationParams(params))
    return (res.$items ?? res.items ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new SageBusinessCloudClient(credentials)
    const res = await client.get<SageAccount>(`ledger_accounts/${id}`)
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new SageBusinessCloudClient(credentials)
    const res = await client.get<SagePagedResponse<SageJournal>>('journal_entries', this.paginationParams(params))
    return (res.$items ?? res.items ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new SageBusinessCloudClient(credentials)
    const res = await client.get<SageJournal>(`journal_entries/${id}`)
    return transformJournal(res)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new SageBusinessCloudClient(credentials)
    const res = await client.get<SagePagedResponse<SageTransaction>>('transactions', this.paginationParams(params))
    return (res.$items ?? res.items ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new SageBusinessCloudClient(credentials)
    const res = await client.get<SageTransaction>(`transactions/${id}`)
    return transformTransaction(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new SageBusinessCloudClient(credentials)
    const res = await client.get<SagePagedResponse<SageTaxRate>>('tax_rates', this.paginationParams(params))
    return (res.$items ?? res.items ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new SageBusinessCloudClient(credentials)
    const res = await client.get<SageTaxRate>(`tax_rates/${id}`)
    return transformTaxRate(res)
  }

  // --- Expenses (not supported) ---

  async listExpenses(_credentials: Credentials, _params: QueryParams): Promise<Expense[]> {
    return []
  }

  // --- Credit Memos (not supported) ---

  async listCreditMemos(_credentials: Credentials, _params: QueryParams): Promise<CreditMemo[]> {
    return []
  }

  // --- Orders (not supported) ---

  async listOrders(_credentials: Credentials, _params: QueryParams): Promise<Order[]> {
    return []
  }

  // --- Sales Orders (not supported) ---

  async listSalesOrders(_credentials: Credentials, _params: QueryParams): Promise<SalesOrder[]> {
    return []
  }

  // --- Purchase Orders (not supported) ---

  async listPurchaseOrders(_credentials: Credentials, _params: QueryParams): Promise<PurchaseOrder[]> {
    return []
  }
}
