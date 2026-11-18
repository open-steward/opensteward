import type { WebhookEvent } from '../schema/webhook'
import type { Invoice } from '../schema/invoice'
import type { Bill } from '../schema/bill'
import type { Contact } from '../schema/contact'
import type { Account } from '../schema/account'
import type { Journal } from '../schema/journal'
import type { Transaction } from '../schema/transaction'
import type { TaxRate } from '../schema/taxrate'
import type { Expense } from '../schema/expense'
import type { CreditMemo } from '../schema/creditmemo'
import type { Quote } from '../schema/quote'
import type { SalesOrder } from '../schema/salesorder'
import type { PurchaseOrder } from '../schema/purchaseorder'
import type { Order } from '../schema/order'
import type { Organization } from '../schema/organization'

export type { Credentials } from '@opensteward/shared'
export type { QueryParams } from '@opensteward/shared'
import type { Credentials, QueryParams, BaseAdapter } from '@opensteward/shared'

/**
 * AccountingAdapter — extends BaseAdapter with accounting-specific resource methods.
 * Auth and webhook methods are inherited from BaseAdapter.
 */
export interface AccountingAdapter extends BaseAdapter {
  // Webhooks (refined return type)
  parseWebhookEvents?(payload: Record<string, unknown>): WebhookEvent[]

  // Organization
  getOrganization?(credentials: Credentials): Promise<Organization>

  // Invoices
  listInvoices?(credentials: Credentials, params: QueryParams): Promise<Invoice[]>
  getInvoice?(credentials: Credentials, id: string): Promise<Invoice>
  createInvoice?(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice>
  updateInvoice?(
    credentials: Credentials,
    id: string,
    data: Partial<Invoice>,
  ): Promise<Invoice>
  deleteInvoice?(credentials: Credentials, id: string): Promise<void>

  // Bills
  listBills?(credentials: Credentials, params: QueryParams): Promise<Bill[]>
  getBill?(credentials: Credentials, id: string): Promise<Bill>
  createBill?(credentials: Credentials, data: Partial<Bill>): Promise<Bill>
  updateBill?(credentials: Credentials, id: string, data: Partial<Bill>): Promise<Bill>
  deleteBill?(credentials: Credentials, id: string): Promise<void>

  // Contacts
  listContacts?(credentials: Credentials, params: QueryParams): Promise<Contact[]>
  getContact?(credentials: Credentials, id: string): Promise<Contact>
  createContact?(credentials: Credentials, data: Partial<Contact>): Promise<Contact>
  updateContact?(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact>
  deleteContact?(credentials: Credentials, id: string): Promise<void>

  // Accounts
  listAccounts?(credentials: Credentials, params: QueryParams): Promise<Account[]>
  getAccount?(credentials: Credentials, id: string): Promise<Account>

  // Journals
  listJournals?(credentials: Credentials, params: QueryParams): Promise<Journal[]>
  getJournal?(credentials: Credentials, id: string): Promise<Journal>
  createJournal?(credentials: Credentials, data: Partial<Journal>): Promise<Journal>

  // Transactions
  listTransactions?(credentials: Credentials, params: QueryParams): Promise<Transaction[]>
  getTransaction?(credentials: Credentials, id: string): Promise<Transaction>

  // Tax Rates
  listTaxRates?(credentials: Credentials, params: QueryParams): Promise<TaxRate[]>
  getTaxRate?(credentials: Credentials, id: string): Promise<TaxRate>

  // Expenses
  listExpenses?(credentials: Credentials, params: QueryParams): Promise<Expense[]>
  getExpense?(credentials: Credentials, id: string): Promise<Expense>
  createExpense?(credentials: Credentials, data: Partial<Expense>): Promise<Expense>

  // Credit Memos
  listCreditMemos?(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]>
  getCreditMemo?(credentials: Credentials, id: string): Promise<CreditMemo>

  /** Quotes / estimates — a priced offer before any obligation exists.
   *  Read-only for now: the platforms that expose quotes model acceptance and
   *  conversion differently enough that a canonical create would be guesswork. */
  listQuotes?(credentials: Credentials, params: QueryParams): Promise<Quote[]>
  getQuote?(credentials: Credentials, id: string): Promise<Quote>
  createCreditMemo?(
    credentials: Credentials,
    data: Partial<CreditMemo>,
  ): Promise<CreditMemo>

  // Orders
  listOrders?(credentials: Credentials, params: QueryParams): Promise<Order[]>
  getOrder?(credentials: Credentials, id: string): Promise<Order>
  createOrder?(credentials: Credentials, data: Partial<Order>): Promise<Order>

  // Sales Orders
  listSalesOrders?(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]>
  getSalesOrder?(credentials: Credentials, id: string): Promise<SalesOrder>
  createSalesOrder?(
    credentials: Credentials,
    data: Partial<SalesOrder>,
  ): Promise<SalesOrder>

  // Purchase Orders
  listPurchaseOrders?(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PurchaseOrder[]>
  getPurchaseOrder?(credentials: Credentials, id: string): Promise<PurchaseOrder>
  createPurchaseOrder?(
    credentials: Credentials,
    data: Partial<PurchaseOrder>,
  ): Promise<PurchaseOrder>
}
