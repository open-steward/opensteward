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
import { IpaidthatClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type IpaidthatInvoice } from './transform/invoice'
import { transformBill, type IpaidthatBill } from './transform/bill'
import { transformContact, type IpaidthatContact } from './transform/contact'
import { transformAccount, type IpaidthatAccount } from './transform/account'
import { transformJournal, type IpaidthatJournal } from './transform/journal'
import { transformOrganization, type IpaidthatOrganization } from './transform/organization'
import { transformTaxRate, type IpaidthatTaxRate } from './transform/taxrate'
import { transformTransaction, type IpaidthatTransaction } from './transform/transaction'
import { transformExpense, type IpaidthatExpense } from './transform/expense'
import { transformCreditMemo, type IpaidthatCreditMemo } from './transform/creditmemo'

interface IpaidthatListResponse<T> {
  data: T[]
  meta: { total: number; page: number; per_page: number }
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class IpaidthatAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'ipaidthat'
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
    const client = new IpaidthatClient(credentials)
    const res = await client.get<IpaidthatOrganization>('company')
    return transformOrganization(res)
  }

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new IpaidthatClient(credentials)
    const res = await client.get<IpaidthatListResponse<IpaidthatInvoice>>('invoices', this.paginationParams(params))
    return (res.data ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new IpaidthatClient(credentials)
    const res = await client.get<IpaidthatInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new IpaidthatClient(credentials)
    const res = await client.get<IpaidthatListResponse<IpaidthatBill>>('supplier_invoices', this.paginationParams(params))
    return (res.data ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new IpaidthatClient(credentials)
    const res = await client.get<IpaidthatBill>(`supplier_invoices/${id}`)
    return transformBill(res)
  }

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new IpaidthatClient(credentials)
    const res = await client.get<IpaidthatListResponse<IpaidthatContact>>('contacts', this.paginationParams(params))
    return (res.data ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new IpaidthatClient(credentials)
    const res = await client.get<IpaidthatContact>(`contacts/${id}`)
    return transformContact(res)
  }

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new IpaidthatClient(credentials)
    const res = await client.get<IpaidthatListResponse<IpaidthatAccount>>('accounts', this.paginationParams(params))
    return (res.data ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new IpaidthatClient(credentials)
    const res = await client.get<IpaidthatAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new IpaidthatClient(credentials)
    const res = await client.get<IpaidthatListResponse<IpaidthatJournal>>('journal_entries', this.paginationParams(params))
    return (res.data ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new IpaidthatClient(credentials)
    const res = await client.get<IpaidthatJournal>(`journal_entries/${id}`)
    return transformJournal(res)
  }

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new IpaidthatClient(credentials)
    const res = await client.get<IpaidthatListResponse<IpaidthatTaxRate>>('tax_rates', this.paginationParams(params))
    return (res.data ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new IpaidthatClient(credentials)
    const res = await client.get<IpaidthatTaxRate>(`tax_rates/${id}`)
    return transformTaxRate(res)
  }

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new IpaidthatClient(credentials)
    const res = await client.get<IpaidthatListResponse<IpaidthatTransaction>>('transactions', this.paginationParams(params))
    return (res.data ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new IpaidthatClient(credentials)
    const res = await client.get<IpaidthatTransaction>(`transactions/${id}`)
    return transformTransaction(res)
  }

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new IpaidthatClient(credentials)
    const res = await client.get<IpaidthatListResponse<IpaidthatExpense>>('expenses', this.paginationParams(params))
    return (res.data ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new IpaidthatClient(credentials)
    const res = await client.get<IpaidthatExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new IpaidthatClient(credentials)
    const res = await client.get<IpaidthatListResponse<IpaidthatCreditMemo>>('credit_notes', this.paginationParams(params))
    return (res.data ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new IpaidthatClient(credentials)
    const res = await client.get<IpaidthatCreditMemo>(`credit_notes/${id}`)
    return transformCreditMemo(res)
  }
}
