/**
 * Invoice Ninja v5 accounting adapter.
 *
 * Auth: API key — users generate a static token in
 *   Settings > Account Management > Integrations > API Tokens.
 *   The token is stored in credentials.accessToken and sent as X-API-TOKEN.
 *
 * Supported resources:
 *   - Organization  (GET /api/v1/companies)
 *   - Invoices      (GET /api/v1/invoices)
 *   - Contacts      (GET /api/v1/clients + /api/v1/vendors)
 *   - Transactions  (GET /api/v1/payments)
 *   - Expenses      (GET /api/v1/expenses)
 *   - Tax Rates     (GET /api/v1/tax_rates)
 *   - Credit Memos  (GET /api/v1/credits)
 *   - Sales Orders  (GET /api/v1/quotes)
 *   - Purchase Orders (GET /api/v1/purchase_orders)
 *
 * Not supported (auto-501): Bills, Accounts, Journals, Orders
 */

import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Contact } from '../../schema/contact'
import type { Transaction } from '../../schema/transaction'
import type { Expense } from '../../schema/expense'
import type { TaxRate } from '../../schema/taxrate'
import type { CreditMemo } from '../../schema/creditmemo'
import type { SalesOrder } from '../../schema/salesorder'
import type { PurchaseOrder } from '../../schema/purchaseorder'
import type { Organization } from '../../schema/organization'

import { refreshCredentials } from './auth'
import {
  InvoiceNinjaClient,
  type InvoiceNinjaListResponse,
  type InvoiceNinjaSingleResponse,
} from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import {
  transformInvoice,
  untransformInvoice,
  type InvoiceNinjaInvoice,
} from './transform/invoice'
import {
  transformClient,
  transformVendor,
  type InvoiceNinjaClient as InvoiceNinjaClientModel,
  type InvoiceNinjaVendor,
} from './transform/contact'
import {
  transformTransaction,
  type InvoiceNinjaPayment,
} from './transform/transaction'
import {
  transformExpense,
  type InvoiceNinjaExpense,
} from './transform/expense'
import {
  transformTaxRate,
  type InvoiceNinjaTaxRate,
} from './transform/taxrate'
import {
  transformCreditMemo,
  untransformCreditMemo,
  type InvoiceNinjaCredit,
} from './transform/creditmemo'
import {
  transformSalesOrder,
  untransformSalesOrder,
  type InvoiceNinjaQuote,
} from './transform/salesorder'
import {
  transformPurchaseOrder,
  untransformPurchaseOrder,
  type InvoiceNinjaPurchaseOrder,
} from './transform/purchaseorder'
import {
  transformOrganization,
  type InvoiceNinjaCompany,
} from './transform/organization'

export class InvoiceNinjaAdapter implements AccountingAdapter {
  readonly platform = 'invoice-ninja'
  readonly version = '0.1.0'

  /** API token auth — no config needed beyond the credential's accessToken. */
  constructor() {}

  /**
   * Invoice Ninja uses static API tokens — no OAuth flow.
   * Callers should never invoke getAuthUrl; it throws to signal misconfiguration.
   */
  getAuthUrl(_state: string): string {
    throw new Error(
      'Invoice Ninja uses API key authentication — getAuthUrl is not applicable.',
    )
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error(
      'Invoice Ninja uses API key authentication — exchangeCode is not applicable.',
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // API tokens do not expire — return as-is
    return refreshCredentials(credentials)
  }

  private paginationParams(params: QueryParams): Record<string, unknown> {
    return {
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      page: params.page ?? 1,
      ...(params.updatedAfter && {
        updated_at: Math.floor(params.updatedAfter.getTime() / 1000),
      }),
    }
  }

  private client(credentials: Credentials): InvoiceNinjaClient {
    return new InvoiceNinjaClient(credentials)
  }

  // ── Organization ────────────────────────────────────────────────────────────

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const c = this.client(credentials)
    const res = await c.get<InvoiceNinjaListResponse<InvoiceNinjaCompany>>('companies')
    const company = res.data?.[0]
    if (!company) throw new Error('Invoice Ninja: no company found')
    return transformOrganization(company)
  }

