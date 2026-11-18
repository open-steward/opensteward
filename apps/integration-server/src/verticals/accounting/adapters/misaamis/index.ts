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
import { MisaAmisClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type MisaAmisInvoice } from './transform/invoice'
import { transformBill, type MisaAmisBill } from './transform/bill'
import { transformContact, type MisaAmisPartner } from './transform/contact'
import { transformAccount, type MisaAmisAccount } from './transform/account'
import { transformJournal, type MisaAmisJournalEntry } from './transform/journal'
import { transformOrganization, type MisaAmisCompany } from './transform/organization'
import { transformTransaction, type MisaAmisBankTransaction } from './transform/transaction'
import { transformTaxRate, type MisaAmisTaxRate } from './transform/taxrate'
import { transformExpense, type MisaAmisExpense } from './transform/expense'
import { transformCreditMemo, type MisaAmisCreditNote } from './transform/creditmemo'
import { transformOrder, type MisaAmisOrder } from './transform/order'
import { transformSalesOrder, type MisaAmisSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type MisaAmisPurchaseOrder } from './transform/purchaseorder'

interface MisaAmisAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}

export class MisaAmisAdapter implements AccountingAdapter {
  readonly platform = 'misaamis'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: MisaAmisAdapterConfig) {
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
      page_size: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      page_index: params.page ?? 1,
      ...(params.updatedAfter && {
        modified_date: params.updatedAfter.toISOString().split('T')[0],
      }),
    }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new MisaAmisClient(credentials)
    const res = await client.get<{ data: MisaAmisCompany }>('companies')
    return transformOrganization(res.data)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new MisaAmisClient(credentials)
    const res = await client.get<{ data: MisaAmisInvoice[] }>('invoices', this.paginationParams(params))
    return (res.data ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new MisaAmisClient(credentials)
    const res = await client.get<{ data: MisaAmisInvoice }>(`invoices/${id}`)
    return transformInvoice(res.data)
  }

  // --- Bills (Purchase Invoices) ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new MisaAmisClient(credentials)
    const res = await client.get<{ data: MisaAmisBill[] }>('purchase_invoices', this.paginationParams(params))
    return (res.data ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new MisaAmisClient(credentials)
    const res = await client.get<{ data: MisaAmisBill }>(`purchase_invoices/${id}`)
    return transformBill(res.data)
  }

  // --- Contacts (Partners) ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new MisaAmisClient(credentials)
    const res = await client.get<{ data: MisaAmisPartner[] }>('partners', this.paginationParams(params))
    return (res.data ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new MisaAmisClient(credentials)
    const res = await client.get<{ data: MisaAmisPartner }>(`partners/${id}`)
    return transformContact(res.data)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new MisaAmisClient(credentials)
    const res = await client.get<{ data: MisaAmisAccount[] }>('accounts', this.paginationParams(params))
    return (res.data ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new MisaAmisClient(credentials)
    const res = await client.get<{ data: MisaAmisAccount }>(`accounts/${id}`)
    return transformAccount(res.data)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new MisaAmisClient(credentials)
    const res = await client.get<{ data: MisaAmisJournalEntry[] }>('journal_entries', this.paginationParams(params))
    return (res.data ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new MisaAmisClient(credentials)
    const res = await client.get<{ data: MisaAmisJournalEntry }>(`journal_entries/${id}`)
    return transformJournal(res.data)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new MisaAmisClient(credentials)
    const res = await client.get<{ data: MisaAmisBankTransaction[] }>('bank_transactions', this.paginationParams(params))
    return (res.data ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new MisaAmisClient(credentials)
    const res = await client.get<{ data: MisaAmisBankTransaction }>(`bank_transactions/${id}`)
    return transformTransaction(res.data)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new MisaAmisClient(credentials)
    const res = await client.get<{ data: MisaAmisTaxRate[] }>('tax_rates', this.paginationParams(params))
    return (res.data ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new MisaAmisClient(credentials)
    const res = await client.get<{ data: MisaAmisTaxRate }>(`tax_rates/${id}`)
    return transformTaxRate(res.data)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new MisaAmisClient(credentials)
    const res = await client.get<{ data: MisaAmisExpense[] }>('expense_reports', this.paginationParams(params))
    return (res.data ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new MisaAmisClient(credentials)
    const res = await client.get<{ data: MisaAmisExpense }>(`expense_reports/${id}`)
    return transformExpense(res.data)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new MisaAmisClient(credentials)
    const res = await client.get<{ data: MisaAmisCreditNote[] }>('credit_notes', this.paginationParams(params))
    return (res.data ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new MisaAmisClient(credentials)
    const res = await client.get<{ data: MisaAmisCreditNote }>(`credit_notes/${id}`)
    return transformCreditMemo(res.data)
  }

  // --- Orders ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new MisaAmisClient(credentials)
    const res = await client.get<{ data: MisaAmisOrder[] }>('sales_orders', this.paginationParams(params))
    return (res.data ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new MisaAmisClient(credentials)
    const res = await client.get<{ data: MisaAmisOrder }>(`sales_orders/${id}`)
    return transformOrder(res.data)
  }

  // --- Sales Orders ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new MisaAmisClient(credentials)
    const res = await client.get<{ data: MisaAmisSalesOrder[] }>('sales_orders', this.paginationParams(params))
    return (res.data ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new MisaAmisClient(credentials)
    const res = await client.get<{ data: MisaAmisSalesOrder }>(`sales_orders/${id}`)
    return transformSalesOrder(res.data)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new MisaAmisClient(credentials)
    const res = await client.get<{ data: MisaAmisPurchaseOrder[] }>('purchase_orders', this.paginationParams(params))
    return (res.data ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new MisaAmisClient(credentials)
    const res = await client.get<{ data: MisaAmisPurchaseOrder }>(`purchase_orders/${id}`)
    return transformPurchaseOrder(res.data)
  }
}
