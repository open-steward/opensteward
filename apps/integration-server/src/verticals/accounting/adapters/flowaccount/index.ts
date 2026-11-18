import { toCalendarDate } from '../shared/transform'
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

import {
  buildAuthUrl,
  exchangeCode as doExchangeCode,
  refreshCredentials as doRefreshCredentials,
} from './auth'
import { FlowAccountClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type FlowAccountInvoice } from './transform/invoice'
import { transformBill, type FlowAccountBill } from './transform/bill'
import { transformContact, type FlowAccountContact } from './transform/contact'
import { transformAccount, type FlowAccountAccount } from './transform/account'
import { transformJournal, type FlowAccountJournal } from './transform/journal'
import { transformOrganization, type FlowAccountOrganization } from './transform/organization'
import { transformExpense, type FlowAccountExpense } from './transform/expense'
import { transformTaxRate, type FlowAccountTaxRate } from './transform/taxrate'
import { transformTransaction, type FlowAccountTransaction } from './transform/transaction'
import { transformCreditMemo, type FlowAccountCreditMemo } from './transform/creditmemo'
import { transformOrder, type FlowAccountOrder } from './transform/order'
import { transformSalesOrder, type FlowAccountSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type FlowAccountPurchaseOrder } from './transform/purchaseorder'

interface FlowAccountAdapterConfig {
  apiKey: string
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class FlowAccountAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'flowaccount'
  readonly version = '0.1.0'

  constructor(_config: FlowAccountAdapterConfig) {}

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return doExchangeCode(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefreshCredentials(credentials)
  }

  private paginationParams(params: QueryParams): Record<string, unknown> {
    return {
      limit: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      page: params.page ?? 1,
    }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new FlowAccountClient(credentials)
    const res = await client.get<FlowAccountOrganization>('companies/me')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new FlowAccountClient(credentials)
    const res = await client.get<{ data: FlowAccountInvoice[] }>('billing-notes', this.paginationParams(params))
    return (res.data ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new FlowAccountClient(credentials)
    const res = await client.get<FlowAccountInvoice>(`billing-notes/${id}`)
    return transformInvoice(res)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new FlowAccountClient(credentials)
    const res = await client.post<FlowAccountInvoice>('billing-notes', {
      contactCode: data.contactId,
      currencyCode: data.currency,
      issuedDate: toCalendarDate(data.postedAt),
      dueDate: toCalendarDate(data.dueAt),
      items: data.lineItems?.map((li) => ({
        description: li.itemDescription,
        unitPrice: li.unitAmount,
        quantity: li.unitQuantity,
        accountCode: li.accountId,
      })),
    })
    return transformInvoice(res)
  }

  // --- Bills (Purchase Invoices) ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new FlowAccountClient(credentials)
    const res = await client.get<{ data: FlowAccountBill[] }>('purchase-invoices', this.paginationParams(params))
    return (res.data ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new FlowAccountClient(credentials)
    const res = await client.get<FlowAccountBill>(`purchase-invoices/${id}`)
    return transformBill(res)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new FlowAccountClient(credentials)
    const res = await client.get<{ data: FlowAccountContact[] }>('contacts', this.paginationParams(params))
    return (res.data ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new FlowAccountClient(credentials)
    const res = await client.get<FlowAccountContact>(`contacts/${id}`)
    return transformContact(res)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new FlowAccountClient(credentials)
    let contactType = '1'
    if (data.isSupplier && !data.isCustomer) contactType = '2'
    if (data.isSupplier && data.isCustomer) contactType = '3'
    const res = await client.post<FlowAccountContact>('contacts', {
      contactName: data.name,
      contactType,
      email: data.emails?.[0]?.email,
      phone: data.telephones?.[0]?.telephone,
      taxId: data.identification,
    })
    return transformContact(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new FlowAccountClient(credentials)
    const res = await client.get<{ data: FlowAccountAccount[] }>('chart-of-accounts', this.paginationParams(params))
    return (res.data ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new FlowAccountClient(credentials)
    const res = await client.get<FlowAccountAccount>(`chart-of-accounts/${id}`)
    return transformAccount(res)
  }

  // --- Journals (Journal Entries) ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new FlowAccountClient(credentials)
    const res = await client.get<{ data: FlowAccountJournal[] }>('journal-entries', this.paginationParams(params))
    return (res.data ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new FlowAccountClient(credentials)
    const res = await client.get<FlowAccountJournal>(`journal-entries/${id}`)
    return transformJournal(res)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new FlowAccountClient(credentials)
    const res = await client.get<{ data: FlowAccountTransaction[] }>('transactions', this.paginationParams(params))
    return (res.data ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new FlowAccountClient(credentials)
    const res = await client.get<FlowAccountTransaction>(`transactions/${id}`)
    return transformTransaction(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new FlowAccountClient(credentials)
    const res = await client.get<{ data: FlowAccountTaxRate[] }>('tax-rates', this.paginationParams(params))
    return (res.data ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new FlowAccountClient(credentials)
    const res = await client.get<FlowAccountTaxRate>(`tax-rates/${id}`)
    return transformTaxRate(res)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new FlowAccountClient(credentials)
    const res = await client.get<{ data: FlowAccountExpense[] }>('expenses', this.paginationParams(params))
    return (res.data ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new FlowAccountClient(credentials)
    const res = await client.get<FlowAccountExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  // --- Credit Memos (Credit Notes) ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new FlowAccountClient(credentials)
    const res = await client.get<{ data: FlowAccountCreditMemo[] }>('credit-notes', this.paginationParams(params))
    return (res.data ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new FlowAccountClient(credentials)
    const res = await client.get<FlowAccountCreditMemo>(`credit-notes/${id}`)
    return transformCreditMemo(res)
  }

  // --- Orders ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new FlowAccountClient(credentials)
    const res = await client.get<{ data: FlowAccountOrder[] }>('orders', this.paginationParams(params))
    return (res.data ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new FlowAccountClient(credentials)
    const res = await client.get<FlowAccountOrder>(`orders/${id}`)
    return transformOrder(res)
  }

  // --- Sales Orders ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new FlowAccountClient(credentials)
    const res = await client.get<{ data: FlowAccountSalesOrder[] }>('sales-orders', this.paginationParams(params))
    return (res.data ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new FlowAccountClient(credentials)
    const res = await client.get<FlowAccountSalesOrder>(`sales-orders/${id}`)
    return transformSalesOrder(res)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new FlowAccountClient(credentials)
    const res = await client.get<{ data: FlowAccountPurchaseOrder[] }>('purchase-orders', this.paginationParams(params))
    return (res.data ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new FlowAccountClient(credentials)
    const res = await client.get<FlowAccountPurchaseOrder>(`purchase-orders/${id}`)
    return transformPurchaseOrder(res)
  }
}
