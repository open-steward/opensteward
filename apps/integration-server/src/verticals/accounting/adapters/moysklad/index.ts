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

import { buildAuthUrl, exchangeCode as exchangeCodeFn, refreshCredentials as refreshCreds } from './auth'
import { MoyskladClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type MoyskladInvoice } from './transform/invoice'
import { transformBill, type MoyskladBill } from './transform/bill'
import { transformContact, type MoyskladContact } from './transform/contact'
import { transformAccount, type MoyskladAccount } from './transform/account'
import { transformJournal, type MoyskladJournal } from './transform/journal'
import { transformTransaction, type MoyskladTransaction } from './transform/transaction'
import { transformTaxRate, type MoyskladTaxRate } from './transform/taxrate'
import { transformExpense, type MoyskladExpense } from './transform/expense'
import { transformCreditMemo, type MoyskladCreditMemo } from './transform/creditmemo'
import { transformOrder, type MoyskladOrder } from './transform/order'
import { transformSalesOrder, type MoyskladSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type MoyskladPurchaseOrder } from './transform/purchaseorder'
import { transformOrganization, type MoyskladOrganization } from './transform/organization'
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class MoyskladAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'moysklad'
  readonly version = '0.1.0'

  getAuthUrl(_state: string): string { return buildAuthUrl(_state) }
  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> { return exchangeCodeFn(code) }
  async refreshCredentials(credentials: Credentials): Promise<Credentials> { return refreshCreds(credentials) }

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new MoyskladClient(credentials)
    const res = await client.get<{ rows?: MoyskladOrganization[] }>('entity/organization')
    const item = res.rows?.[0] ?? ({} as MoyskladOrganization)
    return transformOrganization(item)
  }

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new MoyskladClient(credentials)
    const res = await client.get<{ rows: MoyskladInvoice[] }>('entity/invoiceout', { limit: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE), offset: ((params.page ?? 1) - 1) * Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    return (res.rows ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new MoyskladClient(credentials)
    const res = await client.get<MoyskladInvoice>(`entity/invoiceout/${id}`)
    return transformInvoice(res)
  }

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new MoyskladClient(credentials)
    const res = await client.get<{ rows: MoyskladBill[] }>('entity/invoicein', { limit: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE), offset: ((params.page ?? 1) - 1) * Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    return (res.rows ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new MoyskladClient(credentials)
    const res = await client.get<MoyskladBill>(`entity/invoicein/${id}`)
    return transformBill(res)
  }

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new MoyskladClient(credentials)
    const res = await client.get<{ rows: MoyskladContact[] }>('entity/counterparty', { limit: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE), offset: ((params.page ?? 1) - 1) * Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    return (res.rows ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new MoyskladClient(credentials)
    const res = await client.get<MoyskladContact>(`entity/counterparty/${id}`)
    return transformContact(res)
  }

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new MoyskladClient(credentials)
    const res = await client.get<{ rows: MoyskladAccount[] }>('entity/account', { limit: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE), offset: ((params.page ?? 1) - 1) * Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    return (res.rows ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new MoyskladClient(credentials)
    const res = await client.get<MoyskladAccount>(`entity/account/${id}`)
    return transformAccount(res)
  }

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new MoyskladClient(credentials)
    const res = await client.get<{ rows: MoyskladJournal[] }>('entity/journalentry', { limit: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE), offset: ((params.page ?? 1) - 1) * Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    return (res.rows ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new MoyskladClient(credentials)
    const res = await client.get<MoyskladJournal>(`entity/journalentry/${id}`)
    return transformJournal(res)
  }

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new MoyskladClient(credentials)
    const res = await client.get<{ rows: MoyskladTransaction[] }>('entity/paymentin', { limit: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE), offset: ((params.page ?? 1) - 1) * Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    return (res.rows ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new MoyskladClient(credentials)
    const res = await client.get<MoyskladTransaction>(`entity/paymentin/${id}`)
    return transformTransaction(res)
  }

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new MoyskladClient(credentials)
    const res = await client.get<{ rows: MoyskladTaxRate[] }>('entity/vatrate', { limit: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE), offset: ((params.page ?? 1) - 1) * Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    return (res.rows ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new MoyskladClient(credentials)
    const res = await client.get<MoyskladTaxRate>(`entity/vatrate/${id}`)
    return transformTaxRate(res)
  }

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new MoyskladClient(credentials)
    const res = await client.get<{ rows: MoyskladExpense[] }>('entity/expensereport', { limit: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE), offset: ((params.page ?? 1) - 1) * Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    return (res.rows ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new MoyskladClient(credentials)
    const res = await client.get<MoyskladExpense>(`entity/expensereport/${id}`)
    return transformExpense(res)
  }

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new MoyskladClient(credentials)
    const res = await client.get<{ rows: MoyskladCreditMemo[] }>('entity/salesreturn', { limit: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE), offset: ((params.page ?? 1) - 1) * Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    return (res.rows ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new MoyskladClient(credentials)
    const res = await client.get<MoyskladCreditMemo>(`entity/salesreturn/${id}`)
    return transformCreditMemo(res)
  }

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new MoyskladClient(credentials)
    const res = await client.get<{ rows: MoyskladOrder[] }>('entity/customerorder', { limit: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE), offset: ((params.page ?? 1) - 1) * Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    return (res.rows ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new MoyskladClient(credentials)
    const res = await client.get<MoyskladOrder>(`entity/customerorder/${id}`)
    return transformOrder(res)
  }

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new MoyskladClient(credentials)
    const res = await client.get<{ rows: MoyskladSalesOrder[] }>('entity/customerorder', { limit: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE), offset: ((params.page ?? 1) - 1) * Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    return (res.rows ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new MoyskladClient(credentials)
    const res = await client.get<MoyskladSalesOrder>(`entity/customerorder/${id}`)
    return transformSalesOrder(res)
  }

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new MoyskladClient(credentials)
    const res = await client.get<{ rows: MoyskladPurchaseOrder[] }>('entity/purchaseorder', { limit: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE), offset: ((params.page ?? 1) - 1) * Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) })
    return (res.rows ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new MoyskladClient(credentials)
    const res = await client.get<MoyskladPurchaseOrder>(`entity/purchaseorder/${id}`)
    return transformPurchaseOrder(res)
  }
}
