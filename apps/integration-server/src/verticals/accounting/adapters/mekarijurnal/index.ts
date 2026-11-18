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
import { MekariJurnalClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type MekariJurnalInvoice } from './transform/invoice'
import { transformBill, type MekariJurnalBill } from './transform/bill'
import { transformContact, type MekariJurnalContact } from './transform/contact'
import { transformAccount, type MekariJurnalAccount } from './transform/account'
import { transformJournal, type MekariJurnalJournal } from './transform/journal'
import { transformOrganization, type MekariJurnalCompany } from './transform/organization'
import { transformExpense, type MekariJurnalExpense } from './transform/expense'
import { transformTaxRate, type MekariJurnalTaxRate } from './transform/taxrate'
import { transformTransaction, type MekariJurnalTransaction } from './transform/transaction'
import { transformCreditMemo, type MekariJurnalCreditMemo } from './transform/creditmemo'
import { transformOrder, type MekariJurnalOrder } from './transform/order'
import { transformSalesOrder, type MekariJurnalSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type MekariJurnalPurchaseOrder } from './transform/purchaseorder'

interface MekariJurnalAdapterConfig {
  apiKey: string
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class MekariJurnalAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'mekarijurnal'
  readonly version = '0.1.0'

  constructor(_config: MekariJurnalAdapterConfig) {}

  getAuthUrl(_state: string): string {
    return buildAuthUrl(_state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return doExchangeCode(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefreshCredentials(credentials)
  }

  private paginationParams(params: QueryParams): Record<string, unknown> {
    return {
      page_size: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      page: params.page ?? 1,
    }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new MekariJurnalClient(credentials)
    const res = await client.get<{ company: MekariJurnalCompany }>('companies')
    return transformOrganization(res.company)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new MekariJurnalClient(credentials)
    const res = await client.get<{ sales_invoices: MekariJurnalInvoice[] }>(
      'sales_invoices',
      this.paginationParams(params),
    )
    return (res.sales_invoices ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new MekariJurnalClient(credentials)
    const res = await client.get<{ sales_invoice: MekariJurnalInvoice }>(`sales_invoices/${id}`)
    return transformInvoice(res.sales_invoice)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new MekariJurnalClient(credentials)
    const res = await client.get<{ purchase_invoices: MekariJurnalBill[] }>(
      'purchase_invoices',
      this.paginationParams(params),
    )
    return (res.purchase_invoices ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new MekariJurnalClient(credentials)
    const res = await client.get<{ purchase_invoice: MekariJurnalBill }>(`purchase_invoices/${id}`)
    return transformBill(res.purchase_invoice)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new MekariJurnalClient(credentials)
    const res = await client.get<{ contacts: MekariJurnalContact[] }>(
      'contacts',
      this.paginationParams(params),
    )
    return (res.contacts ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new MekariJurnalClient(credentials)
    const res = await client.get<{ contact: MekariJurnalContact }>(`contacts/${id}`)
    return transformContact(res.contact)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new MekariJurnalClient(credentials)
    const res = await client.get<{ chart_of_accounts: MekariJurnalAccount[] }>(
      'chart_of_accounts',
      this.paginationParams(params),
    )
    return (res.chart_of_accounts ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new MekariJurnalClient(credentials)
    const res = await client.get<{ chart_of_account: MekariJurnalAccount }>(`chart_of_accounts/${id}`)
    return transformAccount(res.chart_of_account)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new MekariJurnalClient(credentials)
    const res = await client.get<{ journal_entries: MekariJurnalJournal[] }>(
      'journal_entries',
      this.paginationParams(params),
    )
    return (res.journal_entries ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new MekariJurnalClient(credentials)
    const res = await client.get<{ journal_entry: MekariJurnalJournal }>(`journal_entries/${id}`)
    return transformJournal(res.journal_entry)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new MekariJurnalClient(credentials)
    const res = await client.get<{ bank_transactions: MekariJurnalTransaction[] }>(
      'bank_transactions',
      this.paginationParams(params),
    )
    return (res.bank_transactions ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new MekariJurnalClient(credentials)
    const res = await client.get<{ bank_transaction: MekariJurnalTransaction }>(`bank_transactions/${id}`)
    return transformTransaction(res.bank_transaction)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new MekariJurnalClient(credentials)
    const res = await client.get<{ taxes: MekariJurnalTaxRate[] }>(
      'taxes',
      this.paginationParams(params),
    )
    return (res.taxes ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new MekariJurnalClient(credentials)
    const res = await client.get<{ tax: MekariJurnalTaxRate }>(`taxes/${id}`)
    return transformTaxRate(res.tax)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new MekariJurnalClient(credentials)
    const res = await client.get<{ expenses: MekariJurnalExpense[] }>(
      'expenses',
      this.paginationParams(params),
    )
    return (res.expenses ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new MekariJurnalClient(credentials)
    const res = await client.get<{ expense: MekariJurnalExpense }>(`expenses/${id}`)
    return transformExpense(res.expense)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new MekariJurnalClient(credentials)
    const res = await client.get<{ credit_memos: MekariJurnalCreditMemo[] }>(
      'credit_memos',
      this.paginationParams(params),
    )
    return (res.credit_memos ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new MekariJurnalClient(credentials)
    const res = await client.get<{ credit_memo: MekariJurnalCreditMemo }>(`credit_memos/${id}`)
    return transformCreditMemo(res.credit_memo)
  }

  // --- Orders ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new MekariJurnalClient(credentials)
    const res = await client.get<{ orders: MekariJurnalOrder[] }>(
      'orders',
      this.paginationParams(params),
    )
    return (res.orders ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new MekariJurnalClient(credentials)
    const res = await client.get<{ order: MekariJurnalOrder }>(`orders/${id}`)
    return transformOrder(res.order)
  }

  // --- Sales Orders ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new MekariJurnalClient(credentials)
    const res = await client.get<{ sales_orders: MekariJurnalSalesOrder[] }>(
      'sales_orders',
      this.paginationParams(params),
    )
    return (res.sales_orders ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new MekariJurnalClient(credentials)
    const res = await client.get<{ sales_order: MekariJurnalSalesOrder }>(`sales_orders/${id}`)
    return transformSalesOrder(res.sales_order)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new MekariJurnalClient(credentials)
    const res = await client.get<{ purchase_orders: MekariJurnalPurchaseOrder[] }>(
      'purchase_orders',
      this.paginationParams(params),
    )
    return (res.purchase_orders ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new MekariJurnalClient(credentials)
    const res = await client.get<{ purchase_order: MekariJurnalPurchaseOrder }>(`purchase_orders/${id}`)
    return transformPurchaseOrder(res.purchase_order)
  }
}
