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

import { buildAuthUrl, exchangeCode, refreshCredentials as doRefreshCredentials } from './auth'
import { QuipuClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type QuipuInvoice } from './transform/invoice'
import { transformBill, type QuipuBill } from './transform/bill'
import { transformContact, type QuipuContact } from './transform/contact'
import { transformAccount, type QuipuAccount } from './transform/account'
import { transformJournal, type QuipuJournal } from './transform/journal'
import { transformOrganization, type QuipuOrganization } from './transform/organization'
import { transformTaxRate, type QuipuTaxRate } from './transform/taxrate'
import { transformExpense, type QuipuExpense } from './transform/expense'
import { transformCreditMemo, type QuipuCreditMemo } from './transform/creditmemo'
import { transformTransaction, type QuipuTransaction } from './transform/transaction'

export class QuipuAdapter implements AccountingAdapter {
  readonly platform = 'quipu'
  readonly version = '0.1.0'

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeCode(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefreshCredentials(credentials)
  }

  private paginationParams(params: QueryParams): Record<string, unknown> {
    return {
      page_size: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      page: params.page ?? 1,
    }
  }

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new QuipuClient(credentials)
    const res = await client.get<QuipuOrganization>('company')
    return transformOrganization(res)
  }

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new QuipuClient(credentials)
    const res = await client.get<QuipuInvoice[]>('invoices', this.paginationParams(params))
    return (res ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new QuipuClient(credentials)
    const res = await client.get<QuipuInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new QuipuClient(credentials)
    const res = await client.get<QuipuBill[]>('received_invoices', this.paginationParams(params))
    return (res ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new QuipuClient(credentials)
    const res = await client.get<QuipuBill>(`received_invoices/${id}`)
    return transformBill(res)
  }

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new QuipuClient(credentials)
    const res = await client.get<QuipuContact[]>('contacts', this.paginationParams(params))
    return (res ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new QuipuClient(credentials)
    const res = await client.get<QuipuContact>(`contacts/${id}`)
    return transformContact(res)
  }

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new QuipuClient(credentials)
    const res = await client.get<QuipuAccount[]>('accounts', this.paginationParams(params))
    return (res ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new QuipuClient(credentials)
    const res = await client.get<QuipuAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new QuipuClient(credentials)
    const res = await client.get<QuipuJournal[]>('journals', this.paginationParams(params))
    return (res ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new QuipuClient(credentials)
    const res = await client.get<QuipuJournal>(`journals/${id}`)
    return transformJournal(res)
  }

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new QuipuClient(credentials)
    const res = await client.get<QuipuTaxRate[]>('taxes', this.paginationParams(params))
    return (res ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new QuipuClient(credentials)
    const res = await client.get<QuipuTaxRate>(`taxes/${id}`)
    return transformTaxRate(res)
  }

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new QuipuClient(credentials)
    const res = await client.get<QuipuExpense[]>('paysheets', this.paginationParams(params))
    return (res ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new QuipuClient(credentials)
    const res = await client.get<QuipuExpense>(`paysheets/${id}`)
    return transformExpense(res)
  }

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new QuipuClient(credentials)
    const res = await client.get<QuipuCreditMemo[]>('credit_notes', this.paginationParams(params))
    return (res ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new QuipuClient(credentials)
    const res = await client.get<QuipuCreditMemo>(`credit_notes/${id}`)
    return transformCreditMemo(res)
  }

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new QuipuClient(credentials)
    const res = await client.get<QuipuTransaction[]>('transactions', this.paginationParams(params))
    return (res ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new QuipuClient(credentials)
    const res = await client.get<QuipuTransaction>(`transactions/${id}`)
    return transformTransaction(res)
  }
}
