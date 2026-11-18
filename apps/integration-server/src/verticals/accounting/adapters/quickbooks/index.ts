import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Journal } from '../../schema/journal'
import type { CreditMemo } from '../../schema/creditmemo'
import type { Expense } from '../../schema/expense'
import type { PurchaseOrder } from '../../schema/purchaseorder'
import type { TaxRate } from '../../schema/taxrate'
import type { Order } from '../../schema/order'
import type { Organization } from '../../schema/organization'

import { buildAuthUrl, exchangeCode, refreshAccessToken } from './auth'
import { QBOClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import { transformInvoice, untransformInvoice, type QBOInvoice } from './transform/invoice'
import { transformBill, type QBOBill } from './transform/bill'
import {
  transformCustomer,
  transformVendor,
  type QBOCustomer,
  type QBOVendor,
} from './transform/contact'
import { transformAccount, type QBOAccount } from './transform/account'
import { transformJournal, type QBOJournalEntry } from './transform/journal'
import { transformCreditMemo, type QBOCreditMemo } from './transform/creditmemo'
import { transformExpense, type QBOExpense } from './transform/expense'
import { transformPurchaseOrder, type QBOPurchaseOrder } from './transform/purchaseorder'
import { transformTaxRate, type QBOTaxRate } from './transform/taxrate'
import { transformOrder, type QBOEstimate } from './transform/order'
import { transformOrganization, type QBOCompanyInfo } from './transform/organization'

interface QBOAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}

interface QBOQueryResponse<T> {
  QueryResponse: T
  time: string
}

