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
  INVOICEXPRESS_CREDENTIAL_FORM,
  buildAuthUrl,
  exchangeCode as doExchangeCode,
  refreshCredentials as doRefreshCredentials,
} from './auth'
import { InvoiceXpressClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type InvoiceXpressInvoice } from './transform/invoice'
import { transformBill, type InvoiceXpressBill } from './transform/bill'
import { transformContact, type InvoiceXpressContact } from './transform/contact'
import { transformAccount, type InvoiceXpressAccount } from './transform/account'
import { transformJournal, type InvoiceXpressJournal } from './transform/journal'
import { transformOrganization, type InvoiceXpressOrganization } from './transform/organization'
import { transformExpense, type InvoiceXpressExpense } from './transform/expense'
import { transformTaxRate, type InvoiceXpressTaxRate } from './transform/taxrate'
import { transformTransaction, type InvoiceXpressTransaction } from './transform/transaction'
import { transformCreditMemo, type InvoiceXpressCreditMemo } from './transform/creditmemo'
import { transformOrder, type InvoiceXpressOrder } from './transform/order'
import { transformSalesOrder, type InvoiceXpressSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type InvoiceXpressPurchaseOrder } from './transform/purchaseorder'

interface InvoiceXpressAdapterConfig {
  apiKey: string
  accountName: string
}

export class InvoiceXpressAdapter implements AccountingAdapter {

  // Connect Link support — API key + account name (see auth.ts).

  credentialFields = INVOICEXPRESS_CREDENTIAL_FORM.credentialFields

  exchangeCredentials = INVOICEXPRESS_CREDENTIAL_FORM.exchangeCredentials

  readonly platform = 'invoicexpress'
  readonly version = '0.1.0'

  private apiKey: string
  private accountName: string

  constructor(config: InvoiceXpressAdapterConfig) {
    this.apiKey = config.apiKey
    this.accountName = config.accountName
  }

