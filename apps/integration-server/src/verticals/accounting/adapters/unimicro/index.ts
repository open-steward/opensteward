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
import type { Order } from '../../schema/order'
import type { SalesOrder } from '../../schema/salesorder'
import type { PurchaseOrder } from '../../schema/purchaseorder'
import type { Organization } from '../../schema/organization'

import { buildAuthUrl, exchangeCode, refreshAccessToken } from './auth'
import { UnimicroClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import {
  transformInvoice,
  untransformInvoice,
  type UnimicroInvoice,
} from './transform/invoice'
import { transformContact, type UnimicroContact } from './transform/contact'
import { transformAccount, type UnimicroAccount } from './transform/account'
import { transformOrganization, type UnimicroOrganization } from './transform/organization'
import { transformBill, type UnimicroBill } from './transform/bill'
import { transformTaxRate, type UnimicroTaxRate } from './transform/taxrate'
import {
  transformJournal,
  untransformJournal,
  type UnimicroJournal,
} from './transform/journal'
import { transformTransaction, type UnimicroTransaction } from './transform/transaction'
import { transformExpense, type UnimicroExpense } from './transform/expense'
import { transformCreditMemo, type UnimicroCreditMemo } from './transform/creditmemo'
import { transformOrder, type UnimicroOrder } from './transform/order'
import { transformSalesOrder, type UnimicroSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type UnimicroPurchaseOrder } from './transform/purchaseorder'

interface UnimicroAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}