export class QuickBooksAdapter implements AccountingAdapter {
  readonly platform = 'quickbooks'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: QBOAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string, redirectUri: string, realmId?: string): Promise<Credentials> {
    return exchangeCode(code, this.clientId, this.clientSecret, redirectUri, realmId ?? '')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) throw new Error('No refresh token available')
    const creds = await refreshAccessToken(
      credentials.refreshToken,
      this.clientId,
      this.clientSecret,
    )
    // Preserve realmId
    creds.tenantId = credentials.tenantId
    return creds
  }

  /** QuickBooks realmId (stored as tenantId), matched against the realmId on
   *  inbound webhook events for connection routing. */
  externalAccountId(credentials: Credentials): string | undefined {
    return credentials.tenantId || undefined
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new QBOClient(credentials)
    const res = await client.get<{ CompanyInfo: QBOCompanyInfo }>(
      `companyinfo/${credentials.tenantId}`,
    )
    return transformOrganization(res.CompanyInfo)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new QBOClient(credentials)
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 1000)
    const offset = ((params.page ?? 1) - 1) * limit + 1
    const whereClause =
      params.updatedAfter
        ? ` WHERE MetaData.LastUpdatedTime > '${params.updatedAfter.toISOString()}'`
        : ''
    const res = await client.query<QBOQueryResponse<{ Invoice?: QBOInvoice[] }>>(
      `SELECT * FROM Invoice${whereClause} MAXRESULTS ${limit} STARTPOSITION ${offset}`,
    )
    return (res.QueryResponse.Invoice ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new QBOClient(credentials)
    const res = await client.get<{ Invoice: QBOInvoice }>(`invoice/${id}`)
    return transformInvoice(res.Invoice)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new QBOClient(credentials)
    const res = await client.post<{ Invoice: QBOInvoice }>('invoice', untransformInvoice(data))
    return transformInvoice(res.Invoice)
  }

  async updateInvoice(
    credentials: Credentials,
    id: string,
    data: Partial<Invoice>,
  ): Promise<Invoice> {
    const client = new QBOClient(credentials)
    // QBO requires Id and SyncToken for updates
    const existing = await client.get<{ Invoice: QBOInvoice }>(`invoice/${id}`)
    const res = await client.post<{ Invoice: QBOInvoice }>('invoice', {
      ...untransformInvoice(data),
      Id: id,
      SyncToken: (existing.Invoice as Record<string, unknown>)['SyncToken'],
      sparse: true,
    })
    return transformInvoice(res.Invoice)
  }

  // --- Contacts (Customers + Vendors) ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new QBOClient(credentials)
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 1000)
    const offset = ((params.page ?? 1) - 1) * limit + 1
    const [custRes, vendRes] = await Promise.all([
      client.query<QBOQueryResponse<{ Customer?: QBOCustomer[] }>>(
        `SELECT * FROM Customer MAXRESULTS ${limit} STARTPOSITION ${offset}`,
      ),
      client.query<QBOQueryResponse<{ Vendor?: QBOVendor[] }>>(
        `SELECT * FROM Vendor MAXRESULTS ${limit} STARTPOSITION ${offset}`,
      ),
    ])
    return [
      ...(custRes.QueryResponse.Customer ?? []).map(transformCustomer),
      ...(vendRes.QueryResponse.Vendor ?? []).map(transformVendor),
    ]
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new QBOClient(credentials)
    if (id.startsWith('cust_')) {
      const res = await client.get<{ Customer: QBOCustomer }>(`customer/${id.slice(5)}`)
      return transformCustomer(res.Customer)
    }
    const res = await client.get<{ Vendor: QBOVendor }>(`vendor/${id.slice(5)}`)
    return transformVendor(res.Vendor)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new QBOClient(credentials)
    if (data.isSupplier && !data.isCustomer) {
      const res = await client.post<{ Vendor: QBOVendor }>('vendor', {
        DisplayName: data.name,
        GivenName: data.firstName,
        FamilyName: data.lastName,
        CompanyName: data.companyName,
        PrimaryEmailAddr: data.emails?.[0]?.email
          ? { Address: data.emails[0].email }
          : undefined,
      })
      return transformVendor(res.Vendor)
    }
    const res = await client.post<{ Customer: QBOCustomer }>('customer', {
      DisplayName: data.name,
      GivenName: data.firstName,
      FamilyName: data.lastName,
      CompanyName: data.companyName,
      PrimaryEmailAddr: data.emails?.[0]?.email
        ? { Address: data.emails[0].email }
        : undefined,
      BillAddr: data.billingAddress
        ? {
            Line1: data.billingAddress.address1,
            City: data.billingAddress.city,
            PostalCode: data.billingAddress.postalCode,
            Country: data.billingAddress.country,
          }
        : undefined,
    })
    return transformCustomer(res.Customer)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const client = new QBOClient(credentials)
    if (id.startsWith('cust_')) {
      const existing = await client.get<{ Customer: QBOCustomer }>(`customer/${id.slice(5)}`)
      const res = await client.post<{ Customer: QBOCustomer }>('customer', {
        Id: id.slice(5),
        SyncToken: (existing.Customer as Record<string, unknown>)['SyncToken'],
        DisplayName: data.name ?? existing.Customer.DisplayName,
        sparse: true,
      })
      return transformCustomer(res.Customer)
    }
    const existing = await client.get<{ Vendor: QBOVendor }>(`vendor/${id.slice(5)}`)
    const res = await client.post<{ Vendor: QBOVendor }>('vendor', {
      Id: id.slice(5),
      SyncToken: (existing.Vendor as Record<string, unknown>)['SyncToken'],
      DisplayName: data.name ?? existing.Vendor.DisplayName,
      sparse: true,
    })
    return transformVendor(res.Vendor)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new QBOClient(credentials)
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 1000)
    const offset = ((params.page ?? 1) - 1) * limit + 1
    const res = await client.query<QBOQueryResponse<{ Account?: QBOAccount[] }>>(
      `SELECT * FROM Account MAXRESULTS ${limit} STARTPOSITION ${offset}`,
    )
    return (res.QueryResponse.Account ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new QBOClient(credentials)
    const res = await client.get<{ Account: QBOAccount }>(`account/${id}`)
    return transformAccount(res.Account)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new QBOClient(credentials)
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 1000)
    const offset = ((params.page ?? 1) - 1) * limit + 1
    const res = await client.query<QBOQueryResponse<{ Bill?: QBOBill[] }>>(
      `SELECT * FROM Bill MAXRESULTS ${limit} STARTPOSITION ${offset}`,
    )
    return (res.QueryResponse.Bill ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new QBOClient(credentials)
    const res = await client.get<{ Bill: QBOBill }>(`bill/${id}`)
    return transformBill(res.Bill)
  }

  // --- Journals (journal entries) ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new QBOClient(credentials)
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 1000)
    const offset = ((params.page ?? 1) - 1) * limit + 1
    const res = await client.query<QBOQueryResponse<{ JournalEntry?: QBOJournalEntry[] }>>(
      `SELECT * FROM JournalEntry MAXRESULTS ${limit} STARTPOSITION ${offset}`,
    )
    return (res.QueryResponse.JournalEntry ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new QBOClient(credentials)
    const res = await client.get<{ JournalEntry: QBOJournalEntry }>(`journalentry/${id}`)
    return transformJournal(res.JournalEntry)
  }

  // --- Credit memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new QBOClient(credentials)
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 1000)
    const offset = ((params.page ?? 1) - 1) * limit + 1
    const res = await client.query<QBOQueryResponse<{ CreditMemo?: QBOCreditMemo[] }>>(
      `SELECT * FROM CreditMemo MAXRESULTS ${limit} STARTPOSITION ${offset}`,
    )
    return (res.QueryResponse.CreditMemo ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new QBOClient(credentials)
    const res = await client.get<{ CreditMemo: QBOCreditMemo }>(`creditmemo/${id}`)
    return transformCreditMemo(res.CreditMemo)
  }

  // --- Expenses (Purchase transactions — not to be confused with PurchaseOrder) ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new QBOClient(credentials)
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 1000)
    const offset = ((params.page ?? 1) - 1) * limit + 1
    const res = await client.query<QBOQueryResponse<{ Purchase?: QBOExpense[] }>>(
      `SELECT * FROM Purchase MAXRESULTS ${limit} STARTPOSITION ${offset}`,
    )
    return (res.QueryResponse.Purchase ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new QBOClient(credentials)
    const res = await client.get<{ Purchase: QBOExpense }>(`purchase/${id}`)
    return transformExpense(res.Purchase)
  }

  // --- Purchase orders ---

  async listPurchaseOrders(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PurchaseOrder[]> {
    const client = new QBOClient(credentials)
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 1000)
    const offset = ((params.page ?? 1) - 1) * limit + 1
    const res = await client.query<QBOQueryResponse<{ PurchaseOrder?: QBOPurchaseOrder[] }>>(
      `SELECT * FROM PurchaseOrder MAXRESULTS ${limit} STARTPOSITION ${offset}`,
    )
    return (res.QueryResponse.PurchaseOrder ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new QBOClient(credentials)
    const res = await client.get<{ PurchaseOrder: QBOPurchaseOrder }>(`purchaseorder/${id}`)
    return transformPurchaseOrder(res.PurchaseOrder)
  }

  // --- Tax rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new QBOClient(credentials)
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 1000)
    const offset = ((params.page ?? 1) - 1) * limit + 1
    const res = await client.query<QBOQueryResponse<{ TaxRate?: QBOTaxRate[] }>>(
      `SELECT * FROM TaxRate MAXRESULTS ${limit} STARTPOSITION ${offset}`,
    )
    return (res.QueryResponse.TaxRate ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new QBOClient(credentials)
    const res = await client.get<{ TaxRate: QBOTaxRate }>(`taxrate/${id}`)
    return transformTaxRate(res.TaxRate)
  }

  // --- Orders (Estimates) ---
  //
  // QuickBooks has no sales-order entity — SalesOrder is a QBW (desktop)
  // product only, per the XSD's PayerRef annotation, and does not exist on
  // QBO. Estimate is the nearest quote-like document QBO has, and is what
  // transform/order.ts already maps to the canonical `order` resource as
  // `type: 'SALES'`.

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new QBOClient(credentials)
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 1000)
    const offset = ((params.page ?? 1) - 1) * limit + 1
    const res = await client.query<QBOQueryResponse<{ Estimate?: QBOEstimate[] }>>(
      `SELECT * FROM Estimate MAXRESULTS ${limit} STARTPOSITION ${offset}`,
    )
    return (res.QueryResponse.Estimate ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new QBOClient(credentials)
    const res = await client.get<{ Estimate: QBOEstimate }>(`estimate/${id}`)
    return transformOrder(res.Estimate)
  }
}
