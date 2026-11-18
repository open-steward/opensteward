import { simpleApiKey } from '@opensteward/shared'
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Journal } from '../../schema/journal'
import type { Organization } from '../../schema/organization'
import type { Transaction } from '../../schema/transaction'
import type { TaxRate } from '../../schema/taxrate'
import type { Expense } from '../../schema/expense'
import type { CreditMemo } from '../../schema/creditmemo'
import type { Order } from '../../schema/order'
import type { SalesOrder } from '../../schema/salesorder'
import type { PurchaseOrder } from '../../schema/purchaseorder'

import { buildAuthUrl, exchangeCode, refreshCredentials as refreshCreds } from './auth'
import { GiddhClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type GiddhVoucher } from './transform/invoice'
import { transformBill } from './transform/bill'
import { transformContact, type GiddhAccount } from './transform/contact'
import { transformAccount, type GiddhAccountRecord } from './transform/account'
import { transformJournal, type GiddhJournalVoucher } from './transform/journal'
import { transformOrganization, type GiddhCompany } from './transform/organization'
import { transformTransaction, type GiddhLedgerEntry } from './transform/transaction'
import { transformTaxRate, type GiddhTax } from './transform/taxrate'
import { transformExpense } from './transform/expense'
import { transformCreditMemo } from './transform/creditmemo'
import { transformOrder, type GiddhOrderVoucher } from './transform/order'
import { transformSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder } from './transform/purchaseorder'

interface GiddhAdapterConfig {
  companyUniqueName?: string
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class GiddhAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'giddh'
  readonly version = '0.1.0'

  /** paginationParams caps `count` at 50; the router and the sync worker ask for no more. */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  private companyUniqueName: string | undefined

  constructor(config: GiddhAdapterConfig = {}) {
    this.companyUniqueName = config.companyUniqueName
  }

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
      count: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      page: params.page ?? 1,
    }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new GiddhClient(credentials)
    const res = await client.get<{ body: GiddhCompany }>('company')
    return transformOrganization(res.body)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new GiddhClient(credentials)
    const res = await client.get<{ body: { results: GiddhVoucher[] } }>(
      'vouchers',
      { ...this.paginationParams(params), voucherType: 'SALES' },
    )
    return (res.body?.results ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new GiddhClient(credentials)
    const res = await client.get<{ body: GiddhVoucher }>(`vouchers/${id}`)
    return transformInvoice(res.body)
  }

  // --- Bills (Purchase Vouchers) ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new GiddhClient(credentials)
    const res = await client.get<{ body: { results: GiddhVoucher[] } }>(
      'vouchers',
      { ...this.paginationParams(params), voucherType: 'PURCHASE' },
    )
    return (res.body?.results ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new GiddhClient(credentials)
    const res = await client.get<{ body: GiddhVoucher }>(`vouchers/${id}`)
    return transformBill(res.body)
  }

  // --- Contacts (SUNDRYDEBTORS + SUNDRYCREDITORS) ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new GiddhClient(credentials)
    const pagination = this.paginationParams(params)
    const [debtorsRes, creditorsRes] = await Promise.all([
      client.get<{ body: { results: GiddhAccount[] } }>('accounts', { ...pagination, type: 'SUNDRYDEBTORS' }),
      client.get<{ body: { results: GiddhAccount[] } }>('accounts', { ...pagination, type: 'SUNDRYCREDITORS' }),
    ])
    const debtors = (debtorsRes.body?.results ?? []).map(transformContact)
    const creditors = (creditorsRes.body?.results ?? []).map(transformContact)
    return [...debtors, ...creditors]
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new GiddhClient(credentials)
    const res = await client.get<{ body: GiddhAccount }>(`accounts/${id}`)
    return transformContact(res.body)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new GiddhClient(credentials)
    const res = await client.get<{ body: { results: GiddhAccountRecord[] } }>(
      'accounts',
      this.paginationParams(params),
    )
    return (res.body?.results ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new GiddhClient(credentials)
    const res = await client.get<{ body: GiddhAccountRecord }>(`accounts/${id}`)
    return transformAccount(res.body)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new GiddhClient(credentials)
    const res = await client.get<{ body: { results: GiddhJournalVoucher[] } }>(
      'vouchers',
      { ...this.paginationParams(params), voucherType: 'JOURNAL' },
    )
    return (res.body?.results ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new GiddhClient(credentials)
    const res = await client.get<{ body: GiddhJournalVoucher }>(`vouchers/${id}`)
    return transformJournal(res.body)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new GiddhClient(credentials)
    const res = await client.get<{ body: { results: GiddhLedgerEntry[] } }>(
      'ledger',
      this.paginationParams(params),
    )
    return (res.body?.results ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new GiddhClient(credentials)
    const res = await client.get<{ body: GiddhLedgerEntry }>(`ledger/${id}`)
    return transformTransaction(res.body)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new GiddhClient(credentials)
    const res = await client.get<{ body: GiddhTax[] }>('taxes', this.paginationParams(params))
    return (res.body ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new GiddhClient(credentials)
    const res = await client.get<{ body: GiddhTax }>(`taxes/${id}`)
    return transformTaxRate(res.body)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new GiddhClient(credentials)
    const res = await client.get<{ body: { results: GiddhVoucher[] } }>(
      'vouchers',
      { ...this.paginationParams(params), voucherType: 'EXPENSE' },
    )
    return (res.body?.results ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new GiddhClient(credentials)
    const res = await client.get<{ body: GiddhVoucher }>(`vouchers/${id}`)
    return transformExpense(res.body)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new GiddhClient(credentials)
    const res = await client.get<{ body: { results: GiddhVoucher[] } }>(
      'vouchers',
      { ...this.paginationParams(params), voucherType: 'CREDIT NOTE' },
    )
    return (res.body?.results ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new GiddhClient(credentials)
    const res = await client.get<{ body: GiddhVoucher }>(`vouchers/${id}`)
    return transformCreditMemo(res.body)
  }

  // --- Orders ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new GiddhClient(credentials)
    const res = await client.get<{ body: { results: GiddhOrderVoucher[] } }>(
      'sales-orders',
      this.paginationParams(params),
    )
    return (res.body?.results ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new GiddhClient(credentials)
    const res = await client.get<{ body: GiddhOrderVoucher }>(`sales-orders/${id}`)
    return transformOrder(res.body)
  }

  // --- Sales Orders ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new GiddhClient(credentials)
    const res = await client.get<{ body: { results: GiddhOrderVoucher[] } }>(
      'sales-orders',
      this.paginationParams(params),
    )
    return (res.body?.results ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new GiddhClient(credentials)
    const res = await client.get<{ body: GiddhOrderVoucher }>(`sales-orders/${id}`)
    return transformSalesOrder(res.body)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new GiddhClient(credentials)
    const res = await client.get<{ body: { results: GiddhOrderVoucher[] } }>(
      'purchase-orders',
      this.paginationParams(params),
    )
    return (res.body?.results ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new GiddhClient(credentials)
    const res = await client.get<{ body: GiddhOrderVoucher }>(`purchase-orders/${id}`)
    return transformPurchaseOrder(res.body)
  }
}
