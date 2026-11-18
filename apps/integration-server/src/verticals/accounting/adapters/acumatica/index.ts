import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { CredentialField } from '@opensteward/shared'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Journal } from '../../schema/journal'
import type { Transaction } from '../../schema/transaction'
import type { TaxRate } from '../../schema/taxrate'
import type { Expense } from '../../schema/expense'
import type { CreditMemo } from '../../schema/creditmemo'
import type { Order } from '../../schema/order'
import type { SalesOrder } from '../../schema/salesorder'
import type { PurchaseOrder } from '../../schema/purchaseorder'
import type { Organization } from '../../schema/organization'

import { buildAuthUrl, exchangeCode, refreshAccessToken } from './auth'
import { AcumaticaClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, untransformInvoice, type AcumaticaInvoice } from './transform/invoice'
import { transformBill, type AcumaticaBill } from './transform/bill'
import { transformContact, type AcumaticaContact } from './transform/contact'
import { transformAccount, type AcumaticaAccount } from './transform/account'
import { transformJournal, untransformJournal, type AcumaticaJournal } from './transform/journal'
import { transformOrganization, type AcumaticaOrganization } from './transform/organization'
import { transformTransaction, type AcumaticaTransaction } from './transform/transaction'
import { transformTaxRate, type AcumaticaTaxRate } from './transform/taxrate'
import { transformExpense, type AcumaticaExpense } from './transform/expense'
import { transformCreditMemo, type AcumaticaCreditMemo } from './transform/creditmemo'
import { transformOrder, type AcumaticaOrder } from './transform/order'
import { transformSalesOrder, type AcumaticaSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type AcumaticaPurchaseOrder } from './transform/purchaseorder'

interface AcumaticaAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
  /**
   * Deployment-wide fallback site URL. The admin UI cannot set this, so a
   * Connect Link customer supplies their own (`oauthFields`), which is then
   * read back from `credentials.extra.instanceUrl`. Set it only when every
   * connection on this deployment is the same Acumatica site.
   */
  instanceUrl?: string
}

