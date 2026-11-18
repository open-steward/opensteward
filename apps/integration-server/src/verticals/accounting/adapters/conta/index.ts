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

import { ContaClient } from './client'
import { buildAuthUrl, exchangeCode as authExchangeCode, refreshAccessToken } from './auth'

import { transformInvoice, type ContaInvoice } from './transform/invoice'
import { transformContact, type ContaContact } from './transform/contact'
import { transformAccount, type ContaAccount } from './transform/account'
import { transformBill, type ContaBill } from './transform/bill'
import { transformJournal, type ContaJournal } from './transform/journal'
import { transformTransaction, type ContaTransaction } from './transform/transaction'
import { transformTaxRate, type ContaTaxRate } from './transform/taxrate'
import { transformExpense, type ContaExpense } from './transform/expense'
import { transformCreditMemo, type ContaCreditMemo } from './transform/creditmemo'
import { transformOrder, type ContaOrder } from './transform/order'
import { transformSalesOrder, type ContaSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type ContaPurchaseOrder } from './transform/purchaseorder'
import { transformOrganization, type ContaOrganization } from './transform/organization'

interface ContaAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}

export class ContaAdapter implements AccountingAdapter {
  readonly platform = 'conta'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: ContaAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, (overrideScopes ?? this.scopes), state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return authExchangeCode(code, this.clientId, this.clientSecret, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) throw new Error('No refresh token available')
    return refreshAccessToken(credentials.refreshToken, this.clientId, this.clientSecret)
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new ContaClient(credentials)
    const res = await client.get<ContaOrganization>('company')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new ContaClient(credentials)
    const res = await client.get<ContaInvoice[]>('invoices', params)
    return (res ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new ContaClient(credentials)
    const res = await client.get<ContaInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new ContaClient(credentials)
    const res = await client.get<ContaContact[]>('contacts', params)
    return (res ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new ContaClient(credentials)
    const res = await client.get<ContaContact>(`contacts/${id}`)
    return transformContact(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new ContaClient(credentials)
    const res = await client.get<ContaAccount[]>('accounts', params)
    return (res ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new ContaClient(credentials)
    const res = await client.get<ContaAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new ContaClient(credentials)
    const res = await client.get<ContaBill[]>('bills', params)
    return (res ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new ContaClient(credentials)
    const res = await client.get<ContaBill>(`bills/${id}`)
    return transformBill(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new ContaClient(credentials)
    const res = await client.get<ContaJournal[]>('journals', params)
    return (res ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new ContaClient(credentials)
    const res = await client.get<ContaJournal>(`journals/${id}`)
    return transformJournal(res)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new ContaClient(credentials)
    const res = await client.get<ContaTransaction[]>('transactions', params)
    return (res ?? []).map(transformTransaction)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new ContaClient(credentials)
    const res = await client.get<ContaTaxRate[]>('tax-rates', params)
    return (res ?? []).map(transformTaxRate)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new ContaClient(credentials)
    const res = await client.get<ContaExpense[]>('expenses', params)
    return (res ?? []).map(transformExpense)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new ContaClient(credentials)
    const res = await client.get<ContaCreditMemo[]>('credit-notes', params)
    return (res ?? []).map(transformCreditMemo)
  }

  // --- Orders ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new ContaClient(credentials)
    const res = await client.get<ContaOrder[]>('orders', params)
    return (res ?? []).map(transformOrder)
  }

  // --- Sales Orders ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new ContaClient(credentials)
    const res = await client.get<ContaSalesOrder[]>('sales-orders', params)
    return (res ?? []).map(transformSalesOrder)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PurchaseOrder[]> {
    const client = new ContaClient(credentials)
    const res = await client.get<ContaPurchaseOrder[]>('purchase-orders', params)
    return (res ?? []).map(transformPurchaseOrder)
  }
}
