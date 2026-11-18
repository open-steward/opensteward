/**
 * Mezan (mezan.sa) accounting adapter.
 *
 * Auth model: API key (Bearer token).  Keys are issued from within the Mezan
 * app (Advanced plan).  No OAuth redirect flow exists — the Connect Link form
 * collects the key directly via `simpleApiKey`.
 *
 * Supported resources:
 *   - Organization (GET /organization)
 *   - Invoices     (GET/POST/PUT /sales-invoices)
 *   - Bills        (GET /purchasing-invoices)
 *   - Contacts     (GET /customers + /vendors)
 *   - Accounts     (GET /accounts)
 *   - Tax rates    (GET /tax-types)
 *   - Journals     (GET/POST /journals)
 *   - Credit memos (GET /credit-notes)
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unverified: expense       — Mezan has a 'General Receipts' module that maps conceptually
//                             to expenses, but no public REST API endpoint is documented;
//                             the private API (Advanced plan) does not expose a known path.
// Unverified: order         — Mezan has no 'order' concept distinct from invoices or
//                             quotations; no public REST API endpoint is documented for a
//                             generic order resource.
// Unverified: purchaseorder — Mezan has a Purchase Orders module (user-facing docs only);
//                             no public REST API endpoint path is available to confirm the
//                             resource is accessible via API.
// Unverified: salesorder    — Mezan has Sales Quotations (which don't generate transactions)
//                             but no 'sales order' resource distinct from sales invoices;
//                             no public REST API endpoint is documented.
// Unverified: transaction   — Mezan generates ledger transactions from all modules but
//                             exposes no dedicated public REST API endpoint for querying
//                             raw transactions; the private API does not document this resource.

import { simpleApiKey } from '@opensteward/shared'
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Journal } from '../../schema/journal'
import type { TaxRate } from '../../schema/taxrate'
import type { CreditMemo } from '../../schema/creditmemo'
import type { Organization } from '../../schema/organization'

import { getAuthUrl, exchangeCode as doExchangeCode, refreshCredentials as doRefreshCredentials } from './auth'
import { MezanClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, untransformInvoice, type MezanSalesInvoice } from './transform/invoice'
import { transformBill, type MezanPurchasingInvoice } from './transform/bill'
import { transformCustomer, transformVendor, type MezanCustomer, type MezanVendor } from './transform/contact'
import { transformAccount, type MezanAccount } from './transform/account'
import { transformJournal, untransformJournal, type MezanJournal } from './transform/journal'
import { transformOrganization, type MezanOrganization } from './transform/organization'
import { transformTaxRate, type MezanTaxType } from './transform/taxrate'
import { transformCreditMemo, type MezanCreditNote } from './transform/creditmemo'

// ── Pagination response envelope ──────────────────────────────────────────────

interface MezanMeta {
  total?: number
  per_page?: number
  current_page?: number
  last_page?: number
}

interface MezanListResponse<T> {
  data: T[]
  meta?: MezanMeta
}

// ── Adapter ───────────────────────────────────────────────────────────────────

const SIMPLE_API_KEY_FORM = simpleApiKey({
  label: 'Mezan API key',
  helpText: 'Find your API key in Mezan → Settings → Integrations → API Keys (Advanced plan required).',
})

export class MezanAdapter implements AccountingAdapter {
  readonly platform = 'mezan'
  readonly version = '0.1.0'

  // Connect Link support — single API-key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  getAuthUrl(_state: string): string {
    return getAuthUrl(_state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return doExchangeCode(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefreshCredentials(credentials)
  }

  private paginationParams(params: QueryParams): Record<string, unknown> {
    return {
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      page: params.page ?? 1,
      ...(params.updatedAfter && {
        updated_after: params.updatedAfter.toISOString().split('T')[0],
      }),
    }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new MezanClient(credentials)
    const res = await client.get<{ data: MezanOrganization }>('organization')
    return transformOrganization(res.data)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new MezanClient(credentials)
    const res = await client.get<MezanListResponse<MezanSalesInvoice>>(
      'sales-invoices',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new MezanClient(credentials)
    const res = await client.get<{ data: MezanSalesInvoice }>(`sales-invoices/${id}`)
    return transformInvoice(res.data)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new MezanClient(credentials)
    const res = await client.post<{ data: MezanSalesInvoice }>('sales-invoices', untransformInvoice(data))
    return transformInvoice(res.data)
  }

  async updateInvoice(credentials: Credentials, id: string, data: Partial<Invoice>): Promise<Invoice> {
    const client = new MezanClient(credentials)
    const res = await client.put<{ data: MezanSalesInvoice }>(`sales-invoices/${id}`, untransformInvoice(data))
    return transformInvoice(res.data)
  }

  // --- Bills (Purchasing Invoices) ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new MezanClient(credentials)
    const res = await client.get<MezanListResponse<MezanPurchasingInvoice>>(
      'purchasing-invoices',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new MezanClient(credentials)
    const res = await client.get<{ data: MezanPurchasingInvoice }>(`purchasing-invoices/${id}`)
    return transformBill(res.data)
  }

  // --- Contacts (Customers + Vendors) ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new MezanClient(credentials)
    const [custRes, vendRes] = await Promise.all([
      client.get<MezanListResponse<MezanCustomer>>('customers', this.paginationParams(params)),
      client.get<MezanListResponse<MezanVendor>>('vendors', this.paginationParams(params)),
    ])
    const customers = (custRes.data ?? []).map(transformCustomer)
    const vendors = (vendRes.data ?? []).map(transformVendor)
    return [...customers, ...vendors]
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new MezanClient(credentials)
    if (id.startsWith('cust_')) {
      const rawId = id.slice(5)
      const res = await client.get<{ data: MezanCustomer }>(`customers/${rawId}`)
      return transformCustomer(res.data)
    }
    if (id.startsWith('vend_')) {
      const rawId = id.slice(5)
      const res = await client.get<{ data: MezanVendor }>(`vendors/${rawId}`)
      return transformVendor(res.data)
    }
    throw new Error(`Invalid Mezan contact id format: ${id}. Expected cust_<id> or vend_<id>.`)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new MezanClient(credentials)
    if (data.isSupplier && !data.isCustomer) {
      const res = await client.post<{ data: MezanVendor }>('vendors', {
        name: data.name,
        tax_number: data.taxNumber,
        primary_email: data.emails?.[0]?.email,
        primary_phone: data.telephones?.[0]?.telephone,
        country: data.billingAddress?.country,
        city: data.billingAddress?.city,
        address: data.billingAddress?.address1,
        zipcode: data.billingAddress?.postalCode,
      })
      return transformVendor(res.data)
    }
    const res = await client.post<{ data: MezanCustomer }>('customers', {
      name: data.name,
      tax_number: data.taxNumber,
      primary_email: data.emails?.[0]?.email,
      primary_phone: data.telephones?.[0]?.telephone,
      country: data.billingAddress?.country,
      city: data.billingAddress?.city,
      address: data.billingAddress?.address1,
      zipcode: data.billingAddress?.postalCode,
    })
    return transformCustomer(res.data)
  }

  async updateContact(credentials: Credentials, id: string, data: Partial<Contact>): Promise<Contact> {
    const client = new MezanClient(credentials)
    if (id.startsWith('vend_')) {
      const rawId = id.slice(5)
      const res = await client.put<{ data: MezanVendor }>(`vendors/${rawId}`, {
        name: data.name,
        primary_email: data.emails?.[0]?.email,
        primary_phone: data.telephones?.[0]?.telephone,
      })
      return transformVendor(res.data)
    }
    const rawId = id.startsWith('cust_') ? id.slice(5) : id
    const res = await client.put<{ data: MezanCustomer }>(`customers/${rawId}`, {
      name: data.name,
      primary_email: data.emails?.[0]?.email,
      primary_phone: data.telephones?.[0]?.telephone,
      country: data.billingAddress?.country,
      city: data.billingAddress?.city,
      address: data.billingAddress?.address1,
      zipcode: data.billingAddress?.postalCode,
    })
    return transformCustomer(res.data)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new MezanClient(credentials)
    const res = await client.get<MezanListResponse<MezanAccount>>(
      'accounts',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new MezanClient(credentials)
    const res = await client.get<{ data: MezanAccount }>(`accounts/${id}`)
    return transformAccount(res.data)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new MezanClient(credentials)
    const res = await client.get<MezanListResponse<MezanTaxType>>(
      'tax-types',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new MezanClient(credentials)
    const res = await client.get<{ data: MezanTaxType }>(`tax-types/${id}`)
    return transformTaxRate(res.data)
  }

  // --- Journals (Manual Journals) ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new MezanClient(credentials)
    const res = await client.get<MezanListResponse<MezanJournal>>(
      'journals',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new MezanClient(credentials)
    const res = await client.get<{ data: MezanJournal }>(`journals/${id}`)
    return transformJournal(res.data)
  }

  async createJournal(credentials: Credentials, data: Partial<Journal>): Promise<Journal> {
    const client = new MezanClient(credentials)
    const res = await client.post<{ data: MezanJournal }>('journals', untransformJournal(data))
    return transformJournal(res.data)
  }

  // --- Credit Memos (Credit Notes) ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new MezanClient(credentials)
    const res = await client.get<MezanListResponse<MezanCreditNote>>(
      'credit-notes',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new MezanClient(credentials)
    const res = await client.get<{ data: MezanCreditNote }>(`credit-notes/${id}`)
    return transformCreditMemo(res.data)
  }
}
