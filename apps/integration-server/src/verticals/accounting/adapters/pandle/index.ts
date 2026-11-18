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
  refreshAccessToken as doRefreshAccessToken,
} from './auth'
import { PandleClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type PandleInvoice } from './transform/invoice'
import { transformBill, type PandleBill } from './transform/bill'
import { transformContact, type PandleContact } from './transform/contact'
import { transformAccount, type PandleAccount } from './transform/account'
import { transformJournal, type PandleJournal } from './transform/journal'
import { transformOrganization, type PandleOrganization } from './transform/organization'
import { transformExpense, type PandleExpense } from './transform/expense'
import { transformTaxRate, type PandleTaxRate } from './transform/taxrate'
import { transformTransaction, type PandleTransaction } from './transform/transaction'
import { transformCreditMemo, type PandleCreditMemo } from './transform/creditmemo'

type PandleConfig = {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}

function companyPath(credentials: Credentials): string {
  if (!credentials.tenantId) throw new Error('tenantId (company_id) is required for Pandle API calls')
  return `companies/${credentials.tenantId}`
}

export class PandleAdapter implements AccountingAdapter {
  readonly platform = 'pandle'
  readonly version = '0.1.0'

  private config: PandleConfig

  constructor(config: PandleConfig) {
    this.config = config
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.config.clientId, this.config.redirectUri, (overrideScopes ?? this.config.scopes), state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return doExchangeCode(code, this.config.clientId, this.config.clientSecret, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) throw new Error('No refresh token available')
    return doRefreshAccessToken(credentials.refreshToken, this.config.clientId, this.config.clientSecret)
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new PandleClient(credentials)
    const prefix = companyPath(credentials)
    const res = await client.get<{ company: PandleOrganization }>(prefix)
    return transformOrganization(res.company)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new PandleClient(credentials)
    const prefix = companyPath(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<{ sales_invoices: PandleInvoice[] }>(
      `${prefix}/sales_invoices`,
      { page, per_page: limit },
    )
    return (res.sales_invoices ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new PandleClient(credentials)
    const prefix = companyPath(credentials)
    const res = await client.get<{ sales_invoice: PandleInvoice }>(
      `${prefix}/sales_invoices/${id}`,
    )
    return transformInvoice(res.sales_invoice)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new PandleClient(credentials)
    const prefix = companyPath(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<{ purchase_invoices: PandleBill[] }>(
      `${prefix}/purchase_invoices`,
      { page, per_page: limit },
    )
    return (res.purchase_invoices ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new PandleClient(credentials)
    const prefix = companyPath(credentials)
    const res = await client.get<{ purchase_invoice: PandleBill }>(
      `${prefix}/purchase_invoices/${id}`,
    )
    return transformBill(res.purchase_invoice)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new PandleClient(credentials)
    const prefix = companyPath(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const [custRes, supRes] = await Promise.all([
      client.get<{ customers: PandleContact[] }>(`${prefix}/customers`, {
        page,
        per_page: limit,
      }),
      client.get<{ suppliers: PandleContact[] }>(`${prefix}/suppliers`, {
        page,
        per_page: limit,
      }),
    ])
    const customers = (custRes.customers ?? []).map((c) =>
      transformContact({ ...c, contact_type: c.contact_type || 'customer' }),
    )
    const suppliers = (supRes.suppliers ?? []).map((s) =>
      transformContact({ ...s, contact_type: s.contact_type || 'supplier' }),
    )
    return [...customers, ...suppliers]
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new PandleClient(credentials)
    const prefix = companyPath(credentials)
    // Try customers first, fall back to suppliers
    try {
      const res = await client.get<{ customer: PandleContact }>(
        `${prefix}/customers/${id}`,
      )
      return transformContact({ ...res.customer, contact_type: res.customer.contact_type || 'customer' })
    } catch {
      const res = await client.get<{ supplier: PandleContact }>(
        `${prefix}/suppliers/${id}`,
      )
      return transformContact({ ...res.supplier, contact_type: res.supplier.contact_type || 'supplier' })
    }
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new PandleClient(credentials)
    const prefix = companyPath(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<{ accounts: PandleAccount[] }>(
      `${prefix}/accounts`,
      { page, per_page: limit },
    )
    return (res.accounts ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new PandleClient(credentials)
    const prefix = companyPath(credentials)
    const res = await client.get<{ account: PandleAccount }>(`${prefix}/accounts/${id}`)
    return transformAccount(res.account)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new PandleClient(credentials)
    const prefix = companyPath(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<{ journal_entries: PandleJournal[] }>(
      `${prefix}/journal_entries`,
      { page, per_page: limit },
    )
    return (res.journal_entries ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new PandleClient(credentials)
    const prefix = companyPath(credentials)
    const res = await client.get<{ journal_entry: PandleJournal }>(
      `${prefix}/journal_entries/${id}`,
    )
    return transformJournal(res.journal_entry)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new PandleClient(credentials)
    const prefix = companyPath(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<{ bank_transactions: PandleTransaction[] }>(
      `${prefix}/bank_transactions`,
      { page, per_page: limit },
    )
    return (res.bank_transactions ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new PandleClient(credentials)
    const prefix = companyPath(credentials)
    const res = await client.get<{ bank_transaction: PandleTransaction }>(
      `${prefix}/bank_transactions/${id}`,
    )
    return transformTransaction(res.bank_transaction)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new PandleClient(credentials)
    const prefix = companyPath(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<{ tax_rates: PandleTaxRate[] }>(
      `${prefix}/tax_rates`,
      { page, per_page: limit },
    )
    return (res.tax_rates ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new PandleClient(credentials)
    const prefix = companyPath(credentials)
    const res = await client.get<{ tax_rate: PandleTaxRate }>(`${prefix}/tax_rates/${id}`)
    return transformTaxRate(res.tax_rate)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new PandleClient(credentials)
    const prefix = companyPath(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<{ expenses: PandleExpense[] }>(
      `${prefix}/expenses`,
      { page, per_page: limit },
    )
    return (res.expenses ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new PandleClient(credentials)
    const prefix = companyPath(credentials)
    const res = await client.get<{ expense: PandleExpense }>(`${prefix}/expenses/${id}`)
    return transformExpense(res.expense)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new PandleClient(credentials)
    const prefix = companyPath(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<{ credit_notes: PandleCreditMemo[] }>(
      `${prefix}/credit_notes`,
      { page, per_page: limit },
    )
    return (res.credit_notes ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new PandleClient(credentials)
    const prefix = companyPath(credentials)
    const res = await client.get<{ credit_note: PandleCreditMemo }>(
      `${prefix}/credit_notes/${id}`,
    )
    return transformCreditMemo(res.credit_note)
  }
}
