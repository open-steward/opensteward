import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Journal } from '../../schema/journal'
import type { TaxRate } from '../../schema/taxrate'
import type { Organization } from '../../schema/organization'
import type { Order } from '../../schema/order'
import type { CreditMemo } from '../../schema/creditmemo'
import type { Expense } from '../../schema/expense'
import type { SalesOrder } from '../../schema/salesorder'
import type { PurchaseOrder } from '../../schema/purchaseorder'
import type { Transaction } from '../../schema/transaction'

import { buildAuthUrl, exchangeCode, refreshAccessToken } from './auth'
import { VismaClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, untransformInvoice, type VismaCustomerInvoice } from './transform/invoice'
import { transformBill, type VismaSupplierInvoice } from './transform/bill'
import { transformCustomer, transformSupplier, type VismaCustomer, type VismaSupplier } from './transform/contact'
import { transformAccount, type VismaAccount } from './transform/account'
import { transformJournal, untransformJournal, type VismaVoucher } from './transform/journal'
import { transformOrganization, type VismaCompanySettings } from './transform/organization'
import { transformOrder, untransformOrder, type VismaOrder } from './transform/order'
import { transformCreditMemo, untransformCreditMemo, type VismaCreditInvoice } from './transform/creditmemo'
import { transformExpense, untransformExpense, type VismaExpense } from './transform/expense'
import { transformSalesOrder, untransformSalesOrder, type VismaSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, untransformPurchaseOrder, type VismaPurchaseOrder } from './transform/purchaseorder'
import { transformTransaction, type VismaLedgerItem } from './transform/transaction'

export interface VismaAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}

interface VismaPaginatedResponse<T> {
  Data: T[]
  Meta: {
    CurrentPage: number
    PageSize: number
    TotalNumberOfPages: number
    TotalNumberOfResults: number
  }
}

