import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { TaxRate } from '../../schema/taxrate'
import type { CreditMemo } from '../../schema/creditmemo'
import type { Organization } from '../../schema/organization'

import { buildAuthUrl, exchangeCode, refreshAccessToken } from './auth'
import { AccountsPortalClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, untransformInvoice, type APInvoice } from './transform/invoice'
import { transformBill, type APBill } from './transform/bill'
import { transformContact, type APContact } from './transform/contact'
import { transformAccount, type APAccount } from './transform/account'
import { transformOrganization, type APOrganization } from './transform/organization'
import { transformTaxRate, type APTaxRate } from './transform/taxrate'
import { transformCreditMemo, type APCreditNote } from './transform/creditmemo'

// ── Resource coverage ──────────────────────────────────────────────
// Unverified: expense      — AccountsPortal has no public REST API (see constants.ts); cannot confirm /expenses endpoint exists
// Unverified: journal      — AccountsPortal has no public REST API (see constants.ts); cannot confirm /journals endpoint exists
// Unverified: order        — AccountsPortal has no public REST API (see constants.ts); cannot confirm /orders endpoint exists
// Unverified: purchaseorder — AccountsPortal has no public REST API (see constants.ts); cannot confirm /purchase_orders endpoint exists
// Unverified: salesorder   — AccountsPortal has no public REST API (see constants.ts); cannot confirm /sales_orders endpoint exists
// Unverified: transaction  — AccountsPortal has no public REST API (see constants.ts); cannot confirm /transactions endpoint exists
// ───────────────────────────────────────────────────────────────────

interface AccountsPortalAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}

// AccountsPortal paginates with `page` + `per_page` query params.
function pageParams(params: QueryParams, maxPageSize: number): Record<string, unknown> {
  return {
    page: params.page ?? 1,
    per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, maxPageSize),
  }
}

export class AccountsportalAdapter implements AccountingAdapter {
  readonly platform = 'accountsportal'
  readonly version = '0.1.0'

  private config: AccountsPortalAdapterConfig

