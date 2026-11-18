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
import type { Organization } from '../../schema/organization'

import {
  buildAuthUrl,
  exchangeCode as doExchangeCode,
  refreshCredentials as doRefreshCredentials,
} from './auth'
import { SnelStartClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type SnelStartInvoice } from './transform/invoice'
import { transformBill, type SnelStartBill } from './transform/bill'
import { transformContact, type SnelStartContact } from './transform/contact'
import { transformAccount, type SnelStartAccount } from './transform/account'
import { transformJournal, type SnelStartBoeking } from './transform/journal'
import { transformOrganization, type SnelStartOrganization } from './transform/organization'
import { transformExpense, type SnelStartExpense } from './transform/expense'
import { transformTaxRate, type SnelStartTaxRate } from './transform/taxrate'
import { transformTransaction, type SnelStartTransaction } from './transform/transaction'
import { transformCreditMemo, type SnelStartCreditMemo } from './transform/creditmemo'
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class SnelStartAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'snelstart'
  readonly version = '0.1.0'

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return doExchangeCode(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefreshCredentials(credentials)
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new SnelStartClient(credentials)
    const res = await client.get<SnelStartOrganization>('bedrijf')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new SnelStartClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const skip = (page - 1) * limit
    const res = await client.get<SnelStartInvoice[]>('verkoopfacturen', {
      $skip: skip,
      $top: limit,
    })
    return (res ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new SnelStartClient(credentials)
    const res = await client.get<SnelStartInvoice>(`verkoopfacturen/${id}`)
    return transformInvoice(res)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new SnelStartClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const skip = (page - 1) * limit
    const res = await client.get<SnelStartBill[]>('inkoopfacturen', {
      $skip: skip,
      $top: limit,
    })
    return (res ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new SnelStartClient(credentials)
    const res = await client.get<SnelStartBill>(`inkoopfacturen/${id}`)
    return transformBill(res)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new SnelStartClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const skip = (page - 1) * limit
    const res = await client.get<SnelStartContact[]>('relaties', {
      $skip: skip,
      $top: limit,
    })
    return (res ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new SnelStartClient(credentials)
    const res = await client.get<SnelStartContact>(`relaties/${id}`)
    return transformContact(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new SnelStartClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const skip = (page - 1) * limit
    const res = await client.get<SnelStartAccount[]>('grootboekrekeningen', {
      $skip: skip,
      $top: limit,
    })
    return (res ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new SnelStartClient(credentials)
    const res = await client.get<SnelStartAccount>(`grootboekrekeningen/${id}`)
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new SnelStartClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const skip = (page - 1) * limit
    const res = await client.get<SnelStartBoeking[]>('boekingen', {
      $skip: skip,
      $top: limit,
    })
    return (res ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new SnelStartClient(credentials)
    const res = await client.get<SnelStartBoeking>(`boekingen/${id}`)
    return transformJournal(res)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new SnelStartClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const skip = (page - 1) * limit
    const res = await client.get<SnelStartTransaction[]>('bankboekingen', {
      $skip: skip,
      $top: limit,
    })
    return (res ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new SnelStartClient(credentials)
    const res = await client.get<SnelStartTransaction>(`bankboekingen/${id}`)
    return transformTransaction(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new SnelStartClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const skip = (page - 1) * limit
    const res = await client.get<SnelStartTaxRate[]>('btwtarieven', {
      $skip: skip,
      $top: limit,
    })
    return (res ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new SnelStartClient(credentials)
    const res = await client.get<SnelStartTaxRate>(`btwtarieven/${id}`)
    return transformTaxRate(res)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new SnelStartClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const skip = (page - 1) * limit
    const res = await client.get<SnelStartExpense[]>('inkoopfacturen', {
      $skip: skip,
      $top: limit,
      $filter: "soort eq 'Kosten'",
    })
    return (res ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new SnelStartClient(credentials)
    const res = await client.get<SnelStartExpense>(`inkoopfacturen/${id}`)
    return transformExpense(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new SnelStartClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const skip = (page - 1) * limit
    const res = await client.get<SnelStartCreditMemo[]>('verkoopfacturen', {
      $skip: skip,
      $top: limit,
      $filter: 'factuurbedrag lt 0',
    })
    return (res ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new SnelStartClient(credentials)
    const res = await client.get<SnelStartCreditMemo>(`verkoopfacturen/${id}`)
    return transformCreditMemo(res)
  }
}
