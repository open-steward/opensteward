/**
 * Fakturownia accounting adapter.
 *
 * Auth: api_key (static token) + account subdomain.
 * Supported resources: Organization, Invoices, Bills, Contacts, TaxRates,
 *                      CreditMemos (correction invoices), Transactions (payments).
 *
 * The api_token is provided via the Connect Link form and stored as
 * credentials.accessToken.  The account subdomain is stored in
 * credentials.extra.account.
 *
 * Base URL pattern: https://{account}.fakturownia.pl/
 * All requests append ?api_token={token}.
 *
 * Docs: https://github.com/fakturownia/api
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: account       — No chart of accounts; /accounts.json is tenant administration only
 * Unavailable: expense       — No distinct expense-report resource; cost invoices covered by bill
 * Unavailable: journal       — No journal entry endpoint in Fakturownia API
 * Unavailable: order         — No order resource; advance invoices are not a canonical order object
 * Unavailable: purchaseorder — No purchase order endpoint in Fakturownia API
 * Unavailable: salesorder    — No sales order endpoint in Fakturownia API
 */
import { customForm } from '@opensteward/shared'
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { TaxRate } from '../../schema/taxrate'
import type { Organization } from '../../schema/organization'
import type { CreditMemo } from '../../schema/creditmemo'
import type { Transaction } from '../../schema/transaction'

import { refreshCredentials } from './auth'
import { FakturowniaClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, untransformInvoice, type FakturowniaInvoice } from './transform/invoice'
import { transformBill } from './transform/bill'
import { transformClient, type FakturowniaClient as FakturowniaClientModel } from './transform/contact'
import { transformTaxRate, type FakturowniaCategory } from './transform/taxrate'
import { transformOrganization, type FakturowniaAccount } from './transform/organization'
import { transformCreditMemo } from './transform/creditmemo'
import { transformTransaction, type FakturowniaPayment } from './transform/transaction'

// ── Connect Link form ─────────────────────────────────────────────────────────

const FORM = customForm({
  fields: [
    {
      name: 'account',
      label: 'Account subdomain',
      type: 'text',
      placeholder: 'yourcompany',
      helpText: 'The part before .fakturownia.pl in your Fakturownia URL',
      required: true,
    },
    {
      name: 'apiKey',
      label: 'API token',
      type: 'password',
      placeholder: 'xxxx-AbCdEf...',
      helpText: 'Find it at Ustawienia → Ustawienia konta → Integracja → Kod autoryzacyjny API',
      required: true,
    },
  ],
  async exchange(fields) {
    const apiKey = (fields['apiKey'] ?? '').trim()
    const account = (fields['account'] ?? '').trim()
    if (!apiKey) throw new Error('API token is required.')
    if (!account) throw new Error('Account subdomain is required.')
    return {
      accessToken: apiKey,
      extra: { account },
    }
  },
})

// ── Adapter ───────────────────────────────────────────────────────────────────

export class FakturowniaAdapter implements AccountingAdapter {
  readonly platform = 'fakturownia'
  readonly version = '0.1.0'

  // Connect Link support
  credentialFields = FORM.credentialFields
  exchangeCredentials = FORM.exchangeCredentials

  // No OAuth flow — these are no-ops that satisfy the BaseAdapter interface
  getAuthUrl(_state: string): string {
    return ''
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('Fakturownia does not use OAuth. Use exchangeCredentials instead.')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshCredentials(credentials)
  }

  // ── Pagination helpers ──────────────────────────────────────────────────────

  private pageParams(params: QueryParams): Record<string, unknown> {
    const p: Record<string, unknown> = {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    }
    if (params.updatedAfter) {
      // Fakturownia supports date_from / date_to for invoice filtering
      p['date_from'] = params.updatedAfter.toISOString().split('T')[0]
      p['search_date_type'] = 'issue_date'
    }
    return p
  }

