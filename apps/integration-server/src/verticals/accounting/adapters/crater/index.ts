/**
 * Crater accounting adapter.
 *
 * Crater is an open-source, self-hosted invoicing platform.
 * REST docs: https://docs.crater.financial/
 *
 * Auth: Bearer token (personal-access grant).  Because the API lives on the
 * customer's own domain, `baseUrl` and optionally `businessId` must be
 * collected at credential-entry time and stored in credentials.extra.
 *
 * Supported resources:
 *   - Organization   GET /api/v1/businesses/{id}
 *   - Invoices       GET/POST/PUT /api/v1/invoices
 *   - Contacts       GET /api/v1/customers  +  GET /api/v1/vendors
 *   - Tax rates      GET /api/v1/tax-types
 *   - Transactions   GET /api/v1/payments
 */
import { customForm } from '@opensteward/shared'
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Contact } from '../../schema/contact'
import type { TaxRate } from '../../schema/taxrate'
import type { Transaction } from '../../schema/transaction'
import type { Organization } from '../../schema/organization'
import type { Account } from '../../schema/account'
import type { Expense } from '../../schema/expense'
import type { Order } from '../../schema/order'

import { buildAuthUrl, exchangeCode, refreshCredentials as refreshCreds } from './auth'
import { CraterClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, untransformInvoice, type CraterInvoice } from './transform/invoice'
import { transformContact, type CraterContactBusiness } from './transform/contact'
import { transformTaxRate, type CraterTaxType } from './transform/taxrate'
import { transformTransaction, type CraterPayment } from './transform/transaction'
import { transformOrganization, type CraterBusiness } from './transform/organization'
import { transformAccount, type CraterAccount } from './transform/account'
import { transformExpense, type CraterExpense } from './transform/expense'
import { transformOrder, type CraterEstimate } from './transform/order'
import { craterWebhook } from './webhook'

// ── Resource coverage ──────────────────────────────────────────────────────────
// Unavailable: bill          — Crater is invoice-only; no bill/AP endpoint exists in the API.
// Unavailable: creditmemo    — No credit memo or credit note concept in Crater's API.
// Unavailable: journal       — Crater does not expose double-entry journal entries.
// Unavailable: purchaseorder — No purchase order endpoint; confirmed absent in routes/api.php and docs.crater.financial.
// Unavailable: salesorder    — No sales order endpoint; estimates are already mapped to the order resource.

// ── Credential form ───────────────────────────────────────────────────────────

const CRATER_FORM = customForm({
  fields: [
    {
      name: 'baseUrl',
      label: 'Instance URL',
      type: 'url',
      placeholder: 'https://invoice.yourcompany.com',
      helpText: 'The base URL of your Crater installation.',
      required: true,
    },
    {
      name: 'apiToken',
      label: 'API token',
      type: 'password',
      helpText: 'Personal access token from Settings → Developer → API Tokens.',
      required: true,
    },
    {
      name: 'businessId',
      label: 'Business ID (optional)',
      type: 'text',
      helpText: 'Your Crater business ID.  Required for multi-business instances.',
      required: false,
    },
  ],
  async exchange(fields) {
    const baseUrl = (fields['baseUrl'] ?? '').trim().replace(/\/+$/, '')
    const apiToken = (fields['apiToken'] ?? '').trim()
    if (!baseUrl) throw new Error('Instance URL is required.')
    if (!apiToken) throw new Error('API token is required.')
    const businessId = (fields['businessId'] ?? '').trim()
    return {
      accessToken: apiToken,
      tenantId: businessId || undefined,
      extra: { baseUrl },
    }
  },
})

// ── Pagination envelope ───────────────────────────────────────────────────────