  getAuthUrl(_state: string): string {
    return buildAuthUrl(_state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    const creds = await doExchangeCode(code)
    return {
      ...creds,
      extra: { accountName: this.accountName },
    }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefreshCredentials(credentials)
  }

  /**
   * The connection's own credentials (collected by the Connect Link form) are
   * used whenever they carry an account name; the deployment-level
   * apiKey + accountName pair is only a fallback for connections without one.
   */
  private connectionCredentials(credentials: Credentials): Credentials {
    const accountName = credentials.extra?.['accountName']
    if (typeof accountName === 'string' && accountName) return credentials
    return {
      accessToken: this.apiKey,
      extra: { accountName: this.accountName },
    }
  }

  private paginationParams(params: QueryParams): Record<string, unknown> {
    return {
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      page: params.page ?? 1,
    }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new InvoiceXpressClient(this.connectionCredentials(credentials))
    const res = await client.get<InvoiceXpressOrganization>('accounts/me.json')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new InvoiceXpressClient(this.connectionCredentials(credentials))
    const res = await client.get<{ invoices: InvoiceXpressInvoice[] }>(
      'invoices.json',
      this.paginationParams(params),
    )
    return (res.invoices ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new InvoiceXpressClient(this.connectionCredentials(credentials))
    const res = await client.get<{ invoice: InvoiceXpressInvoice }>(`invoices/${id}.json`)
    return transformInvoice(res.invoice)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new InvoiceXpressClient(this.connectionCredentials(credentials))
    const res = await client.get<{ purchase_invoices: InvoiceXpressBill[] }>(
      'purchase_invoices.json',
      this.paginationParams(params),
    )
    return (res.purchase_invoices ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new InvoiceXpressClient(this.connectionCredentials(credentials))
    const res = await client.get<{ purchase_invoice: InvoiceXpressBill }>(`purchase_invoices/${id}.json`)
    return transformBill(res.purchase_invoice)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new InvoiceXpressClient(this.connectionCredentials(credentials))
    const res = await client.get<{ clients: InvoiceXpressContact[] }>(
      'clients.json',
      this.paginationParams(params),
    )
    return (res.clients ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new InvoiceXpressClient(this.connectionCredentials(credentials))
    const res = await client.get<{ client: InvoiceXpressContact }>(`clients/${id}.json`)
    return transformContact(res.client)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new InvoiceXpressClient(this.connectionCredentials(credentials))
    const res = await client.get<{ accounts: InvoiceXpressAccount[] }>(
      'accounts.json',
      this.paginationParams(params),
    )
    return (res.accounts ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new InvoiceXpressClient(this.connectionCredentials(credentials))
    const res = await client.get<{ account: InvoiceXpressAccount }>(`accounts/${id}.json`)
    return transformAccount(res.account)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new InvoiceXpressClient(this.connectionCredentials(credentials))
    const res = await client.get<{ journal_entries: InvoiceXpressJournal[] }>(
      'journal_entries.json',
      this.paginationParams(params),
    )
    return (res.journal_entries ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new InvoiceXpressClient(this.connectionCredentials(credentials))
    const res = await client.get<{ journal_entry: InvoiceXpressJournal }>(`journal_entries/${id}.json`)
    return transformJournal(res.journal_entry)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new InvoiceXpressClient(this.connectionCredentials(credentials))
    const res = await client.get<{ payments: InvoiceXpressTransaction[] }>(
      'payments.json',
      this.paginationParams(params),
    )
    return (res.payments ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new InvoiceXpressClient(this.connectionCredentials(credentials))
    const res = await client.get<{ payment: InvoiceXpressTransaction }>(`payments/${id}.json`)
    return transformTransaction(res.payment)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new InvoiceXpressClient(this.connectionCredentials(credentials))
    const res = await client.get<{ taxes: InvoiceXpressTaxRate[] }>(
      'taxes.json',
      this.paginationParams(params),
    )
    return (res.taxes ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new InvoiceXpressClient(this.connectionCredentials(credentials))
    const res = await client.get<{ tax: InvoiceXpressTaxRate }>(`taxes/${id}.json`)
    return transformTaxRate(res.tax)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new InvoiceXpressClient(this.connectionCredentials(credentials))
    const res = await client.get<{ expenses: InvoiceXpressExpense[] }>(
      'expenses.json',
      this.paginationParams(params),
    )
    return (res.expenses ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new InvoiceXpressClient(this.connectionCredentials(credentials))
    const res = await client.get<{ expense: InvoiceXpressExpense }>(`expenses/${id}.json`)
    return transformExpense(res.expense)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new InvoiceXpressClient(this.connectionCredentials(credentials))
    const res = await client.get<{ credit_notes: InvoiceXpressCreditMemo[] }>(
      'credit_notes.json',
      this.paginationParams(params),
    )
    return (res.credit_notes ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new InvoiceXpressClient(this.connectionCredentials(credentials))
    const res = await client.get<{ credit_note: InvoiceXpressCreditMemo }>(`credit_notes/${id}.json`)
    return transformCreditMemo(res.credit_note)
  }

  // --- Orders ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new InvoiceXpressClient(this.connectionCredentials(credentials))
    const res = await client.get<{ quotations: InvoiceXpressOrder[] }>(
      'quotations.json',
      this.paginationParams(params),
    )
    return (res.quotations ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new InvoiceXpressClient(this.connectionCredentials(credentials))
    const res = await client.get<{ quotation: InvoiceXpressOrder }>(`quotations/${id}.json`)
    return transformOrder(res.quotation)
  }

  // --- Sales Orders ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new InvoiceXpressClient(this.connectionCredentials(credentials))
    const res = await client.get<{ sales_orders: InvoiceXpressSalesOrder[] }>(
      'sales_orders.json',
      this.paginationParams(params),
    )
    return (res.sales_orders ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new InvoiceXpressClient(this.connectionCredentials(credentials))
    const res = await client.get<{ sales_order: InvoiceXpressSalesOrder }>(`sales_orders/${id}.json`)
    return transformSalesOrder(res.sales_order)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new InvoiceXpressClient(this.connectionCredentials(credentials))
    const res = await client.get<{ purchase_orders: InvoiceXpressPurchaseOrder[] }>(
      'purchase_orders.json',
      this.paginationParams(params),
    )
    return (res.purchase_orders ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new InvoiceXpressClient(this.connectionCredentials(credentials))
    const res = await client.get<{ purchase_order: InvoiceXpressPurchaseOrder }>(`purchase_orders/${id}.json`)
    return transformPurchaseOrder(res.purchase_order)
  }
}