  // ── Organization ────────────────────────────────────────────────────────────

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new FakturowniaClient(credentials)
    const raw = await client.get<FakturowniaAccount>('account.json')
    return transformOrganization(raw)
  }

  // ── Invoices (income=1) ─────────────────────────────────────────────────────

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new FakturowniaClient(credentials)
    const res = await client.get<FakturowniaInvoice[]>('invoices.json', {
      ...this.pageParams(params),
      income: 1,
      include_positions: 'true',
    })
    return (res ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new FakturowniaClient(credentials)
    const raw = await client.get<FakturowniaInvoice>(`invoices/${id}.json`, {
      include_positions: 'true',
    })
    return transformInvoice(raw)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new FakturowniaClient(credentials)
    const raw = await client.post<FakturowniaInvoice>('invoices.json', {
      invoice: untransformInvoice(data),
    })
    return transformInvoice(raw)
  }

  async updateInvoice(
    credentials: Credentials,
    id: string,
    data: Partial<Invoice>,
  ): Promise<Invoice> {
    const client = new FakturowniaClient(credentials)
    const raw = await client.put<FakturowniaInvoice>(`invoices/${id}.json`, {
      invoice: untransformInvoice(data),
    })
    return transformInvoice(raw)
  }

  async deleteInvoice(credentials: Credentials, id: string): Promise<void> {
    const client = new FakturowniaClient(credentials)
    await client.delete(`invoices/${id}.json`)
  }

  // ── Bills (income=0 — expense invoices) ─────────────────────────────────────

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new FakturowniaClient(credentials)
    const res = await client.get<FakturowniaInvoice[]>('invoices.json', {
      ...this.pageParams(params),
      income: 0,
      include_positions: 'true',
    })
    return (res ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new FakturowniaClient(credentials)
    const raw = await client.get<FakturowniaInvoice>(`invoices/${id}.json`, {
      include_positions: 'true',
    })
    return transformBill(raw)
  }

  // ── Contacts (clients) ──────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new FakturowniaClient(credentials)
    const res = await client.get<FakturowniaClientModel[]>('clients.json', this.pageParams(params))
    return (res ?? []).map(transformClient)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new FakturowniaClient(credentials)
    const raw = await client.get<FakturowniaClientModel>(`clients/${id}.json`)
    return transformClient(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new FakturowniaClient(credentials)
    const body: Record<string, unknown> = {
      name: data.companyName ?? data.name,
      first_name: data.firstName,
      last_name: data.lastName,
      email: data.emails?.[0]?.email,
      phone: data.telephones?.find((t) => t.type === 'WORK')?.telephone,
      mobile_phone: data.telephones?.find((t) => t.type === 'MOBILE')?.telephone,
      tax_no: data.taxNumber,
      street: data.billingAddress?.address1,
      city: data.billingAddress?.city,
      post_code: data.billingAddress?.postalCode,
      country: data.billingAddress?.country,
      company: !!data.companyName,
      kind: data.isSupplier && !data.isCustomer
        ? 'seller'
        : data.isCustomer && data.isSupplier
          ? 'both'
          : 'buyer',
      currency: data.currency,
    }
    const raw = await client.post<FakturowniaClientModel>('clients.json', { client: body })
    return transformClient(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const client = new FakturowniaClient(credentials)
    const body: Record<string, unknown> = {
      name: data.companyName ?? data.name,
      first_name: data.firstName,
      last_name: data.lastName,
      email: data.emails?.[0]?.email,
      phone: data.telephones?.find((t) => t.type === 'WORK')?.telephone,
      mobile_phone: data.telephones?.find((t) => t.type === 'MOBILE')?.telephone,
      street: data.billingAddress?.address1,
      city: data.billingAddress?.city,
      post_code: data.billingAddress?.postalCode,
      country: data.billingAddress?.country,
    }
    const raw = await client.put<FakturowniaClientModel>(`clients/${id}.json`, { client: body })
    return transformClient(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    const client = new FakturowniaClient(credentials)
    await client.delete(`clients/${id}.json`)
  }

  // ── Credit Memos (correction invoices, kind=correction) ─────────────────────

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new FakturowniaClient(credentials)
    const res = await client.get<FakturowniaInvoice[]>('invoices.json', {
      ...this.pageParams(params),
      kind: 'correction',
      include_positions: 'true',
    })
    return (res ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new FakturowniaClient(credentials)
    const raw = await client.get<FakturowniaInvoice>(`invoices/${id}.json`, {
      include_positions: 'true',
    })
    return transformCreditMemo(raw)
  }

  // ── Transactions (payments / banking_payment) ────────────────────────────────

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new FakturowniaClient(credentials)
    const res = await client.get<FakturowniaPayment[]>('payments.json', this.pageParams(params))
    return (res ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new FakturowniaClient(credentials)
    const raw = await client.get<FakturowniaPayment>(`payments/${id}.json`)
    return transformTransaction(raw)
  }

  // ── Tax Rates (categories) ──────────────────────────────────────────────────

  async listTaxRates(credentials: Credentials, _params: QueryParams): Promise<TaxRate[]> {
    const client = new FakturowniaClient(credentials)
    const res = await client.get<FakturowniaCategory[]>('categories.json')
    return (res ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new FakturowniaClient(credentials)
    const raw = await client.get<FakturowniaCategory>(`categories/${id}.json`)
    return transformTaxRate(raw)
  }
}
