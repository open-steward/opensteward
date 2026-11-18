import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Journal } from '../../schema/journal'
import type { Organization } from '../../schema/organization'
import type { TaxRate } from '../../schema/taxrate'
import type { Expense } from '../../schema/expense'
import type { CreditMemo } from '../../schema/creditmemo'
import type { Transaction } from '../../schema/transaction'

import { buildAuthUrl, exchangeCode, refreshAccessToken } from './auth'
import { AnfixClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type AnfixInvoice } from './transform/invoice'
import { transformBill, type AnfixBill } from './transform/bill'
import { transformContact, type AnfixContact } from './transform/contact'
import { transformAccount, type AnfixAccount } from './transform/account'
import { transformJournal, type AnfixJournal } from './transform/journal'
import { transformOrganization, type AnfixOrganization } from './transform/organization'
import { transformTaxRate, type AnfixTaxRate } from './transform/taxrate'
import { transformExpense, type AnfixExpense } from './transform/expense'
import { transformCreditMemo, type AnfixCreditMemo } from './transform/creditmemo'
import { transformTransaction, type AnfixTransaction } from './transform/transaction'

interface AnfixAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}

export class AnfixAdapter implements AccountingAdapter {
  readonly platform = 'anfix'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: AnfixAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, (overrideScopes ?? this.scopes), state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return exchangeCode(code, this.clientId, this.clientSecret, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) throw new Error('No refresh token available')
    return refreshAccessToken(credentials.refreshToken, this.clientId, this.clientSecret)
  }

  private paginationParams(params: QueryParams): Record<string, unknown> {
    return {
      limit: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      page: params.page ?? 1,
    }
  }

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new AnfixClient(credentials)
    const res = await client.get<AnfixOrganization>('empresa')
    return transformOrganization(res)
  }

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new AnfixClient(credentials)
    const res = await client.get<AnfixInvoice[]>('facturas', this.paginationParams(params))
    return (res ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new AnfixClient(credentials)
    const res = await client.get<AnfixInvoice>(`facturas/${id}`)
    return transformInvoice(res)
  }

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new AnfixClient(credentials)
    const res = await client.get<AnfixBill[]>('facturas-recibidas', this.paginationParams(params))
    return (res ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new AnfixClient(credentials)
    const res = await client.get<AnfixBill>(`facturas-recibidas/${id}`)
    return transformBill(res)
  }

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new AnfixClient(credentials)
    const res = await client.get<AnfixContact[]>('contactos', this.paginationParams(params))
    return (res ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new AnfixClient(credentials)
    const res = await client.get<AnfixContact>(`contactos/${id}`)
    return transformContact(res)
  }

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new AnfixClient(credentials)
    const res = await client.get<AnfixAccount[]>('cuentas', this.paginationParams(params))
    return (res ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new AnfixClient(credentials)
    const res = await client.get<AnfixAccount>(`cuentas/${id}`)
    return transformAccount(res)
  }

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new AnfixClient(credentials)
    const res = await client.get<AnfixJournal[]>('asientos', this.paginationParams(params))
    return (res ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new AnfixClient(credentials)
    const res = await client.get<AnfixJournal>(`asientos/${id}`)
    return transformJournal(res)
  }

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new AnfixClient(credentials)
    const res = await client.get<AnfixTaxRate[]>('tipos-iva', this.paginationParams(params))
    return (res ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new AnfixClient(credentials)
    const res = await client.get<AnfixTaxRate>(`tipos-iva/${id}`)
    return transformTaxRate(res)
  }

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new AnfixClient(credentials)
    const res = await client.get<AnfixExpense[]>('gastos', this.paginationParams(params))
    return (res ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new AnfixClient(credentials)
    const res = await client.get<AnfixExpense>(`gastos/${id}`)
    return transformExpense(res)
  }

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new AnfixClient(credentials)
    const res = await client.get<AnfixCreditMemo[]>('facturas-rectificativas', this.paginationParams(params))
    return (res ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new AnfixClient(credentials)
    const res = await client.get<AnfixCreditMemo>(`facturas-rectificativas/${id}`)
    return transformCreditMemo(res)
  }

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new AnfixClient(credentials)
    const res = await client.get<AnfixTransaction[]>('movimientos', this.paginationParams(params))
    return (res ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new AnfixClient(credentials)
    const res = await client.get<AnfixTransaction>(`movimientos/${id}`)
    return transformTransaction(res)
  }
}
