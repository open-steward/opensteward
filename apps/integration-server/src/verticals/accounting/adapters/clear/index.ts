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
import { ClearClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type ClearInvoice } from './transform/invoice'
import { transformBill, type ClearBill } from './transform/bill'
import { transformContact, type ClearContact } from './transform/contact'
import { transformAccount, type ClearAccount } from './transform/account'
import { transformJournal, type ClearJournalEntry } from './transform/journal'
import { transformOrganization, type ClearOrganization } from './transform/organization'
import { transformTransaction, type ClearLedgerEntry } from './transform/transaction'
import { transformTaxRate, type ClearGSTRate } from './transform/taxrate'
import { transformExpense, type ClearExpense } from './transform/expense'
import { transformCreditMemo, type ClearCreditNote } from './transform/creditmemo'
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class ClearAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'clear'
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

  private paginationParams(params: QueryParams): Record<string, unknown> {
    return {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new ClearClient(credentials)
    const res = await client.get<ClearOrganization>('organization')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new ClearClient(credentials)
    const res = await client.get<ClearInvoice[]>('invoices', this.paginationParams(params))
    return (res ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new ClearClient(credentials)
    const res = await client.get<ClearInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new ClearClient(credentials)
    const res = await client.get<ClearBill[]>('purchase_invoices', this.paginationParams(params))
    return (res ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new ClearClient(credentials)
    const res = await client.get<ClearBill>(`purchase_invoices/${id}`)
    return transformBill(res)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new ClearClient(credentials)
    const res = await client.get<ClearContact[]>('contacts', this.paginationParams(params))
    return (res ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new ClearClient(credentials)
    const res = await client.get<ClearContact>(`contacts/${id}`)
    return transformContact(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new ClearClient(credentials)
    const res = await client.get<ClearAccount[]>('accounts', this.paginationParams(params))
    return (res ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new ClearClient(credentials)
    const res = await client.get<ClearAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new ClearClient(credentials)
    const res = await client.get<ClearJournalEntry[]>(
      'journal_entries',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new ClearClient(credentials)
    const res = await client.get<ClearJournalEntry>(`journal_entries/${id}`)
    return transformJournal(res)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new ClearClient(credentials)
    const res = await client.get<ClearLedgerEntry[]>(
      'ledger_entries',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new ClearClient(credentials)
    const res = await client.get<ClearLedgerEntry>(`ledger_entries/${id}`)
    return transformTransaction(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new ClearClient(credentials)
    const res = await client.get<ClearGSTRate[]>('gst_rates', this.paginationParams(params))
    return (res ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new ClearClient(credentials)
    const res = await client.get<ClearGSTRate>(`gst_rates/${id}`)
    return transformTaxRate(res)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new ClearClient(credentials)
    const res = await client.get<ClearExpense[]>('expenses', this.paginationParams(params))
    return (res ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new ClearClient(credentials)
    const res = await client.get<ClearExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new ClearClient(credentials)
    const res = await client.get<ClearCreditNote[]>('credit_notes', this.paginationParams(params))
    return (res ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new ClearClient(credentials)
    const res = await client.get<ClearCreditNote>(`credit_notes/${id}`)
    return transformCreditMemo(res)
  }
}
