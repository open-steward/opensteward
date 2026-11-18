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
import { TwentyFourSevenOfficeClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type TwentyFourSevenInvoice } from './transform/invoice'
import { transformBill, type TwentyFourSevenBill } from './transform/bill'
import { transformContact, type TwentyFourSevenContact } from './transform/contact'
import { transformAccount, type TwentyFourSevenAccount } from './transform/account'
import { transformJournal, type TwentyFourSevenJournal } from './transform/journal'
import { transformOrganization, type TwentyFourSevenOrganization } from './transform/organization'
import { transformExpense, type TwentyFourSevenExpense } from './transform/expense'
import { transformTaxRate, type TwentyFourSevenTaxRate } from './transform/taxrate'
import { transformTransaction, type TwentyFourSevenTransaction } from './transform/transaction'
import { transformCreditMemo, type TwentyFourSevenCreditMemo } from './transform/creditmemo'

export class TwentyFourSevenOfficeAdapter implements AccountingAdapter {
  readonly platform = 'twentyfoursevenoffice'
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
    const client = new TwentyFourSevenOfficeClient(credentials)
    const res = await client.get<{ company: TwentyFourSevenOrganization }>('company')
    return transformOrganization(res.company)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new TwentyFourSevenOfficeClient(credentials)
    const page = params.page ?? 1
    const pageSize = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<{ invoices: TwentyFourSevenInvoice[] }>('invoices', {
      page,
      pageSize,
    })
    return (res.invoices ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new TwentyFourSevenOfficeClient(credentials)
    const res = await client.get<{ invoice: TwentyFourSevenInvoice }>(`invoices/${id}`)
    return transformInvoice(res.invoice)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new TwentyFourSevenOfficeClient(credentials)
    const page = params.page ?? 1
    const pageSize = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<{ bills: TwentyFourSevenBill[] }>('supplierInvoices', {
      page,
      pageSize,
    })
    return (res.bills ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new TwentyFourSevenOfficeClient(credentials)
    const res = await client.get<{ bill: TwentyFourSevenBill }>(`supplierInvoices/${id}`)
    return transformBill(res.bill)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new TwentyFourSevenOfficeClient(credentials)
    const page = params.page ?? 1
    const pageSize = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<{ contacts: TwentyFourSevenContact[] }>('contacts', {
      page,
      pageSize,
    })
    return (res.contacts ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new TwentyFourSevenOfficeClient(credentials)
    const res = await client.get<{ contact: TwentyFourSevenContact }>(`contacts/${id}`)
    return transformContact(res.contact)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new TwentyFourSevenOfficeClient(credentials)
    const page = params.page ?? 1
    const pageSize = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<{ accounts: TwentyFourSevenAccount[] }>('accounts', {
      page,
      pageSize,
    })
    return (res.accounts ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new TwentyFourSevenOfficeClient(credentials)
    const res = await client.get<{ account: TwentyFourSevenAccount }>(`accounts/${id}`)
    return transformAccount(res.account)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new TwentyFourSevenOfficeClient(credentials)
    const page = params.page ?? 1
    const pageSize = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<{ journalEntries: TwentyFourSevenJournal[] }>(
      'journalEntries',
      { page, pageSize },
    )
    return (res.journalEntries ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new TwentyFourSevenOfficeClient(credentials)
    const res = await client.get<{ journalEntry: TwentyFourSevenJournal }>(
      `journalEntries/${id}`,
    )
    return transformJournal(res.journalEntry)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new TwentyFourSevenOfficeClient(credentials)
    const page = params.page ?? 1
    const pageSize = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<{ transactions: TwentyFourSevenTransaction[] }>('transactions', {
      page,
      pageSize,
    })
    return (res.transactions ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new TwentyFourSevenOfficeClient(credentials)
    const res = await client.get<{ transaction: TwentyFourSevenTransaction }>(
      `transactions/${id}`,
    )
    return transformTransaction(res.transaction)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new TwentyFourSevenOfficeClient(credentials)
    const page = params.page ?? 1
    const pageSize = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<{ taxCodes: TwentyFourSevenTaxRate[] }>('taxCodes', {
      page,
      pageSize,
    })
    return (res.taxCodes ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new TwentyFourSevenOfficeClient(credentials)
    const res = await client.get<{ taxCode: TwentyFourSevenTaxRate }>(`taxCodes/${id}`)
    return transformTaxRate(res.taxCode)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new TwentyFourSevenOfficeClient(credentials)
    const page = params.page ?? 1
    const pageSize = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<{ expenses: TwentyFourSevenExpense[] }>('expenses', {
      page,
      pageSize,
    })
    return (res.expenses ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new TwentyFourSevenOfficeClient(credentials)
    const res = await client.get<{ expense: TwentyFourSevenExpense }>(`expenses/${id}`)
    return transformExpense(res.expense)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new TwentyFourSevenOfficeClient(credentials)
    const page = params.page ?? 1
    const pageSize = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<{ creditNotes: TwentyFourSevenCreditMemo[] }>('creditNotes', {
      page,
      pageSize,
    })
    return (res.creditNotes ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new TwentyFourSevenOfficeClient(credentials)
    const res = await client.get<{ creditNote: TwentyFourSevenCreditMemo }>(`creditNotes/${id}`)
    return transformCreditMemo(res.creditNote)
  }
}
