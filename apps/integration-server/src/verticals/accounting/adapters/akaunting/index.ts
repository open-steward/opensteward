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
import { AkauntingClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type AkauntingInvoice } from './transform/invoice'
import { transformBill, type AkauntingBill } from './transform/bill'
import { transformContact, type AkauntingContact } from './transform/contact'
import { transformAccount, type AkauntingAccount } from './transform/account'
import { transformJournal, type AkauntingJournal } from './transform/journal'
import { transformOrganization, type AkauntingOrganization } from './transform/organization'
import { transformExpense, type AkauntingExpense } from './transform/expense'
import { transformTaxRate, type AkauntingTaxRate } from './transform/taxrate'
import { transformTransaction, type AkauntingTransaction } from './transform/transaction'
import { transformCreditMemo, type AkauntingCreditMemo } from './transform/creditmemo'

function companyPath(credentials: Credentials): string {
  return credentials.tenantId ? `companies/${credentials.tenantId}` : ''
}

function resource(credentials: Credentials, name: string): string {
  const prefix = companyPath(credentials)
  return prefix ? `${prefix}/${name}` : name
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class AkauntingAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'akaunting'
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
    const client = new AkauntingClient(credentials)
    const prefix = companyPath(credentials)
    const path = prefix || 'companies/1'
    const res = await client.get<{ data: AkauntingOrganization }>(path)
    return transformOrganization(res.data)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new AkauntingClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<{ data: AkauntingInvoice[] }>(resource(credentials, 'invoices'), {
      page,
      limit,
    })
    return (res.data ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new AkauntingClient(credentials)
    const res = await client.get<{ data: AkauntingInvoice }>(
      resource(credentials, `invoices/${id}`),
    )
    return transformInvoice(res.data)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new AkauntingClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<{ data: AkauntingBill[] }>(resource(credentials, 'bills'), {
      page,
      limit,
    })
    return (res.data ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new AkauntingClient(credentials)
    const res = await client.get<{ data: AkauntingBill }>(resource(credentials, `bills/${id}`))
    return transformBill(res.data)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new AkauntingClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<{ data: AkauntingContact[] }>(
      resource(credentials, 'contacts'),
      { page, limit },
    )
    return (res.data ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new AkauntingClient(credentials)
    const res = await client.get<{ data: AkauntingContact }>(
      resource(credentials, `contacts/${id}`),
    )
    return transformContact(res.data)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new AkauntingClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<{ data: AkauntingAccount[] }>(
      resource(credentials, 'accounts'),
      { page, limit },
    )
    return (res.data ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new AkauntingClient(credentials)
    const res = await client.get<{ data: AkauntingAccount }>(
      resource(credentials, `accounts/${id}`),
    )
    return transformAccount(res.data)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new AkauntingClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<{ data: AkauntingJournal[] }>(
      resource(credentials, 'transactions'),
      { page, limit },
    )
    return (res.data ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new AkauntingClient(credentials)
    const res = await client.get<{ data: AkauntingJournal }>(
      resource(credentials, `transactions/${id}`),
    )
    return transformJournal(res.data)
  }

  // --- Transactions ---

  async listTransactions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Transaction[]> {
    const client = new AkauntingClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<{ data: AkauntingTransaction[] }>(
      resource(credentials, 'transactions'),
      { page, limit },
    )
    return (res.data ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new AkauntingClient(credentials)
    const res = await client.get<{ data: AkauntingTransaction }>(
      resource(credentials, `transactions/${id}`),
    )
    return transformTransaction(res.data)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new AkauntingClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<{ data: AkauntingTaxRate[] }>(resource(credentials, 'taxes'), {
      page,
      limit,
    })
    return (res.data ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new AkauntingClient(credentials)
    const res = await client.get<{ data: AkauntingTaxRate }>(
      resource(credentials, `taxes/${id}`),
    )
    return transformTaxRate(res.data)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new AkauntingClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<{ data: AkauntingExpense[] }>(resource(credentials, 'bills'), {
      page,
      limit,
      category_type: 'expense',
    })
    return (res.data ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new AkauntingClient(credentials)
    const res = await client.get<{ data: AkauntingExpense }>(
      resource(credentials, `bills/${id}`),
    )
    return transformExpense(res.data)
  }

  // --- Credit Memos ---

  async listCreditMemos(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<CreditMemo[]> {
    const client = new AkauntingClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<{ data: AkauntingCreditMemo[] }>(
      resource(credentials, 'credit-notes'),
      { page, limit },
    )
    return (res.data ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new AkauntingClient(credentials)
    const res = await client.get<{ data: AkauntingCreditMemo }>(
      resource(credentials, `credit-notes/${id}`),
    )
    return transformCreditMemo(res.data)
  }
}
