import { simpleApiKey } from '@opensteward/shared'
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Bill } from '../../schema/bill'
import type { Journal } from '../../schema/journal'
import type { Transaction } from '../../schema/transaction'
import type { TaxRate } from '../../schema/taxrate'
import type { Expense } from '../../schema/expense'
import type { CreditMemo } from '../../schema/creditmemo'
import type { Order } from '../../schema/order'
import type { SalesOrder } from '../../schema/salesorder'
import type { PurchaseOrder } from '../../schema/purchaseorder'
import type { Organization } from '../../schema/organization'

import { SendRegningClient } from './client'
import { buildAuthUrl, exchangeCode, refreshCredentials as refreshCreds } from './auth'

import { transformInvoice, type SendRegningInvoice } from './transform/invoice'
import { transformContact, type SendRegningContact } from './transform/contact'
import { transformAccount, type SendRegningAccount } from './transform/account'
import { transformBill, type SendRegningBill } from './transform/bill'
import { transformJournal, type SendRegningJournal } from './transform/journal'
import { transformTransaction, type SendRegningTransaction } from './transform/transaction'
import { transformTaxRate, type SendRegningTaxRate } from './transform/taxrate'
import { transformExpense, type SendRegningExpense } from './transform/expense'
import { transformCreditMemo, type SendRegningCreditMemo } from './transform/creditmemo'
import { transformOrder, type SendRegningOrder } from './transform/order'
import { transformSalesOrder, type SendRegningSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type SendRegningPurchaseOrder } from './transform/purchaseorder'
import { transformOrganization, type SendRegningOrganization } from './transform/organization'
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class SendRegningAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'sendregning'
  readonly version = '0.1.0'

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeCode(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshCreds(credentials)
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new SendRegningClient(credentials)
    const res = await client.get<SendRegningOrganization>('company')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new SendRegningClient(credentials)
    const res = await client.get<SendRegningInvoice[]>('invoices', params)
    return (res ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new SendRegningClient(credentials)
    const res = await client.get<SendRegningInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new SendRegningClient(credentials)
    const res = await client.get<SendRegningContact[]>('recipients', params)
    return (res ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new SendRegningClient(credentials)
    const res = await client.get<SendRegningContact>(`recipients/${id}`)
    return transformContact(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new SendRegningClient(credentials)
    const res = await client.get<SendRegningAccount[]>('accounts', params)
    return (res ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new SendRegningClient(credentials)
    const res = await client.get<SendRegningAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new SendRegningClient(credentials)
    const res = await client.get<SendRegningBill[]>('bills', params)
    return (res ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new SendRegningClient(credentials)
    const res = await client.get<SendRegningBill>(`bills/${id}`)
    return transformBill(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new SendRegningClient(credentials)
    const res = await client.get<SendRegningJournal[]>('journals', params)
    return (res ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new SendRegningClient(credentials)
    const res = await client.get<SendRegningJournal>(`journals/${id}`)
    return transformJournal(res)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new SendRegningClient(credentials)
    const res = await client.get<SendRegningTransaction[]>('transactions', params)
    return (res ?? []).map(transformTransaction)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new SendRegningClient(credentials)
    const res = await client.get<SendRegningTaxRate[]>('tax-rates', params)
    return (res ?? []).map(transformTaxRate)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new SendRegningClient(credentials)
    const res = await client.get<SendRegningExpense[]>('expenses', params)
    return (res ?? []).map(transformExpense)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new SendRegningClient(credentials)
    const res = await client.get<SendRegningCreditMemo[]>('credit-notes', params)
    return (res ?? []).map(transformCreditMemo)
  }

  // --- Orders ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new SendRegningClient(credentials)
    const res = await client.get<SendRegningOrder[]>('orders', params)
    return (res ?? []).map(transformOrder)
  }

  // --- Sales Orders ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new SendRegningClient(credentials)
    const res = await client.get<SendRegningSalesOrder[]>('sales-orders', params)
    return (res ?? []).map(transformSalesOrder)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PurchaseOrder[]> {
    const client = new SendRegningClient(credentials)
    const res = await client.get<SendRegningPurchaseOrder[]>('purchase-orders', params)
    return (res ?? []).map(transformPurchaseOrder)
  }
}
