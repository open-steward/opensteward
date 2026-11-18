/**
 * wFirma accounting adapter.
 *
 * wFirma is a Polish cloud accounting platform (https://wfirma.pl).
 * Auth: API key — three headers: accessKey / secretKey / appKey
 * API base: https://api2.wfirma.pl
 *
 * Supported resources:
 *   - Organization  (companies)
 *   - Invoices      (invoices)
 *   - Bills         (expenses — supplier purchase invoices)
 *   - Contacts      (contractors)
 *   - TaxRates      (vat_codes)
 *   - Transactions  (payments)
 *   - CreditMemos   (invoices with type=correction / korygująca)
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: account — wFirma has no chart-of-accounts ledger API; companyaccounts module covers bank accounts only
 * Unavailable: journal — no journal entries endpoint in wFirma v2 API
 * Unavailable: expense — wFirma has no employee expense-report concept; its /expenses module maps to Bill (supplier invoices)
 * Unavailable: order — no generic orders endpoint in wFirma v2 API
 * Unavailable: salesorder — no sales orders endpoint in wFirma v2 API
 * Unavailable: purchaseorder — no purchase orders endpoint in wFirma v2 API
 */

import { customForm } from '@opensteward/shared'
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Organization } from '../../schema/organization'
import type { TaxRate } from '../../schema/taxrate'
import type { Transaction } from '../../schema/transaction'
import type { CreditMemo } from '../../schema/creditmemo'

import { WfirmaClient, extractList, extractOne } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { buildCredentialsFromFields } from './auth'

import {
  transformInvoice,
  untransformInvoice,
  type WfirmaInvoice,
} from './transform/invoice'
import { transformBill, type WfirmaExpense } from './transform/bill'
import {
  transformContractor,
  untransformContractor,
  type WfirmaContractor,
} from './transform/contact'
import { transformOrganization, type WfirmaCompany } from './transform/organization'
import { transformVatCode, type WfirmaVatCode } from './transform/taxrate'
import { transformPayment, type WfirmaPayment } from './transform/transaction'
import { transformCreditMemo } from './transform/creditmemo'

// ── Connect Link credential form ──────────────────────────────────────────────

const WFIRMA_FORM = customForm({
  fields: [
    {
      name: 'accessKey',
      label: 'Access key',
      type: 'text',
      required: true,
      helpText: 'Found in wFirma Settings → Security → Applications → API Keys',
    },
    {
      name: 'secretKey',
      label: 'Secret key',
      type: 'password',
      required: true,
      helpText: 'Displayed once when the API key is first created',
    },
    {
      name: 'appKey',
      label: 'App key',
      type: 'text',
      required: true,
      helpText: 'Application key assigned by wFirma for this integration',
    },
  ],
  exchange: async (fields) => buildCredentialsFromFields(fields),
})

// ── Adapter ───────────────────────────────────────────────────────────────────

export class WfirmaAdapter implements AccountingAdapter {
  readonly platform = 'wfirma'
  readonly version = '0.1.0'

  // Connect Link support — three-field API key form
  credentialFields = WFIRMA_FORM.credentialFields
  exchangeCredentials = WFIRMA_FORM.exchangeCredentials

  // wFirma is not an OAuth platform — these required BaseAdapter methods
  // are no-ops / pass-throughs for API-key adapters.
  getAuthUrl(_state: string): string {
    return 'https://wfirma.pl/settings/applications'
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // For api_key adapters the "code" is treated as the accessKey.
    return { accessToken: code }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // API keys don't expire; return unchanged.
    return credentials
  }

  private paginationParams(params: QueryParams): Record<string, unknown> {
    return {
      limit: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      page: params.page ?? 1,
    }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new WfirmaClient(credentials)
    const extra = (credentials.extra ?? {}) as Record<string, unknown>
    const companyId = extra['companyId']
    const path = companyId ? `/companies/get/${companyId}` : '/companies/find'

    if (companyId) {
      const data = await client.get<Record<string, unknown>>(path)
      const company = extractOne<WfirmaCompany>(data, 'companies', 'company')
      return transformOrganization(company)
    }

    // If no companyId, find the first available company
    const data = await client.find<Record<string, unknown>>('companies', { limit: 1, page: 1 })
    const companies = extractList<WfirmaCompany>(data, 'companies', 'company')
    if (companies.length === 0) throw new Error('wFirma: no company found')
    return transformOrganization(companies[0])
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new WfirmaClient(credentials)
    const data = await client.find<Record<string, unknown>>('invoices', this.paginationParams(params))
    const invoices = extractList<WfirmaInvoice>(data, 'invoices', 'invoice')
    return invoices.map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new WfirmaClient(credentials)
    const data = await client.get<Record<string, unknown>>(`/invoices/get/${id}`)
    const invoice = extractOne<WfirmaInvoice>(data, 'invoices', 'invoice')
    return transformInvoice(invoice)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new WfirmaClient(credentials)
    const res = await client.add<Record<string, unknown>>(
      'invoices',
      'invoice',
      untransformInvoice(data),
    )
    const invoice = extractOne<WfirmaInvoice>(res, 'invoices', 'invoice')
    return transformInvoice(invoice)
  }

