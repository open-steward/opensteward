import { simpleApiKey } from '@opensteward/shared'
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Journal } from '../../schema/journal'
import type { Organization } from '../../schema/organization'
import type { TaxRate } from '../../schema/taxrate'
import type { Transaction } from '../../schema/transaction'
import type { Expense } from '../../schema/expense'
import type { CreditMemo } from '../../schema/creditmemo'

import { buildAuthUrl, exchangeCode, refreshCredentials as refreshCreds } from './auth'
import { EvolizClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type EvolizInvoice } from './transform/invoice'
import { transformBill, type EvolizBill } from './transform/bill'
import { transformContact, type EvolizContact } from './transform/contact'
import { transformAccount, type EvolizAccount } from './transform/account'
import { transformJournal, type EvolizJournal } from './transform/journal'
import { transformOrganization, type EvolizOrganization } from './transform/organization'
import { transformTaxRate, type EvolizTaxRate } from './transform/taxrate'
import { transformTransaction, type EvolizTransaction } from './transform/transaction'
import { transformExpense, type EvolizExpense } from './transform/expense'
import { transformCreditMemo, type EvolizCreditMemo } from './transform/creditmemo'

interface EvolizListResponse<T> {
  data: T[]
  meta: { total: number; current_page: number; per_page: number }
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class EvolizAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'evoliz'
  readonly version = '0.1.0'



  getAuthUrl(_state: string): string {
    return buildAuthUrl(_state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeCode(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshCreds(credentials)
  }

  private paginationParams(params: QueryParams): Record<string, unknown> {
    return {
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      page: params.page ?? 1,
    }
  }


  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new EvolizClient(credentials)
    const res = await client.get<EvolizOrganization>('company')
    return transformOrganization(res)
  }

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new EvolizClient(credentials)
    const res = await client.get<EvolizListResponse<EvolizInvoice>>('invoices', this.paginationParams(params))
    return (res.data ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new EvolizClient(credentials)
    const res = await client.get<EvolizInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new EvolizClient(credentials)
    const res = await client.get<EvolizListResponse<EvolizBill>>('buys', this.paginationParams(params))
    return (res.data ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new EvolizClient(credentials)
    const res = await client.get<EvolizBill>(`buys/${id}`)
    return transformBill(res)
  }

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new EvolizClient(credentials)
    const res = await client.get<EvolizListResponse<EvolizContact>>('clients', this.paginationParams(params))
    return (res.data ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new EvolizClient(credentials)
    const res = await client.get<EvolizContact>(`clients/${id}`)
    return transformContact(res)
  }

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new EvolizClient(credentials)
    const res = await client.get<EvolizListResponse<EvolizAccount>>('accounts', this.paginationParams(params))
    return (res.data ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new EvolizClient(credentials)
    const res = await client.get<EvolizAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new EvolizClient(credentials)
    const res = await client.get<EvolizListResponse<EvolizJournal>>('journal_entries', this.paginationParams(params))
    return (res.data ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new EvolizClient(credentials)
    const res = await client.get<EvolizJournal>(`journal_entries/${id}`)
    return transformJournal(res)
  }

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new EvolizClient(credentials)
    const res = await client.get<EvolizListResponse<EvolizTaxRate>>('taxes', this.paginationParams(params))
    return (res.data ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new EvolizClient(credentials)
    const res = await client.get<EvolizTaxRate>(`taxes/${id}`)
    return transformTaxRate(res)
  }

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new EvolizClient(credentials)
    const res = await client.get<EvolizListResponse<EvolizTransaction>>('bank_transactions', this.paginationParams(params))
    return (res.data ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new EvolizClient(credentials)
    const res = await client.get<EvolizTransaction>(`bank_transactions/${id}`)
    return transformTransaction(res)
  }

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new EvolizClient(credentials)
    const res = await client.get<EvolizListResponse<EvolizExpense>>('expenses', this.paginationParams(params))
    return (res.data ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new EvolizClient(credentials)
    const res = await client.get<EvolizExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new EvolizClient(credentials)
    const res = await client.get<EvolizListResponse<EvolizCreditMemo>>('credit_notes', this.paginationParams(params))
    return (res.data ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new EvolizClient(credentials)
    const res = await client.get<EvolizCreditMemo>(`credit_notes/${id}`)
    return transformCreditMemo(res)
  }
}
