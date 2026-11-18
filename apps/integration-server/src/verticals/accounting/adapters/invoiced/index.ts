import { toEpochSeconds } from '../shared/transform'
/**
 * Invoiced accounting adapter.
 *
 * Auth: API key via HTTP Basic (api_key → username, empty password).
 * Docs: https://developer.invoiced.com/api
 *
 * Supported resources:
 *   - Invoices (list, get, create, update)
 *   - Contacts / Customers (list, get, create, update)
 *   - Transactions / Payments (list, get)
 *   - Tax Rates (list, get)
 *   - Credit Memos / Credit Notes (list, get, create)
 *   - Orders / Sales Orders (list, get — derived from Estimates)
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: account      — Invoiced has no chart of accounts / GL account endpoint; AR-only platform
 * Unavailable: bill         — Invoiced has no accounts-payable or vendor bill endpoint
 * Unavailable: expense      — Invoiced has no expense tracking endpoint
 * Unavailable: journal      — Invoiced has no journal entries endpoint
 * Unavailable: organization — Invoiced has no organisation/company-settings endpoint
 * Unavailable: purchaseorder — Invoiced has no purchase order endpoint
 */
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Contact } from '../../schema/contact'
import type { Transaction } from '../../schema/transaction'
import type { TaxRate } from '../../schema/taxrate'
import type { CreditMemo } from '../../schema/creditmemo'
import type { Order } from '../../schema/order'
import type { SalesOrder } from '../../schema/salesorder'