export class UnimicroAdapter implements AccountingAdapter {
  readonly platform = 'unimicro'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: UnimicroAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, (overrideScopes ?? this.scopes), state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return exchangeCode(code, this.clientId, this.clientSecret, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) throw new Error('No refresh token available')
    return refreshAccessToken(credentials.refreshToken, this.clientId, this.clientSecret)
  }

  private paginationParams(params: QueryParams): Record<string, unknown> {
    return {
      top: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      skip: ((params.page ?? 1) - 1) * (params.limit ?? DEFAULT_PAGE_SIZE),
    }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new UnimicroClient(credentials)
    const res = await client.get<UnimicroOrganization>('companysettings/1')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new UnimicroClient(credentials)
    const res = await client.get<UnimicroInvoice[]>('invoices', this.paginationParams(params))
    return (res ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new UnimicroClient(credentials)
    const res = await client.get<UnimicroInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new UnimicroClient(credentials)
    const res = await client.post<UnimicroInvoice>('invoices', untransformInvoice(data))
    return transformInvoice(res)
  }

  async updateInvoice(
    credentials: Credentials,
    id: string,
    data: Partial<Invoice>,
  ): Promise<Invoice> {
    const client = new UnimicroClient(credentials)
    const res = await client.put<UnimicroInvoice>(`invoices/${id}`, untransformInvoice(data))
    return transformInvoice(res)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new UnimicroClient(credentials)
    const res = await client.get<UnimicroBill[]>('bills', this.paginationParams(params))
    return (res ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new UnimicroClient(credentials)
    const res = await client.get<UnimicroBill>(`bills/${id}`)
    return transformBill(res)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new UnimicroClient(credentials)
    const res = await client.get<UnimicroContact[]>('customers', this.paginationParams(params))
    return (res ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new UnimicroClient(credentials)
    const res = await client.get<UnimicroContact>(`customers/${id}`)
    return transformContact(res)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new UnimicroClient(credentials)
    const res = await client.post<UnimicroContact>('customers', {
      OrgNumber: data.identification,
      IsCustomer: data.isCustomer,
      IsSupplier: data.isSupplier,
      Info: {
        Name: data.name,
        DefaultEmail: data.emails?.[0]?.email
          ? { EmailAddress: data.emails[0].email }
          : undefined,
        Phones: data.telephones?.[0]?.telephone
          ? [{ Number: data.telephones[0].telephone }]
          : undefined,
        Addresses: data.billingAddress
          ? [
              {
                AddressLine1: data.billingAddress.address1,
                City: data.billingAddress.city,
                PostalCode: data.billingAddress.postalCode,
                Country: data.billingAddress.country,
              },
            ]
          : undefined,
      },
    })
    return transformContact(res)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const client = new UnimicroClient(credentials)
    const res = await client.put<UnimicroContact>(`customers/${id}`, {
      OrgNumber: data.identification,
      Info: {
        Name: data.name,
        DefaultEmail: data.emails?.[0]?.email
          ? { EmailAddress: data.emails[0].email }
          : undefined,
        Phones: data.telephones?.[0]?.telephone
          ? [{ Number: data.telephones[0].telephone }]
          : undefined,
        Addresses: data.billingAddress
          ? [
              {
                AddressLine1: data.billingAddress.address1,
                City: data.billingAddress.city,
                PostalCode: data.billingAddress.postalCode,
                Country: data.billingAddress.country,
              },
            ]
          : undefined,
      },
    })
    return transformContact(res)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    const client = new UnimicroClient(credentials)
    await client.delete(`customers/${id}`)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new UnimicroClient(credentials)
    const res = await client.get<UnimicroAccount[]>('accounts', this.paginationParams(params))
    return (res ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new UnimicroClient(credentials)
    const res = await client.get<UnimicroAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new UnimicroClient(credentials)
    const res = await client.get<UnimicroJournal[]>('journalentries', this.paginationParams(params))
    return (res ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new UnimicroClient(credentials)
    const res = await client.get<UnimicroJournal>(`journalentries/${id}`)
    return transformJournal(res)
  }

  async createJournal(credentials: Credentials, data: Partial<Journal>): Promise<Journal> {
    const client = new UnimicroClient(credentials)
    const res = await client.post<UnimicroJournal>('journalentries', untransformJournal(data))
    return transformJournal(res)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new UnimicroClient(credentials)
    const res = await client.get<UnimicroTransaction[]>(
      'accountingtransactions',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new UnimicroClient(credentials)
    const res = await client.get<UnimicroTransaction>(`accountingtransactions/${id}`)
    return transformTransaction(res)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new UnimicroClient(credentials)
    const res = await client.get<UnimicroTaxRate[]>('vattypes', this.paginationParams(params))
    return (res ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new UnimicroClient(credentials)
    const res = await client.get<UnimicroTaxRate>(`vattypes/${id}`)
    return transformTaxRate(res)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new UnimicroClient(credentials)
    const res = await client.get<UnimicroExpense[]>(
      'travelexpenses',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new UnimicroClient(credentials)
    const res = await client.get<UnimicroExpense>(`travelexpenses/${id}`)
    return transformExpense(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new UnimicroClient(credentials)
    const res = await client.get<UnimicroCreditMemo[]>(
      'creditnotes',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new UnimicroClient(credentials)
    const res = await client.get<UnimicroCreditMemo>(`creditnotes/${id}`)
    return transformCreditMemo(res)
  }

  // --- Orders ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new UnimicroClient(credentials)
    const res = await client.get<UnimicroOrder[]>('orders', this.paginationParams(params))
    return (res ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new UnimicroClient(credentials)
    const res = await client.get<UnimicroOrder>(`orders/${id}`)
    return transformOrder(res)
  }

  // --- Sales Orders ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new UnimicroClient(credentials)
    const res = await client.get<UnimicroSalesOrder[]>('orders', this.paginationParams(params))
    return (res ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new UnimicroClient(credentials)
    const res = await client.get<UnimicroSalesOrder>(`orders/${id}`)
    return transformSalesOrder(res)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PurchaseOrder[]> {
    const client = new UnimicroClient(credentials)
    const res = await client.get<UnimicroPurchaseOrder[]>(
      'purchaseorders',
      this.paginationParams(params),
    )
    return (res ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new UnimicroClient(credentials)
    const res = await client.get<UnimicroPurchaseOrder>(`purchaseorders/${id}`)
    return transformPurchaseOrder(res)
  }
}