  // ── Invoices ────────────────────────────────────────────────────────────────

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const c = this.client(credentials)
    const res = await c.get<InvoiceNinjaListResponse<InvoiceNinjaInvoice>>(
      'invoices',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const c = this.client(credentials)
    const res = await c.get<InvoiceNinjaSingleResponse<InvoiceNinjaInvoice>>(`invoices/${id}`)
    return transformInvoice(res.data)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const c = this.client(credentials)
    const res = await c.post<InvoiceNinjaSingleResponse<InvoiceNinjaInvoice>>(
      'invoices',
      untransformInvoice(data),
    )
    return transformInvoice(res.data)
  }

  async updateInvoice(
    credentials: Credentials,
    id: string,
    data: Partial<Invoice>,
  ): Promise<Invoice> {
    const c = this.client(credentials)
    const res = await c.put<InvoiceNinjaSingleResponse<InvoiceNinjaInvoice>>(
      `invoices/${id}`,
      untransformInvoice(data),
    )
    return transformInvoice(res.data)
  }

  // ── Contacts (clients + vendors) ────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const c = this.client(credentials)
    const p = this.paginationParams(params)
    const [clientsRes, vendorsRes] = await Promise.all([
      c.get<InvoiceNinjaListResponse<InvoiceNinjaClientModel>>('clients', p),
      c.get<InvoiceNinjaListResponse<InvoiceNinjaVendor>>('vendors', p),
    ])
    return [
      ...(clientsRes.data ?? []).map(transformClient),
      ...(vendorsRes.data ?? []).map(transformVendor),
    ]
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const c = this.client(credentials)
    // Prefix 'v_' = vendor; everything else = client (matches createContact convention)
    if (id.startsWith('v_')) {
      const rawId = id.slice(2)
      const res = await c.get<InvoiceNinjaSingleResponse<InvoiceNinjaVendor>>(`vendors/${rawId}`)
      return transformVendor(res.data)
    }
    const res = await c.get<InvoiceNinjaSingleResponse<InvoiceNinjaClientModel>>(`clients/${id}`)
    return transformClient(res.data)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const c = this.client(credentials)
    if (data.isSupplier && !data.isCustomer) {
      const res = await c.post<InvoiceNinjaSingleResponse<InvoiceNinjaVendor>>('vendors', {
        name: data.name,
        vat_number: data.taxNumber,
        id_number: data.identification,
        phone: data.telephones?.find((t) => t.type === 'WORK')?.telephone,
        address1: data.billingAddress?.address1,
        address2: data.billingAddress?.address2,
        city: data.billingAddress?.city,
        state: data.billingAddress?.region,
        postal_code: data.billingAddress?.postalCode,
      })
      return transformVendor(res.data)
    }
    const res = await c.post<InvoiceNinjaSingleResponse<InvoiceNinjaClientModel>>('clients', {
      name: data.name,
      vat_number: data.taxNumber,
      id_number: data.identification,
      phone: data.telephones?.find((t) => t.type === 'WORK')?.telephone,
      address1: data.billingAddress?.address1,
      address2: data.billingAddress?.address2,
      city: data.billingAddress?.city,
      state: data.billingAddress?.region,
      postal_code: data.billingAddress?.postalCode,
      contacts: data.emails?.map((e) => ({ email: e.email })),
    })
    return transformClient(res.data)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const c = this.client(credentials)
    if (id.startsWith('v_')) {
      const rawId = id.slice(2)
      const res = await c.put<InvoiceNinjaSingleResponse<InvoiceNinjaVendor>>(
        `vendors/${rawId}`,
        {
          name: data.name,
          phone: data.telephones?.find((t) => t.type === 'WORK')?.telephone,
          address1: data.billingAddress?.address1,
          city: data.billingAddress?.city,
        },
      )
      return transformVendor(res.data)
    }
    const res = await c.put<InvoiceNinjaSingleResponse<InvoiceNinjaClientModel>>(
      `clients/${id}`,
      {
        name: data.name,
        phone: data.telephones?.find((t) => t.type === 'WORK')?.telephone,
        address1: data.billingAddress?.address1,
        city: data.billingAddress?.city,
        state: data.billingAddress?.region,
        postal_code: data.billingAddress?.postalCode,
        contacts: data.emails?.map((e) => ({ email: e.email })),
      },
    )
    return transformClient(res.data)
  }

  // ── Transactions (Payments) ─────────────────────────────────────────────────

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const c = this.client(credentials)
    const res = await c.get<InvoiceNinjaListResponse<InvoiceNinjaPayment>>(
      'payments',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const c = this.client(credentials)
    const res = await c.get<InvoiceNinjaSingleResponse<InvoiceNinjaPayment>>(`payments/${id}`)
    return transformTransaction(res.data)
  }

  // ── Expenses ────────────────────────────────────────────────────────────────

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const c = this.client(credentials)
    const res = await c.get<InvoiceNinjaListResponse<InvoiceNinjaExpense>>(
      'expenses',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const c = this.client(credentials)
    const res = await c.get<InvoiceNinjaSingleResponse<InvoiceNinjaExpense>>(`expenses/${id}`)
    return transformExpense(res.data)
  }

  // ── Tax Rates ───────────────────────────────────────────────────────────────

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const c = this.client(credentials)
    const res = await c.get<InvoiceNinjaListResponse<InvoiceNinjaTaxRate>>(
      'tax_rates',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const c = this.client(credentials)
    const res = await c.get<InvoiceNinjaSingleResponse<InvoiceNinjaTaxRate>>(`tax_rates/${id}`)
    return transformTaxRate(res.data)
  }

  // ── Credit Memos (Credits) ──────────────────────────────────────────────────

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const c = this.client(credentials)
    const res = await c.get<InvoiceNinjaListResponse<InvoiceNinjaCredit>>(
      'credits',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const c = this.client(credentials)
    const res = await c.get<InvoiceNinjaSingleResponse<InvoiceNinjaCredit>>(`credits/${id}`)
    return transformCreditMemo(res.data)
  }

  async createCreditMemo(
    credentials: Credentials,
    data: Partial<CreditMemo>,
  ): Promise<CreditMemo> {
    const c = this.client(credentials)
    const res = await c.post<InvoiceNinjaSingleResponse<InvoiceNinjaCredit>>(
      'credits',
      untransformCreditMemo(data),
    )
    return transformCreditMemo(res.data)
  }

  // ── Sales Orders (Quotes) ───────────────────────────────────────────────────

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const c = this.client(credentials)
    const res = await c.get<InvoiceNinjaListResponse<InvoiceNinjaQuote>>(
      'quotes',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const c = this.client(credentials)
    const res = await c.get<InvoiceNinjaSingleResponse<InvoiceNinjaQuote>>(`quotes/${id}`)
    return transformSalesOrder(res.data)
  }

  async createSalesOrder(
    credentials: Credentials,
    data: Partial<SalesOrder>,
  ): Promise<SalesOrder> {
    const c = this.client(credentials)
    const res = await c.post<InvoiceNinjaSingleResponse<InvoiceNinjaQuote>>(
      'quotes',
      untransformSalesOrder(data),
    )
    return transformSalesOrder(res.data)
  }

  // ── Purchase Orders ─────────────────────────────────────────────────────────

  async listPurchaseOrders(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PurchaseOrder[]> {
    const c = this.client(credentials)
    const res = await c.get<InvoiceNinjaListResponse<InvoiceNinjaPurchaseOrder>>(
      'purchase_orders',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const c = this.client(credentials)
    const res = await c.get<InvoiceNinjaSingleResponse<InvoiceNinjaPurchaseOrder>>(
      `purchase_orders/${id}`,
    )
    return transformPurchaseOrder(res.data)
  }

  async createPurchaseOrder(
    credentials: Credentials,
    data: Partial<PurchaseOrder>,
  ): Promise<PurchaseOrder> {
    const c = this.client(credentials)
    const res = await c.post<InvoiceNinjaSingleResponse<InvoiceNinjaPurchaseOrder>>(
      'purchase_orders',
      untransformPurchaseOrder(data),
    )
    return transformPurchaseOrder(res.data)
  }
}