import { credentialFields, exchangeCredentials, refreshCredentials } from './auth'
import { InvoicedClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import {
  transformInvoice,
  untransformInvoice,
  type InvoicedInvoice,
} from './transform/invoice'
import {
  transformContact,
  type InvoicedCustomer,
} from './transform/contact'
import {
  transformTransaction,
  type InvoicedPayment,
} from './transform/transaction'
import {
  transformTaxRate,
  type InvoicedTaxRate,
} from './transform/taxrate'
import {
  transformCreditMemo,
  type InvoicedCreditNote,
} from './transform/creditmemo'
import {
  transformOrder,
  type InvoicedEstimate,
} from './transform/order'
import { transformSalesOrder } from './transform/salesorder'

export class InvoicedAdapter implements AccountingAdapter {
  readonly platform = 'invoiced'
  readonly version = '0.1.0'

  // ── Credential form (api_key) ────────────────────────────────────────────
  credentialFields = credentialFields
  exchangeCredentials = exchangeCredentials

  // ── Auth stubs (no OAuth; api_key adapters use credentialFields/exchangeCredentials) ─
  getAuthUrl(_state: string): string {
    return 'https://app.invoiced.com/settings/api'
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('Invoiced uses API key auth, not OAuth. Use exchangeCredentials() instead.')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshCredentials(credentials)
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private paginationParams(params: QueryParams): Record<string, unknown> {
    const p: Record<string, unknown> = {
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      page: params.page ?? 1,
    }
    if (params.updatedAfter) {
      p['filter[updated_at][gte]'] = Math.floor(params.updatedAfter.getTime() / 1000)
    }
    return p
  }

  // ── Invoices ──────────────────────────────────────────────────────────────

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new InvoicedClient(credentials)
    const page = await client.list<InvoicedInvoice>('/invoices', this.paginationParams(params))
    return page.items.map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new InvoicedClient(credentials)
    const raw = await client.get<InvoicedInvoice>(`/invoices/${id}`)
    return transformInvoice(raw)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new InvoicedClient(credentials)
    const raw = await client.post<InvoicedInvoice>('/invoices', untransformInvoice(data))
    return transformInvoice(raw)
  }

  async updateInvoice(
    credentials: Credentials,
    id: string,
    data: Partial<Invoice>,
  ): Promise<Invoice> {
    const client = new InvoicedClient(credentials)
    const raw = await client.patch<InvoicedInvoice>(`/invoices/${id}`, untransformInvoice(data))
    return transformInvoice(raw)
  }

  // ── Contacts / Customers ──────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new InvoicedClient(credentials)
    const page = await client.list<InvoicedCustomer>('/customers', this.paginationParams(params))
    return page.items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new InvoicedClient(credentials)
    const raw = await client.get<InvoicedCustomer>(`/customers/${id}`)
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new InvoicedClient(credentials)
    const body: Record<string, unknown> = {
      name: data.name,
      email: data.emails?.[0]?.email,
      phone: data.telephones?.[0]?.telephone,
      tax_id: data.taxNumber,
      currency: data.currency?.toLowerCase(),
      address1: data.billingAddress?.address1,
      address2: data.billingAddress?.address2,
      city: data.billingAddress?.city,
      state: data.billingAddress?.region,
      postal_code: data.billingAddress?.postalCode,
      country: data.billingAddress?.country,
    }
    const raw = await client.post<InvoicedCustomer>('/customers', body)
    return transformContact(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const client = new InvoicedClient(credentials)
    const body: Record<string, unknown> = {
      name: data.name,
      email: data.emails?.[0]?.email,
      phone: data.telephones?.[0]?.telephone,
      tax_id: data.taxNumber,
      address1: data.billingAddress?.address1,
      address2: data.billingAddress?.address2,
      city: data.billingAddress?.city,
      state: data.billingAddress?.region,
      postal_code: data.billingAddress?.postalCode,
      country: data.billingAddress?.country,
    }
    const raw = await client.patch<InvoicedCustomer>(`/customers/${id}`, body)
    return transformContact(raw)
  }

  // ── Transactions / Payments ───────────────────────────────────────────────

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new InvoicedClient(credentials)
    const page = await client.list<InvoicedPayment>('/payments', this.paginationParams(params))
    return page.items.map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new InvoicedClient(credentials)
    const raw = await client.get<InvoicedPayment>(`/payments/${id}`)
    return transformTransaction(raw)
  }

  // ── Tax Rates ─────────────────────────────────────────────────────────────

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new InvoicedClient(credentials)
    const page = await client.list<InvoicedTaxRate>('/tax_rates', this.paginationParams(params))
    return page.items.map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new InvoicedClient(credentials)
    const raw = await client.get<InvoicedTaxRate>(`/tax_rates/${id}`)
    return transformTaxRate(raw)
  }

  // ── Credit Memos / Credit Notes ───────────────────────────────────────────

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new InvoicedClient(credentials)
    const page = await client.list<InvoicedCreditNote>('/credit_notes', this.paginationParams(params))
    return page.items.map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new InvoicedClient(credentials)
    const raw = await client.get<InvoicedCreditNote>(`/credit_notes/${id}`)
    return transformCreditMemo(raw)
  }

  async createCreditMemo(
    credentials: Credentials,
    data: Partial<CreditMemo>,
  ): Promise<CreditMemo> {
    const client = new InvoicedClient(credentials)
    const body: Record<string, unknown> = {
      customer: data.contactId ? Number(data.contactId) : undefined,
      currency: data.currency?.toLowerCase(),
      date: data.postedAt ? toEpochSeconds(data.postedAt) : undefined,
      notes: data.notes,
      items: data.lineItems?.map((li) => ({
        catalog_item: li.itemId,
        name: li.itemName,
        description: li.itemDescription,
        quantity: li.unitQuantity,
        unit_cost: li.unitAmount,
      })),
    }
    const raw = await client.post<InvoicedCreditNote>('/credit_notes', body)
    return transformCreditMemo(raw)
  }

  // ── Orders (derived from Estimates) ───────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new InvoicedClient(credentials)
    const page = await client.list<InvoicedEstimate>('/estimates', this.paginationParams(params))
    return page.items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new InvoicedClient(credentials)
    const raw = await client.get<InvoicedEstimate>(`/estimates/${id}`)
    return transformOrder(raw)
  }

  // ── Sales Orders (derived from Estimates) ─────────────────────────────────

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new InvoicedClient(credentials)
    const page = await client.list<InvoicedEstimate>('/estimates', this.paginationParams(params))
    return page.items.map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new InvoicedClient(credentials)
    const raw = await client.get<InvoicedEstimate>(`/estimates/${id}`)
    return transformSalesOrder(raw)
  }
}
