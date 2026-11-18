import { toCalendarDate } from '../shared/transform'
import { simpleApiKey } from '@opensteward/shared'
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Journal } from '../../schema/journal'
import type { Expense } from '../../schema/expense'
import type { Organization } from '../../schema/organization'
import type { Transaction } from '../../schema/transaction'
import type { TaxRate } from '../../schema/taxrate'

import { buildAuthUrl, exchangeCode, refreshCredentials as refreshCreds } from './auth'
import { BuiltAfricaClient, type BuiltPage } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, untransformInvoice, type BuiltAfricaInvoice } from './transform/invoice'
import { transformBill, type BuiltAfricaBill } from './transform/bill'
import { transformClient, transformSupplier, type BuiltAfricaClient as BuiltAfricaClientModel, type BuiltAfricaSupplier } from './transform/contact'
import { transformAccount, type BuiltAfricaAccount } from './transform/account'
import { transformJournal, untransformJournal, type BuiltAfricaJournal } from './transform/journal'
import { transformExpense, type BuiltAfricaExpense } from './transform/expense'
import { transformOrganization, type BuiltAfricaBusiness } from './transform/organization'
import { transformTransaction, type BuiltAfricaTransaction } from './transform/transaction'
import { transformTaxRate, type BuiltAfricaTaxRate } from './transform/taxrate'

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: creditmemo    — Built Africa has no credit note concept or endpoint; platform uses invoices/bills only.
// Unavailable: order         — Built Africa has no generic order endpoint; uses invoices and quick sales only.
// Unavailable: purchaseorder — Built Africa has no purchase order endpoint; uses bills for supplier payables only.
// Unavailable: salesorder    — Built Africa has no sales order endpoint; uses invoices and quick sales only.

// Connect Link: single API-key form (business-scoped bearer token)
const SIMPLE_API_KEY_FORM = simpleApiKey({
  label: 'API key',
  helpText: 'Generate a business-scoped token in the Built developer console (Settings → Developer → API Access). Each token is shown only once.',
})

export class BuiltAfricaAdapter implements AccountingAdapter {
  // Connect Link support — single API-key form
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'built-africa'
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

