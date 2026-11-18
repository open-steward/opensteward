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
import { SinaoClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type SinaoInvoice } from './transform/invoice'
import { transformBill, type SinaoBill } from './transform/bill'
import { transformContact, type SinaoContact } from './transform/contact'
import { transformAccount, type SinaoAccount } from './transform/account'
import { transformJournal, type SinaoJournal } from './transform/journal'
import { transformOrganization, type SinaoOrganization } from './transform/organization'
import { transformTaxRate, type SinaoTaxRate } from './transform/taxrate'
import { transformTransaction, type SinaoTransaction } from './transform/transaction'
import { transformExpense, type SinaoExpense } from './transform/expense'
import { transformCreditMemo, type SinaoCreditMemo } from './transform/creditmemo'

interface SinaoListResponse<T> {
  data: T[]
  meta: { total: number; page: number; per_page: number }
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class SinaoAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'sinao'
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
    const client = new SinaoClient(credentials)
    const res = await client.get<SinaoOrganization>('company')
    return transformOrganization(res)
  }

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new SinaoClient(credentials)
    const res = await client.get<SinaoListResponse<SinaoInvoice>>('invoices', this.paginationParams(params))
    return (res.data ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new SinaoClient(credentials)
    const res = await client.get<SinaoInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new SinaoClient(credentials)
    const res = await client.get<SinaoListResponse<SinaoBill>>('supplier_invoices', this.paginationParams(params))
    return (res.data ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new SinaoClient(credentials)
    const res = await client.get<SinaoBill>(`supplier_invoices/${id}`)
    return transformBill(res)
  }

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new SinaoClient(credentials)
    const res = await client.get<SinaoListResponse<SinaoContact>>('contacts', this.paginationParams(params))
    return (res.data ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new SinaoClient(credentials)
    const res = await client.get<SinaoContact>(`contacts/${id}`)
    return transformContact(res)
  }

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new SinaoClient(credentials)
    const res = await client.get<SinaoListResponse<SinaoAccount>>('accounts', this.paginationParams(params))
    return (res.data ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new SinaoClient(credentials)
    const res = await client.get<SinaoAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new SinaoClient(credentials)
    const res = await client.get<SinaoListResponse<SinaoJournal>>('journal_entries', this.paginationParams(params))
    return (res.data ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new SinaoClient(credentials)
    const res = await client.get<SinaoJournal>(`journal_entries/${id}`)
    return transformJournal(res)
  }

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new SinaoClient(credentials)
    const res = await client.get<SinaoListResponse<SinaoTaxRate>>('tax_rates', this.paginationParams(params))
    return (res.data ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new SinaoClient(credentials)
    const res = await client.get<SinaoTaxRate>(`tax_rates/${id}`)
    return transformTaxRate(res)
  }

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new SinaoClient(credentials)
    const res = await client.get<SinaoListResponse<SinaoTransaction>>('transactions', this.paginationParams(params))
    return (res.data ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new SinaoClient(credentials)
    const res = await client.get<SinaoTransaction>(`transactions/${id}`)
    return transformTransaction(res)
  }

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new SinaoClient(credentials)
    const res = await client.get<SinaoListResponse<SinaoExpense>>('expenses', this.paginationParams(params))
    return (res.data ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new SinaoClient(credentials)
    const res = await client.get<SinaoExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new SinaoClient(credentials)
    const res = await client.get<SinaoListResponse<SinaoCreditMemo>>('credit_notes', this.paginationParams(params))
    return (res.data ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new SinaoClient(credentials)
    const res = await client.get<SinaoCreditMemo>(`credit_notes/${id}`)
    return transformCreditMemo(res)
  }
}