  async updateInvoice(credentials: Credentials, id: string, data: Partial<Invoice>): Promise<Invoice> {
    const client = new WfirmaClient(credentials)
    const res = await client.edit<Record<string, unknown>>(
      'invoices',
      'invoice',
      id,
      untransformInvoice(data),
    )
    const invoice = extractOne<WfirmaInvoice>(res, 'invoices', 'invoice')
    return transformInvoice(invoice)
  }

  // --- Bills (wFirma: expenses = supplier purchase invoices) ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new WfirmaClient(credentials)
    const data = await client.find<Record<string, unknown>>('expenses', this.paginationParams(params))
    const expenses = extractList<WfirmaExpense>(data, 'expenses', 'expense')
    return expenses.map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new WfirmaClient(credentials)
    const data = await client.get<Record<string, unknown>>(`/expenses/get/${id}`)
    const expense = extractOne<WfirmaExpense>(data, 'expenses', 'expense')
    return transformBill(expense)
  }

  // --- Contacts (wFirma: contractors) ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new WfirmaClient(credentials)
    const data = await client.find<Record<string, unknown>>('contractors', this.paginationParams(params))
    const contractors = extractList<WfirmaContractor>(data, 'contractors', 'contractor')
    return contractors.map(transformContractor)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new WfirmaClient(credentials)
    const data = await client.get<Record<string, unknown>>(`/contractors/get/${id}`)
    const contractor = extractOne<WfirmaContractor>(data, 'contractors', 'contractor')
    return transformContractor(contractor)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new WfirmaClient(credentials)
    const res = await client.add<Record<string, unknown>>(
      'contractors',
      'contractor',
      untransformContractor(data),
    )
    const contractor = extractOne<WfirmaContractor>(res, 'contractors', 'contractor')
    return transformContractor(contractor)
  }

  async updateContact(credentials: Credentials, id: string, data: Partial<Contact>): Promise<Contact> {
    const client = new WfirmaClient(credentials)
    const res = await client.edit<Record<string, unknown>>(
      'contractors',
      'contractor',
      id,
      untransformContractor(data),
    )
    const contractor = extractOne<WfirmaContractor>(res, 'contractors', 'contractor')
    return transformContractor(contractor)
  }

  // --- Tax Rates (wFirma: vat_codes) ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new WfirmaClient(credentials)
    const data = await client.find<Record<string, unknown>>('vat_codes', this.paginationParams(params))
    const vatCodes = extractList<WfirmaVatCode>(data, 'vat_codes', 'vat_code')
    return vatCodes.map(transformVatCode)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new WfirmaClient(credentials)
    const data = await client.get<Record<string, unknown>>(`/vat_codes/get/${id}`)
    const vatCode = extractOne<WfirmaVatCode>(data, 'vat_codes', 'vat_code')
    return transformVatCode(vatCode)
  }

  // --- Transactions (wFirma: payments) ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new WfirmaClient(credentials)
    const data = await client.find<Record<string, unknown>>('payments', this.paginationParams(params))
    const payments = extractList<WfirmaPayment>(data, 'payments', 'payment')
    return payments.map(transformPayment)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new WfirmaClient(credentials)
    const data = await client.get<Record<string, unknown>>(`/payments/get/${id}`)
    const payment = extractOne<WfirmaPayment>(data, 'payments', 'payment')
    return transformPayment(payment)
  }

  // --- Credit Memos (wFirma: invoices with type=correction) ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new WfirmaClient(credentials)
    // Filter invoices to only correction type (faktura korygująca).
    const data = await client.find<Record<string, unknown>>('invoices', {
      ...this.paginationParams(params),
      type: 'correction',
    })
    const invoices = extractList<WfirmaInvoice>(data, 'invoices', 'invoice')
    return invoices.map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new WfirmaClient(credentials)
    const data = await client.get<Record<string, unknown>>(`/invoices/get/${id}`)
    const invoice = extractOne<WfirmaInvoice>(data, 'invoices', 'invoice')
    return transformCreditMemo(invoice)
  }
}
