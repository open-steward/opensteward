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

import { DuettClient } from './client'
import { buildAuthUrl, exchangeCode as authExchangeCode, refreshCredentials as authRefreshCredentials } from './auth'

import { transformInvoice, type DuettInvoice } from './transform/invoice'
import { transformContact, type DuettContact } from './transform/contact'
import { transformAccount, type DuettAccount } from './transform/account'
import { transformBill, type DuettBill } from './transform/bill'
import { transformJournal, type DuettJournal } from './transform/journal'
import { transformTransaction, type DuettTransaction } from './transform/transaction'
import { transformTaxRate, type DuettTaxRate } from './transform/taxrate'
import { transformExpense, type DuettExpense } from './transform/expense'
import { transformCreditMemo, type DuettCreditMemo } from './transform/creditmemo'
import { transformOrder, type DuettOrder } from './transform/order'
import { transformSalesOrder, type DuettSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type DuettPurchaseOrder } from './transform/purchaseorder'
import { transformOrganization, type DuettOrganization } from './transform/organization'

interface DuettAdapterConfig {
  clientId: string
  clientSecret?: string
}

export class DuettAdapter implements AccountingAdapter {
  readonly platform = 'duett'
  readonly version = '0.1.0'

  private integrationKey: string

  constructor(config: DuettAdapterConfig) {
    this.integrationKey = config.clientId
  }

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(clientKey: string, _redirectUri: string): Promise<Credentials> {
    // clientKey = X-Api-Client-Key (per end-user company). Store as tenantId.
    return authExchangeCode(this.integrationKey)
      .then((c) => ({ ...c, tenantId: clientKey }))
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return authRefreshCredentials(credentials)
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new DuettClient(credentials)
    const res = await client.get<DuettOrganization>('company/v2')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new DuettClient(credentials)
    const res = await client.get<DuettInvoice[]>('invoice/v2', { page: params.page ?? 1 })
    return (res ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new DuettClient(credentials)
    const res = await client.get<DuettInvoice>(`invoice/v2/${id}`)
    return transformInvoice(res)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new DuettClient(credentials)
    const res = await client.get<DuettContact[]>('customer/v2', { page: params.page ?? 1 })
    return (res ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new DuettClient(credentials)
    const res = await client.get<DuettContact>(`customer/v2/${id}`)
    return transformContact(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new DuettClient(credentials)
    const res = await client.get<DuettAccount[]>('account/v2', { page: params.page ?? 1 })
    return (res ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new DuettClient(credentials)
    const res = await client.get<DuettAccount>(`account/v2/${id}`)
    return transformAccount(res)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new DuettClient(credentials)
    const res = await client.get<DuettBill[]>('supplierinvoice/v2', { page: params.page ?? 1 })
    return (res ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new DuettClient(credentials)
    const res = await client.get<DuettBill>(`supplierinvoice/v2/${id}`)
    return transformBill(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new DuettClient(credentials)
    const res = await client.get<DuettJournal[]>('voucher/v2', { page: params.page ?? 1 })
    return (res ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new DuettClient(credentials)
    const res = await client.get<DuettJournal>(`voucher/v2/${id}`)
    return transformJournal(res)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new DuettClient(credentials)
    const res = await client.get<DuettTransaction[]>('ledger/v2', { page: params.page ?? 1 })
    return (res ?? []).map(transformTransaction)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new DuettClient(credentials)
    const res = await client.get<DuettTaxRate[]>('vatcode/v2', { page: params.page ?? 1 })
    return (res ?? []).map(transformTaxRate)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new DuettClient(credentials)
    const res = await client.get<DuettExpense[]>('expense/v2', { page: params.page ?? 1 })
    return (res ?? []).map(transformExpense)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new DuettClient(credentials)
    const res = await client.get<DuettCreditMemo[]>('creditnote/v2', { page: params.page ?? 1 })
    return (res ?? []).map(transformCreditMemo)
  }

  // --- Orders ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new DuettClient(credentials)
    const res = await client.get<DuettOrder[]>('order/v2', { page: params.page ?? 1 })
    return (res ?? []).map(transformOrder)
  }

  // --- Sales Orders ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new DuettClient(credentials)
    const res = await client.get<DuettSalesOrder[]>('order/v2', { page: params.page ?? 1 })
    return (res ?? []).map(transformSalesOrder)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PurchaseOrder[]> {
    const client = new DuettClient(credentials)
    const res = await client.get<DuettPurchaseOrder[]>('purchaseorder/v2', { page: params.page ?? 1 })
    return (res ?? []).map(transformPurchaseOrder)
  }
}