interface CraterPage<T> {
  data: T[]
  meta?: {
    current_page: number
    last_page: number
    per_page: number
    total: number
  }
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class CraterAdapter implements AccountingAdapter {
  readonly platform = 'crater'
  readonly version = '0.1.0'

  // Connect Link form — collects baseUrl + apiToken + optional businessId
  credentialFields = CRATER_FORM.credentialFields
  exchangeCredentials = CRATER_FORM.exchangeCredentials

  getAuthUrl(_state: string): string {
    return buildAuthUrl('')
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeCode(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshCreds(credentials)
  }

  // Webhook support
  verifyWebhook = craterWebhook.verifyWebhook.bind(craterWebhook)
  parseWebhookEvents = craterWebhook.parseWebhookEvents.bind(craterWebhook)

  // ── Pagination params ───────────────────────────────────────────────────────

  private paginationParams(params: QueryParams): Record<string, unknown> {
    return {
      limit: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      page: params.page ?? 1,
    }
  }

  // ── Organization ────────────────────────────────────────────────────────────

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new CraterClient(credentials)
    // If we have a tenantId (business ID) fetch it directly; otherwise use
    // the first business from the list.
    if (credentials.tenantId) {
      const res = await client.get<{ data: CraterBusiness }>(`businesses/${credentials.tenantId}`)
      return transformOrganization(res.data)
    }
    const res = await client.get<CraterPage<CraterBusiness>>('businesses', { limit: 1, page: 1 })
    const biz = res.data?.[0]
    if (!biz) throw new Error('No Crater business found for these credentials.')
    return transformOrganization(biz)
  }

  // ── Invoices ────────────────────────────────────────────────────────────────

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new CraterClient(credentials)
    const res = await client.get<CraterPage<CraterInvoice>>(
      'invoices',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new CraterClient(credentials)
    const res = await client.get<{ data: CraterInvoice }>(`invoices/${id}`)
    return transformInvoice(res.data)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new CraterClient(credentials)
    const res = await client.post<{ data: CraterInvoice }>('invoices', untransformInvoice(data))
    return transformInvoice(res.data)
  }

  async updateInvoice(credentials: Credentials, id: string, data: Partial<Invoice>): Promise<Invoice> {
    const client = new CraterClient(credentials)
    const res = await client.put<{ data: CraterInvoice }>(`invoices/${id}`, untransformInvoice(data))
    return transformInvoice(res.data)
  }

  async deleteInvoice(credentials: Credentials, id: string): Promise<void> {
    const client = new CraterClient(credentials)
    await client.delete(`invoices/${id}`)
  }

  // ── Contacts (customers + vendors) ─────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new CraterClient(credentials)
    const pp = this.paginationParams(params)
    const [custRes, vendRes] = await Promise.all([
      client.get<CraterPage<CraterContactBusiness>>('customers', pp),
      client.get<CraterPage<CraterContactBusiness>>('vendors', pp),
    ])
    const customers = (custRes.data ?? []).map((c) => transformContact(c, 'customer'))
    const vendors = (vendRes.data ?? []).map((v) => transformContact(v, 'vendor'))
    return [...customers, ...vendors]
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new CraterClient(credentials)
    if (id.startsWith('vend_')) {
      const rawId = id.slice(5)
      const res = await client.get<{ data: CraterContactBusiness }>(`vendors/${rawId}`)
      return transformContact(res.data, 'vendor')
    }
    // Default: treat as customer (IDs are plain UUIDs)
    const rawId = id.startsWith('cust_') ? id.slice(5) : id
    const res = await client.get<{ data: CraterContactBusiness }>(`customers/${rawId}`)
    return transformContact(res.data, 'customer')
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new CraterClient(credentials)
    const body = {
      name: data.name,
      email: data.emails?.[0]?.email,
      phone: data.telephones?.[0]?.telephone,
      billing_address: data.billingAddress
        ? {
            street_1: data.billingAddress.address1,
            street_2: data.billingAddress.address2,
            city: data.billingAddress.city,
            state: data.billingAddress.region,
            zip: data.billingAddress.postalCode,
          }
        : undefined,
    }
    if (data.isSupplier && !data.isCustomer) {
      const res = await client.post<{ data: CraterContactBusiness }>('vendors', body)
      return transformContact(res.data, 'vendor')
    }
    const res = await client.post<{ data: CraterContactBusiness }>('customers', body)
    return transformContact(res.data, 'customer')
  }

  async updateContact(credentials: Credentials, id: string, data: Partial<Contact>): Promise<Contact> {
    const client = new CraterClient(credentials)
    const body = {
      name: data.name,
      email: data.emails?.[0]?.email,
      phone: data.telephones?.[0]?.telephone,
    }
    if (id.startsWith('vend_')) {
      const rawId = id.slice(5)
      const res = await client.put<{ data: CraterContactBusiness }>(`vendors/${rawId}`, body)
      return transformContact(res.data, 'vendor')
    }
    const rawId = id.startsWith('cust_') ? id.slice(5) : id
    const res = await client.put<{ data: CraterContactBusiness }>(`customers/${rawId}`, body)
    return transformContact(res.data, 'customer')
  }

  // ── Tax rates ───────────────────────────────────────────────────────────────

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new CraterClient(credentials)
    const res = await client.get<CraterPage<CraterTaxType>>(
      'tax-types',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new CraterClient(credentials)
    const res = await client.get<{ data: CraterTaxType }>(`tax-types/${id}`)
    return transformTaxRate(res.data)
  }

  // ── Transactions (payments) ─────────────────────────────────────────────────

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new CraterClient(credentials)
    const res = await client.get<CraterPage<CraterPayment>>(
      'payments',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new CraterClient(credentials)
    const res = await client.get<{ data: CraterPayment }>(`payments/${id}`)
    return transformTransaction(res.data)
  }

  // ── Accounts (chart of accounts) ────────────────────────────────────────────

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new CraterClient(credentials)
    const res = await client.get<CraterPage<CraterAccount>>(
      'accounts',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new CraterClient(credentials)
    const res = await client.get<{ data: CraterAccount }>(`accounts/${id}`)
    return transformAccount(res.data)
  }

  // ── Expenses ────────────────────────────────────────────────────────────────

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new CraterClient(credentials)
    const res = await client.get<CraterPage<CraterExpense>>(
      'expenses',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new CraterClient(credentials)
    const res = await client.get<{ data: CraterExpense }>(`expenses/${id}`)
    return transformExpense(res.data)
  }

  // ── Orders (estimates) ──────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new CraterClient(credentials)
    const res = await client.get<CraterPage<CraterEstimate>>(
      'estimates',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new CraterClient(credentials)
    const res = await client.get<{ data: CraterEstimate }>(`estimates/${id}`)
    return transformOrder(res.data)
  }
}