export class AcumaticaAdapter implements AccountingAdapter {
  readonly platform = 'acumatica'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]
  private instanceUrl: string | undefined

  constructor(config: AcumaticaAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes
    this.instanceUrl = config.instanceUrl
  }

  /** The customer's Acumatica site hosts the authorize, token and API endpoints. */
  oauthFields(): CredentialField[] {
    return [
      {
        name: 'instanceUrl',
        label: 'Acumatica site URL',
        type: 'url',
        required: true,
        placeholder: 'https://acme.acumatica.com',
        helpText:
          'The address you sign in to Acumatica at, including any site path (e.g. https://erp.example.com/AcumaticaERP).',
      },
    ]
  }

  getAuthUrl(
    state: string,
    overrideScopes?: string[],
    _codeChallenge?: string,
    inputs?: Record<string, string>,
  ): string {
    return buildAuthUrl(
      this.clientId,
      this.redirectUri,
      overrideScopes ?? this.scopes,
      state,
      inputs?.['instanceUrl'] ?? this.instanceUrl,
    )
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return exchangeCode(code, this.clientId, this.clientSecret, redirectUri, this.instanceUrl)
  }

  /** Exchange on the customer's site and remember it with the credentials. */
  async exchangeCodeWithInputs(
    code: string,
    redirectUri: string,
    inputs: Record<string, string>,
  ): Promise<Credentials> {
    return exchangeCode(
      code,
      this.clientId,
      this.clientSecret,
      redirectUri,
      inputs['instanceUrl'] ?? this.instanceUrl,
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) throw new Error('No refresh token available')
    const stored = credentials.extra?.['instanceUrl']
    const instanceUrl = typeof stored === 'string' && stored.trim() ? stored : this.instanceUrl
    return refreshAccessToken(credentials.refreshToken, this.clientId, this.clientSecret, instanceUrl)
  }

  private paginationParams(params: QueryParams): Record<string, unknown> {
    const skip = ((params.page ?? 1) - 1) * Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    return {
      $top: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      $skip: skip,
      ...(params.updatedAfter && {
        $filter: `LastModifiedDateTime gt datetimeoffset'${params.updatedAfter.toISOString()}'`,
      }),
    }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new AcumaticaClient(credentials)
    const res = await client.get<AcumaticaOrganization>('Company')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new AcumaticaClient(credentials)
    const res = await client.get<AcumaticaInvoice[]>('Invoice', this.paginationParams(params))
    return (res ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new AcumaticaClient(credentials)
    const res = await client.get<AcumaticaInvoice>(`Invoice/${id}`)
    return transformInvoice(res)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new AcumaticaClient(credentials)
    const res = await client.post<AcumaticaInvoice>('Invoice', untransformInvoice(data))
    return transformInvoice(res)
  }

  async updateInvoice(credentials: Credentials, id: string, data: Partial<Invoice>): Promise<Invoice> {
    const client = new AcumaticaClient(credentials)
    const res = await client.put<AcumaticaInvoice>(`Invoice/${id}`, untransformInvoice(data))
    return transformInvoice(res)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new AcumaticaClient(credentials)
    const res = await client.get<AcumaticaBill[]>('Bill', this.paginationParams(params))
    return (res ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new AcumaticaClient(credentials)
    const res = await client.get<AcumaticaBill>(`Bill/${id}`)
    return transformBill(res)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new AcumaticaClient(credentials)
    const res = await client.get<AcumaticaContact[]>('Contact', this.paginationParams(params))
    return (res ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new AcumaticaClient(credentials)
    const res = await client.get<AcumaticaContact>(`Contact/${id}`)
    return transformContact(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new AcumaticaClient(credentials)
    const res = await client.get<AcumaticaAccount[]>('Account', this.paginationParams(params))
    return (res ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new AcumaticaClient(credentials)
    const res = await client.get<AcumaticaAccount>(`Account/${id}`)
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new AcumaticaClient(credentials)
    const res = await client.get<AcumaticaJournal[]>('JournalTransaction', this.paginationParams(params))
    return (res ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new AcumaticaClient(credentials)
    const res = await client.get<AcumaticaJournal>(`JournalTransaction/${id}`)
    return transformJournal(res)
  }

  async createJournal(credentials: Credentials, data: Partial<Journal>): Promise<Journal> {
    const client = new AcumaticaClient(credentials)
    const res = await client.post<AcumaticaJournal>('JournalTransaction', untransformJournal(data))
    return transformJournal(res)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new AcumaticaClient(credentials)
    const res = await client.get<AcumaticaTransaction[]>('GLTran', this.paginationParams(params))
    return (res ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new AcumaticaClient(credentials)
    const res = await client.get<AcumaticaTransaction>(`GLTran/${id}`)
    return transformTransaction(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new AcumaticaClient(credentials)
    const res = await client.get<AcumaticaTaxRate[]>('TaxRate', this.paginationParams(params))
    return (res ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new AcumaticaClient(credentials)
    const res = await client.get<AcumaticaTaxRate>(`TaxRate/${id}`)
    return transformTaxRate(res)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new AcumaticaClient(credentials)
    const res = await client.get<AcumaticaExpense[]>('ExpenseClaim', this.paginationParams(params))
    return (res ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new AcumaticaClient(credentials)
    const res = await client.get<AcumaticaExpense>(`ExpenseClaim/${id}`)
    return transformExpense(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new AcumaticaClient(credentials)
    const res = await client.get<AcumaticaCreditMemo[]>('CreditMemo', this.paginationParams(params))
    return (res ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new AcumaticaClient(credentials)
    const res = await client.get<AcumaticaCreditMemo>(`CreditMemo/${id}`)
    return transformCreditMemo(res)
  }

  // --- Orders ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new AcumaticaClient(credentials)
    const res = await client.get<AcumaticaOrder[]>('SalesOrder', this.paginationParams(params))
    return (res ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new AcumaticaClient(credentials)
    const res = await client.get<AcumaticaOrder>(`SalesOrder/${id}`)
    return transformOrder(res)
  }

  // --- Sales Orders ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new AcumaticaClient(credentials)
    const res = await client.get<AcumaticaSalesOrder[]>('SalesOrder', this.paginationParams(params))
    return (res ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new AcumaticaClient(credentials)
    const res = await client.get<AcumaticaSalesOrder>(`SalesOrder/${id}`)
    return transformSalesOrder(res)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new AcumaticaClient(credentials)
    const res = await client.get<AcumaticaPurchaseOrder[]>('PurchaseOrder', this.paginationParams(params))
    return (res ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new AcumaticaClient(credentials)
    const res = await client.get<AcumaticaPurchaseOrder>(`PurchaseOrder/${id}`)
    return transformPurchaseOrder(res)
  }
}