  private pageParams(params: QueryParams): Record<string, unknown> {
    return {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new BuiltAfricaClient(credentials)
    // GET /api/v3/countries returns business info in `current_business`
    const res = await client.get<{ current_business?: BuiltAfricaBusiness }>('countries')
    const biz = res.current_business ?? ({} as BuiltAfricaBusiness)
    return transformOrganization(biz)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new BuiltAfricaClient(credentials)
    const res = await client.get<BuiltPage<BuiltAfricaInvoice>>('invoices', this.pageParams(params))
    return (res.data ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new BuiltAfricaClient(credentials)
    const res = await client.get<BuiltAfricaInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new BuiltAfricaClient(credentials)
    const res = await client.post<BuiltAfricaInvoice>('invoices', untransformInvoice(data))
    return transformInvoice(res)
  }

  async updateInvoice(credentials: Credentials, id: string, data: Partial<Invoice>): Promise<Invoice> {
    const client = new BuiltAfricaClient(credentials)
    // Built uses POST /:id for updates
    const res = await client.post<BuiltAfricaInvoice>(`invoices/${id}`, untransformInvoice(data))
    return transformInvoice(res)
  }

  async deleteInvoice(credentials: Credentials, id: string): Promise<void> {
    const client = new BuiltAfricaClient(credentials)
    await client.delete(`invoices/${id}`)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new BuiltAfricaClient(credentials)
    const res = await client.get<BuiltPage<BuiltAfricaBill>>('bills', this.pageParams(params))
    return (res.data ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new BuiltAfricaClient(credentials)
    const res = await client.get<BuiltAfricaBill>(`bills/${id}`)
    return transformBill(res)
  }

  // --- Contacts (Customers + Suppliers) ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new BuiltAfricaClient(credentials)
    const [clientRes, supplierRes] = await Promise.all([
      client.get<BuiltPage<BuiltAfricaClientModel>>('clients', this.pageParams(params)),
      client.get<BuiltPage<BuiltAfricaSupplier>>('suppliers', this.pageParams(params)),
    ])
    const customers = (clientRes.data ?? []).map(transformClient)
    const suppliers = (supplierRes.data ?? []).map(transformSupplier)
    return [...customers, ...suppliers]
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new BuiltAfricaClient(credentials)
    if (id.startsWith('cust_')) {
      const rawId = id.slice(5)
      const res = await client.get<BuiltAfricaClientModel>(`clients/${rawId}`)
      return transformClient(res)
    }
    if (id.startsWith('supp_')) {
      const rawId = id.slice(5)
      const res = await client.get<BuiltAfricaSupplier>(`suppliers/${rawId}`)
      return transformSupplier(res)
    }
    throw new Error(`Invalid contact id format: "${id}". Expected cust_<n> or supp_<n>.`)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new BuiltAfricaClient(credentials)
    if (data.isSupplier && !data.isCustomer) {
      const res = await client.post<BuiltAfricaSupplier>('suppliers', {
        supplier_name: data.name ?? data.companyName,
        supplier_email: data.emails?.[0]?.email,
        supplier_phone: data.telephones?.[0]?.telephone,
        supplier_address: data.billingAddress?.address1,
      })
      return transformSupplier(res)
    }
    const res = await client.post<BuiltAfricaClientModel>('clients', {
      business_name: data.companyName ?? data.name,
      first_name: data.firstName,
      last_name: data.lastName,
      business_email: data.emails?.[0]?.email,
      phone_number: data.telephones?.[0]?.telephone,
      business_address: data.billingAddress?.address1,
    })
    return transformClient(res)
  }

  async updateContact(credentials: Credentials, id: string, data: Partial<Contact>): Promise<Contact> {
    const client = new BuiltAfricaClient(credentials)
    if (id.startsWith('supp_')) {
      const rawId = id.slice(5)
      const res = await client.post<BuiltAfricaSupplier>(`suppliers/${rawId}`, {
        supplier_name: data.name ?? data.companyName,
        supplier_email: data.emails?.[0]?.email,
        supplier_phone: data.telephones?.[0]?.telephone,
        supplier_address: data.billingAddress?.address1,
      })
      return transformSupplier(res)
    }
    const rawId = id.startsWith('cust_') ? id.slice(5) : id
    const res = await client.post<BuiltAfricaClientModel>(`clients/${rawId}`, {
      business_name: data.companyName ?? data.name,
      first_name: data.firstName,
      last_name: data.lastName,
      business_email: data.emails?.[0]?.email,
      phone_number: data.telephones?.[0]?.telephone,
      business_address: data.billingAddress?.address1,
    })
    return transformClient(res)
  }

  // --- Accounts (Chart of Accounts) ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new BuiltAfricaClient(credentials)
    const res = await client.get<BuiltPage<BuiltAfricaAccount> | BuiltAfricaAccount[]>('accounts', this.pageParams(params))
    const items = Array.isArray(res) ? res : (res as BuiltPage<BuiltAfricaAccount>).data ?? []
    return items.map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new BuiltAfricaClient(credentials)
    const res = await client.get<BuiltAfricaAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new BuiltAfricaClient(credentials)
    const res = await client.get<BuiltPage<BuiltAfricaJournal>>('journals', this.pageParams(params))
    return (res.data ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new BuiltAfricaClient(credentials)
    const res = await client.get<{ journal: BuiltAfricaJournal } | BuiltAfricaJournal>(`journals/${id}`)
    const raw = (res as { journal: BuiltAfricaJournal }).journal ?? (res as BuiltAfricaJournal)
    return transformJournal(raw)
  }

  async createJournal(credentials: Credentials, data: Partial<Journal>): Promise<Journal> {
    const client = new BuiltAfricaClient(credentials)
    const res = await client.post<{ journal: BuiltAfricaJournal } | BuiltAfricaJournal>('journals', untransformJournal(data))
    const raw = (res as { journal: BuiltAfricaJournal }).journal ?? (res as BuiltAfricaJournal)
    return transformJournal(raw)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new BuiltAfricaClient(credentials)
    const res = await client.get<BuiltPage<BuiltAfricaExpense>>('expenses', this.pageParams(params))
    return (res.data ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new BuiltAfricaClient(credentials)
    const res = await client.get<BuiltAfricaExpense>(`expenses/${id}`)
    return transformExpense(res)
  }

  async createExpense(credentials: Credentials, data: Partial<Expense>): Promise<Expense> {
    const client = new BuiltAfricaClient(credentials)
    // Canonical totalAmount is integer minor units; Built expects decimal major units
    const amountDecimal =
      data.totalAmount !== undefined && data.totalAmount !== null
        ? data.totalAmount / 100
        : undefined
    const res = await client.post<BuiltAfricaExpense>('expenses', {
      expense_account: data.accountId ? Number(data.accountId) : undefined,
      amount: amountDecimal,
      date: toCalendarDate(data.postedAt),
      description: data.name,
    })
    return transformExpense(res)
  }

  // --- Transactions (payment transactions) ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new BuiltAfricaClient(credentials)
    const res = await client.get<BuiltPage<BuiltAfricaTransaction> | BuiltAfricaTransaction[]>(
      'transactions',
      this.pageParams(params),
    )
    const items = Array.isArray(res) ? res : (res as BuiltPage<BuiltAfricaTransaction>).data ?? []
    return items.map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new BuiltAfricaClient(credentials)
    const res = await client.get<BuiltAfricaTransaction>(`transactions/${id}`)
    return transformTransaction(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new BuiltAfricaClient(credentials)
    const res = await client.get<BuiltPage<BuiltAfricaTaxRate> | BuiltAfricaTaxRate[]>(
      'taxes',
      this.pageParams(params),
    )
    const items = Array.isArray(res) ? res : (res as BuiltPage<BuiltAfricaTaxRate>).data ?? []
    return items.map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new BuiltAfricaClient(credentials)
    const res = await client.get<BuiltAfricaTaxRate>(`taxes/${id}`)
    return transformTaxRate(res)
  }
}
