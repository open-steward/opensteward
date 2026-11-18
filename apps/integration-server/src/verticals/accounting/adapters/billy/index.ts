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
import { BillyClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import { transformInvoice, type BillyInvoice } from './transform/invoice'
import { transformBill, type BillyBill } from './transform/bill'
import { transformContact, type BillyContact } from './transform/contact'
import { transformAccount, type BillyAccount } from './transform/account'
import { transformJournal, type BillyDaybookTransaction } from './transform/journal'
import { transformOrganization, type BillyOrganization } from './transform/organization'
import { transformExpense, type BillyExpense } from './transform/expense'
import { transformTaxRate, type BillyTaxRate } from './transform/taxrate'
import { transformTransaction, type BillyBankPayment } from './transform/transaction'
import { transformCreditMemo, type BillyCreditMemo } from './transform/creditmemo'
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class BillyAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'billy'
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
    const client = new BillyClient(credentials)
    const res = await client.get<{ organization: BillyOrganization }>('organization')
    return transformOrganization(res.organization)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new BillyClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 1000)
    const res = await client.get<{ invoices: BillyInvoice[] }>('invoices', {
      page,
      pageSize: limit,
    })
    return (res.invoices ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new BillyClient(credentials)
    const res = await client.get<{ invoice: BillyInvoice }>(`invoices/${id}`)
    return transformInvoice(res.invoice)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new BillyClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 1000)
    const res = await client.get<{ bills: BillyBill[] }>('bills', {
      page,
      pageSize: limit,
    })
    return (res.bills ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new BillyClient(credentials)
    const res = await client.get<{ bill: BillyBill }>(`bills/${id}`)
    return transformBill(res.bill)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new BillyClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 1000)
    const res = await client.get<{ contacts: BillyContact[] }>('contacts', {
      page,
      pageSize: limit,
    })
    return (res.contacts ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new BillyClient(credentials)
    const res = await client.get<{ contact: BillyContact }>(`contacts/${id}`)
    return transformContact(res.contact)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new BillyClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 1000)
    const res = await client.get<{ accounts: BillyAccount[] }>('accounts', {
      page,
      pageSize: limit,
    })
    return (res.accounts ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new BillyClient(credentials)
    const res = await client.get<{ account: BillyAccount }>(`accounts/${id}`)
    return transformAccount(res.account)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new BillyClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 1000)
    const res = await client.get<{ daybookTransactions: BillyDaybookTransaction[] }>(
      'daybookTransactions',
      { page, pageSize: limit },
    )
    return (res.daybookTransactions ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new BillyClient(credentials)
    const res = await client.get<{ daybookTransaction: BillyDaybookTransaction }>(
      `daybookTransactions/${id}`,
    )
    return transformJournal(res.daybookTransaction)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new BillyClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 1000)
    const res = await client.get<{ bankPayments: BillyBankPayment[] }>('bankPayments', {
      page,
      pageSize: limit,
    })
    return (res.bankPayments ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new BillyClient(credentials)
    const res = await client.get<{ bankPayment: BillyBankPayment }>(`bankPayments/${id}`)
    return transformTransaction(res.bankPayment)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new BillyClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 1000)
    const res = await client.get<{ taxRates: BillyTaxRate[] }>('taxRates', {
      page,
      pageSize: limit,
    })
    return (res.taxRates ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new BillyClient(credentials)
    const res = await client.get<{ taxRate: BillyTaxRate }>(`taxRates/${id}`)
    return transformTaxRate(res.taxRate)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new BillyClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 1000)
    const res = await client.get<{ bills: BillyExpense[] }>('bills', {
      page,
      pageSize: limit,
      type: 'expense',
    })
    return (res.bills ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new BillyClient(credentials)
    const res = await client.get<{ bill: BillyExpense }>(`bills/${id}`)
    return transformExpense(res.bill)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new BillyClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 1000)
    const res = await client.get<{ invoices: BillyCreditMemo[] }>('invoices', {
      page,
      pageSize: limit,
      isCreditNote: true,
    })
    return (res.invoices ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new BillyClient(credentials)
    const res = await client.get<{ invoice: BillyCreditMemo }>(`invoices/${id}`)
    return transformCreditMemo(res.invoice)
  }
}
