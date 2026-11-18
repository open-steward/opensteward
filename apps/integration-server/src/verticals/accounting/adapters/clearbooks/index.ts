import { simpleApiKey } from '@opensteward/shared'
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

import { buildAuthUrl, exchangeCode, refreshCredentials } from './auth'
import { ClearBooksClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type ClearBooksInvoice } from './transform/invoice'
import { transformBill, type ClearBooksBill } from './transform/bill'
import { transformContact, type ClearBooksContact } from './transform/contact'
import { transformAccount, type ClearBooksAccount } from './transform/account'
import { transformJournal, type ClearBooksJournal } from './transform/journal'
import { transformOrganization, type ClearBooksOrganization } from './transform/organization'
import { transformExpense, type ClearBooksExpense } from './transform/expense'
import { transformTaxRate, type ClearBooksTaxRate } from './transform/taxrate'
import { transformTransaction, type ClearBooksTransaction } from './transform/transaction'
import { transformCreditMemo, type ClearBooksCreditMemo } from './transform/creditmemo'
import { transformOrder, type ClearBooksOrder } from './transform/order'
import { transformSalesOrder, type ClearBooksSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type ClearBooksPurchaseOrder } from './transform/purchaseorder'

interface ClearBooksAdapterConfig {
  apiKey: string
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class ClearBooksAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'clearbooks'
  readonly version = '0.1.0'

  private apiKey: string

  constructor(config: ClearBooksAdapterConfig) {
    this.apiKey = config.apiKey
  }

  getAuthUrl(_state: string): string {
    return buildAuthUrl(_state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeCode(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshCredentials(credentials)
  }

  private credentialsFromConfig(): Credentials {
    return { accessToken: this.apiKey }
  }

  private paginationParams(params: QueryParams): Record<string, unknown> {
    return {
      limit: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      page: params.page ?? 1,
      ...(params.updatedAfter && {
        modified_since: params.updatedAfter.toISOString(),
      }),
    }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new ClearBooksClient(credentials)
    const res = await client.get<ClearBooksOrganization>('organisation')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new ClearBooksClient(credentials)
    const res = await client.get<{ invoices: ClearBooksInvoice[] }>(
      'invoices',
      this.paginationParams(params),
    )
    return (res.invoices ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new ClearBooksClient(credentials)
    const res = await client.get<ClearBooksInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  // --- Bills (Purchase Invoices) ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new ClearBooksClient(credentials)
    const res = await client.get<{ bills: ClearBooksBill[] }>(
      'bills',
      this.paginationParams(params),
    )
    return (res.bills ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new ClearBooksClient(credentials)
    const res = await client.get<ClearBooksBill>(`bills/${id}`)
    return transformBill(res)
  }

  // --- Contacts (Entities) ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new ClearBooksClient(credentials)
    const res = await client.get<{ entities: ClearBooksContact[] }>(
      'entities',
      this.paginationParams(params),
    )
    return (res.entities ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new ClearBooksClient(credentials)
    const res = await client.get<ClearBooksContact>(`entities/${id}`)
    return transformContact(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new ClearBooksClient(credentials)
    const res = await client.get<{ ledger_accounts: ClearBooksAccount[] }>(
      'ledger-accounts',
      this.paginationParams(params),
    )
    return (res.ledger_accounts ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new ClearBooksClient(credentials)
    const res = await client.get<ClearBooksAccount>(`ledger-accounts/${id}`)
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new ClearBooksClient(credentials)
    const res = await client.get<{ journals: ClearBooksJournal[] }>(
      'journals',
      this.paginationParams(params),
    )
    return (res.journals ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new ClearBooksClient(credentials)
    const res = await client.get<ClearBooksJournal>(`journals/${id}`)
    return transformJournal(res)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new ClearBooksClient(credentials)
    const res = await client.get<{ transactions: ClearBooksTransaction[] }>(
      'transactions',
      this.paginationParams(params),
    )
    return (res.transactions ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new ClearBooksClient(credentials)
    const res = await client.get<ClearBooksTransaction>(`transactions/${id}`)
    return transformTransaction(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new ClearBooksClient(credentials)
    const res = await client.get<{ tax_codes: ClearBooksTaxRate[] }>(
      'tax-codes',
      this.paginationParams(params),
    )
    return (res.tax_codes ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new ClearBooksClient(credentials)
    const res = await client.get<ClearBooksTaxRate>(`tax-codes/${id}`)
    return transformTaxRate(res)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new ClearBooksClient(credentials)
    const res = await client.get<{ expenses: ClearBooksExpense[] }>(
      'expenses',
      this.paginationParams(params),
    )
    return (res.expenses ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new ClearBooksClient(credentials)
    const res = await client.get<ClearBooksExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new ClearBooksClient(credentials)
    const res = await client.get<{ credit_notes: ClearBooksCreditMemo[] }>(
      'credit-notes',
      this.paginationParams(params),
    )
    return (res.credit_notes ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new ClearBooksClient(credentials)
    const res = await client.get<ClearBooksCreditMemo>(`credit-notes/${id}`)
    return transformCreditMemo(res)
  }

  // --- Orders ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new ClearBooksClient(credentials)
    const res = await client.get<{ orders: ClearBooksOrder[] }>(
      'orders',
      this.paginationParams(params),
    )
    return (res.orders ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new ClearBooksClient(credentials)
    const res = await client.get<ClearBooksOrder>(`orders/${id}`)
    return transformOrder(res)
  }

  // --- Sales Orders ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new ClearBooksClient(credentials)
    const res = await client.get<{ sales_orders: ClearBooksSalesOrder[] }>(
      'sales-orders',
      this.paginationParams(params),
    )
    return (res.sales_orders ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new ClearBooksClient(credentials)
    const res = await client.get<ClearBooksSalesOrder>(`sales-orders/${id}`)
    return transformSalesOrder(res)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new ClearBooksClient(credentials)
    const res = await client.get<{ purchase_orders: ClearBooksPurchaseOrder[] }>(
      'purchase-orders',
      this.paginationParams(params),
    )
    return (res.purchase_orders ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new ClearBooksClient(credentials)
    const res = await client.get<ClearBooksPurchaseOrder>(`purchase-orders/${id}`)
    return transformPurchaseOrder(res)
  }
}