  constructor(config: AccountsPortalAdapterConfig) {
    this.config = config
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(
      this.config.clientId,
      this.config.redirectUri,
      overrideScopes ?? this.config.scopes,
      state,
    )
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return exchangeCode(code, this.config.clientId, this.config.clientSecret, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) throw new Error('No refresh token available')
    return refreshAccessToken(
      credentials.refreshToken,
      this.config.clientId,
      this.config.clientSecret,
    )
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new AccountsPortalClient(credentials)
    const res = await client.get<{ company: APOrganization }>('company')
    return transformOrganization(res.company)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new AccountsPortalClient(credentials)
    const query: Record<string, unknown> = pageParams(params, MAX_PAGE_SIZE)
    if (params.updatedAfter) {
      query['updated_after'] = params.updatedAfter.toISOString()
    }
    const res = await client.get<{ invoices: APInvoice[] }>('invoices', query)
    return (res.invoices ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new AccountsPortalClient(credentials)
    const res = await client.get<{ invoice: APInvoice }>(`invoices/${id}`)
    return transformInvoice(res.invoice)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new AccountsPortalClient(credentials)
    const res = await client.post<{ invoice: APInvoice }>('invoices', {
      invoice: untransformInvoice(data),
    })
    return transformInvoice(res.invoice)
  }

  async updateInvoice(
    credentials: Credentials,
    id: string,
    data: Partial<Invoice>,
  ): Promise<Invoice> {
    const client = new AccountsPortalClient(credentials)
    const res = await client.put<{ invoice: APInvoice }>(`invoices/${id}`, {
      invoice: untransformInvoice(data),
    })
    return transformInvoice(res.invoice)
  }

  // --- Bills (purchase invoices) ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new AccountsPortalClient(credentials)
    const query: Record<string, unknown> = pageParams(params, MAX_PAGE_SIZE)
    if (params.updatedAfter) {
      query['updated_after'] = params.updatedAfter.toISOString()
    }
    const res = await client.get<{ bills: APBill[] }>('bills', query)
    return (res.bills ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new AccountsPortalClient(credentials)
    const res = await client.get<{ bill: APBill }>(`bills/${id}`)
    return transformBill(res.bill)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new AccountsPortalClient(credentials)
    const pq = pageParams(params, MAX_PAGE_SIZE)
    const [custRes, supRes] = await Promise.all([
      client.get<{ customers: APContact[] }>('customers', pq),
      client.get<{ suppliers: APContact[] }>('suppliers', pq),
    ])
    const customers = (custRes.customers ?? []).map((c) =>
      transformContact({ ...c, contact_type: 'customer' }),
    )
    const suppliers = (supRes.suppliers ?? []).map((s) =>
      transformContact({ ...s, contact_type: 'supplier' }),
    )
    return [...customers, ...suppliers]
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new AccountsPortalClient(credentials)
    // id is prefixed with 'c_' for customers, 's_' for suppliers
    if (id.startsWith('s_')) {
      const rawId = id.slice(2)
      const res = await client.get<{ supplier: APContact }>(`suppliers/${rawId}`)
      return transformContact({ ...res.supplier, contact_type: 'supplier' })
    }
    const rawId = id.startsWith('c_') ? id.slice(2) : id
    const res = await client.get<{ customer: APContact }>(`customers/${rawId}`)
    return transformContact({ ...res.customer, contact_type: 'customer' })
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new AccountsPortalClient(credentials)
    if (data.isSupplier && !data.isCustomer) {
      const res = await client.post<{ supplier: APContact }>('suppliers', {
        supplier: {
          name: data.name,
          company_name: data.companyName,
          email: data.emails?.[0]?.email,
          phone: data.telephones?.find((t) => t.type === 'WORK')?.telephone,
          mobile: data.telephones?.find((t) => t.type === 'MOBILE')?.telephone,
          vat_number: data.taxNumber,
          address_line_1: data.billingAddress?.address1,
          city: data.billingAddress?.city,
          postcode: data.billingAddress?.postalCode,
          country: data.billingAddress?.country,
        },
      })
      return transformContact({ ...res.supplier, contact_type: 'supplier' })
    }
    const res = await client.post<{ customer: APContact }>('customers', {
      customer: {
        name: data.name,
        company_name: data.companyName,
        email: data.emails?.[0]?.email,
        phone: data.telephones?.find((t) => t.type === 'WORK')?.telephone,
        mobile: data.telephones?.find((t) => t.type === 'MOBILE')?.telephone,
        vat_number: data.taxNumber,
        address_line_1: data.billingAddress?.address1,
        city: data.billingAddress?.city,
        postcode: data.billingAddress?.postalCode,
        country: data.billingAddress?.country,
      },
    })
    return transformContact({ ...res.customer, contact_type: 'customer' })
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const client = new AccountsPortalClient(credentials)
    if (id.startsWith('s_')) {
      const rawId = id.slice(2)
      const res = await client.put<{ supplier: APContact }>(`suppliers/${rawId}`, {
        supplier: {
          name: data.name,
          company_name: data.companyName,
          email: data.emails?.[0]?.email,
          phone: data.telephones?.find((t) => t.type === 'WORK')?.telephone,
          mobile: data.telephones?.find((t) => t.type === 'MOBILE')?.telephone,
        },
      })
      return transformContact({ ...res.supplier, contact_type: 'supplier' })
    }
    const rawId = id.startsWith('c_') ? id.slice(2) : id
    const res = await client.put<{ customer: APContact }>(`customers/${rawId}`, {
      customer: {
        name: data.name,
        company_name: data.companyName,
        email: data.emails?.[0]?.email,
        phone: data.telephones?.find((t) => t.type === 'WORK')?.telephone,
        mobile: data.telephones?.find((t) => t.type === 'MOBILE')?.telephone,
      },
    })
    return transformContact({ ...res.customer, contact_type: 'customer' })
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new AccountsPortalClient(credentials)
    const res = await client.get<{ accounts: APAccount[] }>('accounts', pageParams(params, MAX_PAGE_SIZE))
    return (res.accounts ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new AccountsPortalClient(credentials)
    const res = await client.get<{ account: APAccount }>(`accounts/${id}`)
    return transformAccount(res.account)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new AccountsPortalClient(credentials)
    const res = await client.get<{ tax_rates: APTaxRate[] }>('tax_rates', pageParams(params, MAX_PAGE_SIZE))
    return (res.tax_rates ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new AccountsPortalClient(credentials)
    const res = await client.get<{ tax_rate: APTaxRate }>(`tax_rates/${id}`)
    return transformTaxRate(res.tax_rate)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new AccountsPortalClient(credentials)
    const res = await client.get<{ credit_notes: APCreditNote[] }>(
      'credit_notes',
      pageParams(params, MAX_PAGE_SIZE),
    )
    return (res.credit_notes ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new AccountsPortalClient(credentials)
    const res = await client.get<{ credit_note: APCreditNote }>(`credit_notes/${id}`)
    return transformCreditMemo(res.credit_note)
  }
}
