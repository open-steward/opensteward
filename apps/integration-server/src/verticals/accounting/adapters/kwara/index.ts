import { simpleApiKey } from '@opensteward/shared'
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { TaxRate } from '../../schema/taxrate'
import type { Organization } from '../../schema/organization'
import type { Transaction } from '../../schema/transaction'
import type { Journal } from '../../schema/journal'
import type { Expense } from '../../schema/expense'
import type { CreditMemo } from '../../schema/creditmemo'
import type { Order } from '../../schema/order'
import type { SalesOrder } from '../../schema/salesorder'
import type { PurchaseOrder } from '../../schema/purchaseorder'

import { buildAuthUrl, exchangeCode, refreshCredentials } from './auth'
import { KwaraClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import { transformInvoice, type KwaraLoan } from './transform/invoice'
import { transformContact, type KwaraMember } from './transform/contact'
import { transformAccount, type KwaraSavingsProduct } from './transform/account'
import { transformOrganization, type KwaraOrganisation } from './transform/organization'
import { transformTransaction, type KwaraTransaction } from './transform/transaction'

interface KwaraAdapterConfig {
  apiKey: string
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class KwaraAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'kwara'
  readonly version = '0.1.0'

  private readonly config: KwaraAdapterConfig

  constructor(config: KwaraAdapterConfig) {
    this.config = config
  }

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeCode(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshCredentials(credentials)
  }

  private paginationParams(params: QueryParams): Record<string, unknown> {
    return {
      page: params.page ?? 1,
      page_size: params.limit ?? DEFAULT_PAGE_SIZE,
    }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new KwaraClient(credentials)
    const raw = await client.get<KwaraOrganisation>('organisation')
    return transformOrganization(raw)
  }

  // --- Invoices (loans) ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new KwaraClient(credentials)
    const res = await client.get<{ data: KwaraLoan[] }>('loans', this.paginationParams(params))
    return (res.data ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new KwaraClient(credentials)
    const raw = await client.get<KwaraLoan>(`loans/${id}`)
    return transformInvoice(raw)
  }

  // --- Bills (no concept in Kwara) ---

  async listBills(_credentials: Credentials, _params: QueryParams): Promise<Bill[]> {
    return []
  }

  // --- Contacts (members) ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new KwaraClient(credentials)
    const res = await client.get<{ data: KwaraMember[] }>('members', this.paginationParams(params))
    return (res.data ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new KwaraClient(credentials)
    const raw = await client.get<KwaraMember>(`members/${id}`)
    return transformContact(raw)
  }

  // --- Accounts (savings products) ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new KwaraClient(credentials)
    const res = await client.get<{ data: KwaraSavingsProduct[] }>(
      'savings-products',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new KwaraClient(credentials)
    const raw = await client.get<KwaraSavingsProduct>(`savings-products/${id}`)
    return transformAccount(raw)
  }

  // --- Tax Rates (none) ---

  async listTaxRates(_credentials: Credentials, _params: QueryParams): Promise<TaxRate[]> {
    return []
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new KwaraClient(credentials)
    const res = await client.get<{ data: KwaraTransaction[] }>(
      'loan-transactions',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new KwaraClient(credentials)
    const raw = await client.get<KwaraTransaction>(`loan-transactions/${id}`)
    return transformTransaction(raw)
  }

  // --- Journals (none) ---

  async listJournals(_credentials: Credentials, _params: QueryParams): Promise<Journal[]> {
    return []
  }

  // --- Expenses (none) ---

  async listExpenses(_credentials: Credentials, _params: QueryParams): Promise<Expense[]> {
    return []
  }

  // --- Credit Memos (none) ---

  async listCreditMemos(_credentials: Credentials, _params: QueryParams): Promise<CreditMemo[]> {
    return []
  }

  // --- Orders (none) ---

  async listOrders(_credentials: Credentials, _params: QueryParams): Promise<Order[]> {
    return []
  }

  // --- Sales Orders (none) ---

  async listSalesOrders(_credentials: Credentials, _params: QueryParams): Promise<SalesOrder[]> {
    return []
  }

  // --- Purchase Orders (none) ---

  async listPurchaseOrders(
    _credentials: Credentials,
    _params: QueryParams,
  ): Promise<PurchaseOrder[]> {
    return []
  }
}
