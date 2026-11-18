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

import { ERPNEXT_CREDENTIAL_FORM, buildAuthUrl, exchangeCode, refreshCredentials } from './auth'
import { ErpNextClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import { transformInvoice, type ErpNextInvoice } from './transform/invoice'
import { transformBill, type ErpNextBill } from './transform/bill'
import { transformContact, type ErpNextContact } from './transform/contact'
import { transformAccount, type ErpNextAccount } from './transform/account'
import { transformTaxRate, type ErpNextTaxRate } from './transform/taxrate'
import { transformOrganization, type ErpNextCompany } from './transform/organization'
import { transformTransaction, type ErpNextPaymentEntry } from './transform/transaction'
import { transformJournal, type ErpNextJournalEntry } from './transform/journal'
import { transformExpense, type ErpNextExpense } from './transform/expense'
import { transformCreditMemo, type ErpNextCreditMemo } from './transform/creditmemo'
import { transformOrder, type ErpNextOrder } from './transform/order'
import { transformSalesOrder, type ErpNextSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type ErpNextPurchaseOrder } from './transform/purchaseorder'

interface ErpNextAdapterConfig {
  apiKey: string
  apiSecret: string
  baseUrl: string
}

export class ErpNextAdapter implements AccountingAdapter {

  // Connect Link support — site URL + API key + API secret (see auth.ts).

  credentialFields = ERPNEXT_CREDENTIAL_FORM.credentialFields

  exchangeCredentials = ERPNEXT_CREDENTIAL_FORM.exchangeCredentials

  readonly platform = 'erpnext'
  readonly version = '0.1.0'

  /** Deployment-level fallback only; connections carry their own site URL. */
  private baseUrl: string | undefined

  constructor(config: ErpNextAdapterConfig) {
    this.baseUrl = config.baseUrl || undefined
  }

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeCode(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshCredentials(credentials)
  }

  private paginationParams(params: QueryParams): Record<string, unknown> {
    return {
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
      limit_start: ((params.page ?? 1) - 1) * (params.limit ?? DEFAULT_PAGE_SIZE),
    }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new ErpNextClient(credentials, this.baseUrl)
    const res = await client.get<{ data: ErpNextCompany[] }>('Company', this.paginationParams({ limit: 1 }))
    const company = res.data[0]
    return transformOrganization(company)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new ErpNextClient(credentials, this.baseUrl)
    const res = await client.get<{ data: ErpNextInvoice[] }>('Sales Invoice', this.paginationParams(params))
    return (res.data ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new ErpNextClient(credentials, this.baseUrl)
    const res = await client.get<{ data: ErpNextInvoice }>(`Sales Invoice/${id}`)
    return transformInvoice(res.data)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new ErpNextClient(credentials, this.baseUrl)
    const res = await client.get<{ data: ErpNextBill[] }>('Purchase Invoice', this.paginationParams(params))
    return (res.data ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new ErpNextClient(credentials, this.baseUrl)
    const res = await client.get<{ data: ErpNextBill }>(`Purchase Invoice/${id}`)
    return transformBill(res.data)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new ErpNextClient(credentials, this.baseUrl)
    const res = await client.get<{ data: ErpNextContact[] }>('Contact', this.paginationParams(params))
    return (res.data ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new ErpNextClient(credentials, this.baseUrl)
    const res = await client.get<{ data: ErpNextContact }>(`Contact/${id}`)
    return transformContact(res.data)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new ErpNextClient(credentials, this.baseUrl)
    const res = await client.get<{ data: ErpNextAccount[] }>('Account', this.paginationParams(params))
    return (res.data ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new ErpNextClient(credentials, this.baseUrl)
    const res = await client.get<{ data: ErpNextAccount }>(`Account/${id}`)
    return transformAccount(res.data)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new ErpNextClient(credentials, this.baseUrl)
    const res = await client.get<{ data: ErpNextTaxRate[] }>('Tax Rule', this.paginationParams(params))
    return (res.data ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new ErpNextClient(credentials, this.baseUrl)
    const res = await client.get<{ data: ErpNextTaxRate }>(`Tax Rule/${id}`)
    return transformTaxRate(res.data)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new ErpNextClient(credentials, this.baseUrl)
    const res = await client.get<{ data: ErpNextPaymentEntry[] }>('Payment Entry', this.paginationParams(params))
    return (res.data ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new ErpNextClient(credentials, this.baseUrl)
    const res = await client.get<{ data: ErpNextPaymentEntry }>(`Payment Entry/${id}`)
    return transformTransaction(res.data)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new ErpNextClient(credentials, this.baseUrl)
    const res = await client.get<{ data: ErpNextJournalEntry[] }>('Journal Entry', this.paginationParams(params))
    return (res.data ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new ErpNextClient(credentials, this.baseUrl)
    const res = await client.get<{ data: ErpNextJournalEntry }>(`Journal Entry/${id}`)
    return transformJournal(res.data)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new ErpNextClient(credentials, this.baseUrl)
    const res = await client.get<{ data: ErpNextExpense[] }>('Expense Claim', this.paginationParams(params))
    return (res.data ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new ErpNextClient(credentials, this.baseUrl)
    const res = await client.get<{ data: ErpNextExpense }>(`Expense Claim/${id}`)
    return transformExpense(res.data)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new ErpNextClient(credentials, this.baseUrl)
    const res = await client.get<{ data: ErpNextCreditMemo[] }>('Sales Invoice', {
      ...this.paginationParams(params),
      filters: JSON.stringify([['is_return', '=', 1]]),
    })
    return (res.data ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new ErpNextClient(credentials, this.baseUrl)
    const res = await client.get<{ data: ErpNextCreditMemo }>(`Sales Invoice/${id}`)
    return transformCreditMemo(res.data)
  }

  // --- Orders ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new ErpNextClient(credentials, this.baseUrl)
    const res = await client.get<{ data: ErpNextOrder[] }>('Sales Order', this.paginationParams(params))
    return (res.data ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new ErpNextClient(credentials, this.baseUrl)
    const res = await client.get<{ data: ErpNextOrder }>(`Sales Order/${id}`)
    return transformOrder(res.data)
  }

  // --- Sales Orders ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new ErpNextClient(credentials, this.baseUrl)
    const res = await client.get<{ data: ErpNextSalesOrder[] }>('Sales Order', this.paginationParams(params))
    return (res.data ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new ErpNextClient(credentials, this.baseUrl)
    const res = await client.get<{ data: ErpNextSalesOrder }>(`Sales Order/${id}`)
    return transformSalesOrder(res.data)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new ErpNextClient(credentials, this.baseUrl)
    const res = await client.get<{ data: ErpNextPurchaseOrder[] }>('Purchase Order', this.paginationParams(params))
    return (res.data ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new ErpNextClient(credentials, this.baseUrl)
    const res = await client.get<{ data: ErpNextPurchaseOrder }>(`Purchase Order/${id}`)
    return transformPurchaseOrder(res.data)
  }
}
