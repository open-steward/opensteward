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

import { buildAuthUrl, exchangeCode as doExchangeCode, refreshAccessToken } from './auth'
import { Sage50DeClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type Sage50DeInvoice } from './transform/invoice'
import { transformBill, type Sage50DeBill } from './transform/bill'
import { transformContact, type Sage50deContact } from './transform/contact'
import { transformAccount, type Sage50deAccount } from './transform/account'
import { transformJournal, type Sage50DeJournal } from './transform/journal'
import { transformOrganization, type Sage50deOrganization } from './transform/organization'
import { transformExpense, type Sage50DeExpense } from './transform/expense'
import { transformTaxRate, type Sage50DeTaxRate } from './transform/taxrate'
import { transformTransaction, type Sage50DeTransaction } from './transform/transaction'
import { transformCreditMemo, type Sage50DeCreditMemo } from './transform/creditmemo'
import { transformOrder, type Sage50DeOrder } from './transform/order'
import { transformSalesOrder, type Sage50DeSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type Sage50DePurchaseOrder } from './transform/purchaseorder'

interface Sage50DeAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class Sage50DeAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'sage50de'
  readonly version = '0.1.0'

  constructor(private config: Sage50DeAdapterConfig) {}

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.config.clientId, this.config.redirectUri, (overrideScopes ?? this.config.scopes), state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return doExchangeCode(code, this.config.clientId, this.config.clientSecret, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) return credentials
    return refreshAccessToken(credentials.refreshToken, this.config.clientId, this.config.clientSecret)
  }

  private paginationParams(params: QueryParams): Record<string, unknown> {
    return {
      items_per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      page: params.page ?? 1,
    }
  }

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new Sage50DeClient(credentials)
    // Sage Accounting API v3.1 returns a list of businesses; use the first (lead) business.
    const res = await client.get<{ $items: Sage50deOrganization[] }>('businesses')
    return transformOrganization(res.$items[0])
  }

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new Sage50DeClient(credentials)
    const res = await client.get<{ $items: Sage50DeInvoice[] }>('sales_invoices', this.paginationParams(params))
    return (res.$items ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new Sage50DeClient(credentials)
    const res = await client.get<Sage50DeInvoice>(`sales_invoices/${id}`)
    return transformInvoice(res)
  }

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new Sage50DeClient(credentials)
    const res = await client.get<{ $items: Sage50DeBill[] }>('purchase_invoices', this.paginationParams(params))
    return (res.$items ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new Sage50DeClient(credentials)
    const res = await client.get<Sage50DeBill>(`purchase_invoices/${id}`)
    return transformBill(res)
  }

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new Sage50DeClient(credentials)
    const res = await client.get<{ $items: Sage50deContact[] }>('contacts', this.paginationParams(params))
    return (res.$items ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new Sage50DeClient(credentials)
    const res = await client.get<Sage50deContact>(`contacts/${id}`)
    return transformContact(res)
  }

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new Sage50DeClient(credentials)
    const res = await client.get<{ $items: Sage50deAccount[] }>('ledger_accounts', this.paginationParams(params))
    return (res.$items ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new Sage50DeClient(credentials)
    const res = await client.get<Sage50deAccount>(`ledger_accounts/${id}`)
    return transformAccount(res)
  }

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new Sage50DeClient(credentials)
    const res = await client.get<{ $items: Sage50DeJournal[] }>('journals', this.paginationParams(params))
    return (res.$items ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new Sage50DeClient(credentials)
    const res = await client.get<Sage50DeJournal>(`journals/${id}`)
    return transformJournal(res)
  }

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new Sage50DeClient(credentials)
    const res = await client.get<{ $items: Sage50DeTransaction[] }>('ledger_entries', this.paginationParams(params))
    return (res.$items ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new Sage50DeClient(credentials)
    const res = await client.get<Sage50DeTransaction>(`ledger_entries/${id}`)
    return transformTransaction(res)
  }

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new Sage50DeClient(credentials)
    const res = await client.get<{ $items: Sage50DeTaxRate[] }>('tax_rates', this.paginationParams(params))
    return (res.$items ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new Sage50DeClient(credentials)
    const res = await client.get<Sage50DeTaxRate>(`tax_rates/${id}`)
    return transformTaxRate(res)
  }

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new Sage50DeClient(credentials)
    const res = await client.get<{ $items: Sage50DeExpense[] }>('expenses', this.paginationParams(params))
    return (res.$items ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new Sage50DeClient(credentials)
    const res = await client.get<Sage50DeExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new Sage50DeClient(credentials)
    const res = await client.get<{ $items: Sage50DeCreditMemo[] }>('sales_credit_notes', this.paginationParams(params))
    return (res.$items ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new Sage50DeClient(credentials)
    const res = await client.get<Sage50DeCreditMemo>(`sales_credit_notes/${id}`)
    return transformCreditMemo(res)
  }

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new Sage50DeClient(credentials)
    const res = await client.get<{ $items: Sage50DeOrder[] }>('sales_orders', this.paginationParams(params))
    return (res.$items ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new Sage50DeClient(credentials)
    const res = await client.get<Sage50DeOrder>(`sales_orders/${id}`)
    return transformOrder(res)
  }

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new Sage50DeClient(credentials)
    const res = await client.get<{ $items: Sage50DeSalesOrder[] }>('sales_orders', this.paginationParams(params))
    return (res.$items ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new Sage50DeClient(credentials)
    const res = await client.get<Sage50DeSalesOrder>(`sales_orders/${id}`)
    return transformSalesOrder(res)
  }

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new Sage50DeClient(credentials)
    const res = await client.get<{ $items: Sage50DePurchaseOrder[] }>('purchase_orders', this.paginationParams(params))
    return (res.$items ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new Sage50DeClient(credentials)
    const res = await client.get<Sage50DePurchaseOrder>(`purchase_orders/${id}`)
    return transformPurchaseOrder(res)
  }
}