export class VismaAdapter implements AccountingAdapter {
  readonly platform: string = 'visma'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: VismaAdapterConfig) {
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
    const result: Record<string, unknown> = {
      $pagesize: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      $page: params.page ?? 1,
    }
    return result
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new VismaClient(credentials)
    const res = await client.get<VismaCompanySettings>('companysettings')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new VismaClient(credentials)
    const queryParams: Record<string, unknown> = this.paginationParams(params)
    if (params.updatedAfter) {
      queryParams['modifiedSinceUtc'] = params.updatedAfter.toISOString()
    }
    const res = await client.get<VismaPaginatedResponse<VismaCustomerInvoice>>(
      'customerinvoices',
      queryParams,
    )
    return (res.Data ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new VismaClient(credentials)
    const res = await client.get<VismaCustomerInvoice>(`customerinvoices/${id}`)
    return transformInvoice(res)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new VismaClient(credentials)
    const res = await client.post<VismaCustomerInvoice>(
      'customerinvoices',
      untransformInvoice(data),
    )
    return transformInvoice(res)
  }

  // --- Bills (Supplier Invoices) ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new VismaClient(credentials)
    const res = await client.get<VismaPaginatedResponse<VismaSupplierInvoice>>(
      'supplierinvoices',
      this.paginationParams(params),
    )
    return (res.Data ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new VismaClient(credentials)
    const res = await client.get<VismaSupplierInvoice>(`supplierinvoices/${id}`)
    return transformBill(res)
  }

  // --- Contacts (Customers + Suppliers) ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new VismaClient(credentials)
    const pag = this.paginationParams(params)
    const [custRes, suppRes] = await Promise.all([
      client.get<VismaPaginatedResponse<VismaCustomer>>('customers', pag),
      client.get<VismaPaginatedResponse<VismaSupplier>>('suppliers', pag),
    ])
    const customers = (custRes.Data ?? []).map(transformCustomer)
    const suppliers = (suppRes.Data ?? []).map(transformSupplier)
    return [...customers, ...suppliers]
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new VismaClient(credentials)
    if (id.startsWith('cust_')) {
      const uuid = id.slice(5)
      const res = await client.get<VismaCustomer>(`customers/${uuid}`)
      return transformCustomer(res)
    }
    if (id.startsWith('supp_')) {
      const uuid = id.slice(5)
      const res = await client.get<VismaSupplier>(`suppliers/${uuid}`)
      return transformSupplier(res)
    }
    throw new Error(`Invalid contact id format: ${id}. Expected cust_<uuid> or supp_<uuid>`)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new VismaClient(credentials)
    if (data.isSupplier && !data.isCustomer) {
      const res = await client.post<VismaSupplier>('suppliers', {
        Name: data.name,
        CorporateIdentityNumber: data.identification,
        EmailAddress: data.emails?.[0]?.email,
        CurrencyCode: data.currency,
        Address1: data.billingAddress?.address1,
        City: data.billingAddress?.city,
        PostalCode: data.billingAddress?.postalCode,
        CountryCode: data.billingAddress?.country,
      })
      return transformSupplier(res)
    }
    const res = await client.post<VismaCustomer>('customers', {
      Name: data.name,
      CorporateIdentityNumber: data.identification,
      EmailAddress: data.emails?.[0]?.email,
      CurrencyCode: data.currency,
      InvoiceAddress1: data.billingAddress?.address1,
      InvoiceCity: data.billingAddress?.city,
      InvoicePostalCode: data.billingAddress?.postalCode,
      InvoiceCountryCode: data.billingAddress?.country,
    })
    return transformCustomer(res)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const client = new VismaClient(credentials)
    if (id.startsWith('supp_')) {
      const uuid = id.slice(5)
      const res = await client.put<VismaSupplier>(`suppliers/${uuid}`, {
        Name: data.name,
        EmailAddress: data.emails?.[0]?.email,
        Address1: data.billingAddress?.address1,
        City: data.billingAddress?.city,
        PostalCode: data.billingAddress?.postalCode,
        CountryCode: data.billingAddress?.country,
      })
      return transformSupplier(res)
    }
    const uuid = id.slice(5)
    const res = await client.put<VismaCustomer>(`customers/${uuid}`, {
      Name: data.name,
      EmailAddress: data.emails?.[0]?.email,
      InvoiceAddress1: data.billingAddress?.address1,
      InvoiceCity: data.billingAddress?.city,
      InvoicePostalCode: data.billingAddress?.postalCode,
      InvoiceCountryCode: data.billingAddress?.country,
    })
    return transformCustomer(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new VismaClient(credentials)
    const res = await client.get<VismaPaginatedResponse<VismaAccount>>(
      'accounts',
      this.paginationParams(params),
    )
    return (res.Data ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new VismaClient(credentials)
    // Visma accounts require fiscalYearId; fetch the first fiscal year
    const fyRes = await client.get<VismaPaginatedResponse<{ Id: string }>>('fiscalyears')
    const fiscalYearId = fyRes.Data?.[0]?.Id
    if (!fiscalYearId) throw new Error('No fiscal year found')
    const res = await client.get<VismaAccount>(`accounts/${fiscalYearId}/${id}`)
    return transformAccount(res)
  }

  // --- Journals (Vouchers) ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new VismaClient(credentials)
    const res = await client.get<VismaPaginatedResponse<VismaVoucher>>(
      'vouchers',
      this.paginationParams(params),
    )
    return (res.Data ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new VismaClient(credentials)
    const res = await client.get<VismaVoucher>(`vouchers/${id}`)
    return transformJournal(res)
  }

  async createJournal(credentials: Credentials, data: Partial<Journal>): Promise<Journal> {
    const client = new VismaClient(credentials)
    const res = await client.post<VismaVoucher>('vouchers', untransformJournal(data))
    return transformJournal(res)
  }

  // --- Orders ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new VismaClient(credentials)
    const res = await client.get<VismaPaginatedResponse<VismaOrder>>(
      'orders',
      this.paginationParams(params),
    )
    return (res.Data ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new VismaClient(credentials)
    const res = await client.get<VismaOrder>(`orders/${id}`)
    return transformOrder(res)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new VismaClient(credentials)
    const res = await client.post<VismaOrder>('orders', untransformOrder(data))
    return transformOrder(res)
  }

  // --- Credit Memos (Credit Invoices) ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new VismaClient(credentials)
    const queryParams: Record<string, unknown> = this.paginationParams(params)
    if (params.updatedAfter) {
      queryParams['modifiedSinceUtc'] = params.updatedAfter.toISOString()
    }
    const res = await client.get<VismaPaginatedResponse<VismaCreditInvoice>>(
      'customerinvoices',
      queryParams,
    )
    // Filter to only credit invoices
    const credits = (res.Data ?? []).filter((inv) => inv.IsCreditInvoice)
    return credits.map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new VismaClient(credentials)
    const res = await client.get<VismaCreditInvoice>(`customerinvoices/${id}`)
    return transformCreditMemo(res)
  }

  async createCreditMemo(credentials: Credentials, data: Partial<CreditMemo>): Promise<CreditMemo> {
    const client = new VismaClient(credentials)
    const res = await client.post<VismaCreditInvoice>(
      'customerinvoices',
      untransformCreditMemo(data),
    )
    return transformCreditMemo(res)
  }

  // --- Expenses (Supplier Invoices as Expenses) ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new VismaClient(credentials)
    const res = await client.get<VismaPaginatedResponse<VismaExpense>>(
      'supplierinvoices',
      this.paginationParams(params),
    )
    return (res.Data ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new VismaClient(credentials)
    const res = await client.get<VismaExpense>(`supplierinvoices/${id}`)
    return transformExpense(res)
  }

  async createExpense(credentials: Credentials, data: Partial<Expense>): Promise<Expense> {
    const client = new VismaClient(credentials)
    const res = await client.post<VismaExpense>(
      'supplierinvoices',
      untransformExpense(data),
    )
    return transformExpense(res)
  }

  // --- Sales Orders (Visma Orders as Sales Orders) ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new VismaClient(credentials)
    const res = await client.get<VismaPaginatedResponse<VismaSalesOrder>>(
      'orders',
      this.paginationParams(params),
    )
    return (res.Data ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new VismaClient(credentials)
    const res = await client.get<VismaSalesOrder>(`orders/${id}`)
    return transformSalesOrder(res)
  }

  async createSalesOrder(credentials: Credentials, data: Partial<SalesOrder>): Promise<SalesOrder> {
    const client = new VismaClient(credentials)
    const res = await client.post<VismaSalesOrder>('orders', untransformSalesOrder(data))
    return transformSalesOrder(res)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new VismaClient(credentials)
    const res = await client.get<VismaPaginatedResponse<VismaPurchaseOrder>>(
      'purchaseorders',
      this.paginationParams(params),
    )
    return (res.Data ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new VismaClient(credentials)
    const res = await client.get<VismaPurchaseOrder>(`purchaseorders/${id}`)
    return transformPurchaseOrder(res)
  }

  async createPurchaseOrder(credentials: Credentials, data: Partial<PurchaseOrder>): Promise<PurchaseOrder> {
    const client = new VismaClient(credentials)
    const res = await client.post<VismaPurchaseOrder>(
      'purchaseorders',
      untransformPurchaseOrder(data),
    )
    return transformPurchaseOrder(res)
  }

  // --- Transactions (Customer/Supplier Ledger Items) ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new VismaClient(credentials)
    const pag = this.paginationParams(params)
    const [custRes, suppRes] = await Promise.all([
      client.get<VismaPaginatedResponse<VismaLedgerItem>>('customerledgeritems', pag),
      client.get<VismaPaginatedResponse<VismaLedgerItem>>('supplierledgeritems', pag),
    ])
    const custItems = (custRes.Data ?? []).map(transformTransaction)
    const suppItems = (suppRes.Data ?? []).map(transformTransaction)
    return [...custItems, ...suppItems]
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new VismaClient(credentials)
    const res = await client.get<VismaLedgerItem>(`customerledgeritems/${id}`)
    return transformTransaction(res)
  }

  // --- Tax Rates (Article Account Codings) ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new VismaClient(credentials)
    const res = await client.get<VismaPaginatedResponse<{
      Id: string
      Name: string
      NameEnglish: string
      VatRatePercent: number
      IsActive: boolean
      [key: string]: unknown
    }>>('articleaccountcodings', this.paginationParams(params))
    return (res.Data ?? []).map((raw) => ({
      id: raw.Id,
      name: raw.NameEnglish || raw.Name || undefined,
      rate: raw.VatRatePercent,
      isActive: raw.IsActive,
      metadata: raw as Record<string, unknown>,
    }))
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new VismaClient(credentials)
    const raw = await client.get<{
      Id: string
      Name: string
      NameEnglish: string
      VatRatePercent: number
      IsActive: boolean
      [key: string]: unknown
    }>(`articleaccountcodings/${id}`)
    return {
      id: raw.Id,
      name: raw.NameEnglish || raw.Name || undefined,
      rate: raw.VatRatePercent,
      isActive: raw.IsActive,
      metadata: raw as Record<string, unknown>,
    }
  }
}
