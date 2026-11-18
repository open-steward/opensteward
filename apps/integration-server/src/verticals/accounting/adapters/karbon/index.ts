/**
 * Karbon accounting adapter.
 *
 * Auth: api_key — two static headers per request:
 *   Authorization: Bearer <bearerToken>   (credentials.accessToken)
 *   AccessKey: <accessKey>                (credentials.extra.accessKey)
 *
 * Base URL: https://api.karbonhq.com/v3/
 * Rate limit: 120 req/min
 * Pagination: OData @odata.nextLink cursor; $top max 100
 *
 * Supported resources:
 *   - Invoices  (list, get)
 *   - Contacts  (list = Contact + Organization resources, get)
 *   - Transactions (mapped from Karbon Payments)
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: account       — Karbon API v3 has no GL accounts endpoint; TenantSettings returns work/contact config only
 * Unavailable: bill          — Karbon API v3 has no Bills endpoint; platform does not model supplier bills
 * Unavailable: creditmemo    — Karbon API v3 has no CreditMemos or credit-note endpoint
 * Unavailable: expense       — Karbon API v3 has no Expenses endpoint; platform does not model employee expenses
 * Unavailable: journal       — Karbon API v3 has no Journals endpoint; platform does not expose journal entries
 * Unavailable: order         — Karbon API v3 has no Orders endpoint; platform does not model sales/purchase orders
 * Unavailable: purchaseorder — Karbon API v3 has no PurchaseOrders endpoint; platform does not model purchase orders
 * Unavailable: salesorder    — Karbon API v3 has no SalesOrders endpoint; platform does not model sales orders
 * Unavailable: taxrate       — Karbon API v3 has no TaxRates endpoint; tax rates are not exposed via the API
 */
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Contact } from '../../schema/contact'
import type { Transaction } from '../../schema/transaction'

import { KARBON_CREDENTIAL_FORM, refreshCredentials as doRefresh } from './auth'
import { KarbonClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { karbonWebhook } from './webhook'

import { transformInvoice, type KarbonInvoice } from './transform/invoice'
import { transformContact, transformOrganization, type KarbonContact, type KarbonOrganization } from './transform/contact'
import { transformPayment, type KarbonPayment } from './transform/transaction'
import type { WebhookEvent } from '../../schema/webhook'

// ── OData envelope ────────────────────────────────────────────────────────────

interface ODataList<T> {
  value: T[]
  '@odata.count'?: number
  '@odata.nextLink'?: string
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class KarbonAdapter implements AccountingAdapter {
  readonly platform = 'karbon'
  readonly version = '0.1.0'

  // Connect-Link credential form (Bearer Token + AccessKey)
  credentialFields = KARBON_CREDENTIAL_FORM.credentialFields
  exchangeCredentials = KARBON_CREDENTIAL_FORM.exchangeCredentials

  /**
   * Karbon does not use OAuth redirects; this URL is never followed.
   * Returning a placeholder satisfies the interface.
   */
  getAuthUrl(state: string): string {
    return `https://developers.karbonhq.com/?state=${encodeURIComponent(state)}`
  }

  /**
   * Not used — the Connect-Link form handles credential exchange directly.
   * Satisfies BaseAdapter interface.
   */
  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('Karbon uses API key auth; use exchangeCredentials instead of exchangeCode.')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Webhook ────────────────────────────────────────────────────────────────

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return karbonWebhook.parseWebhookEvents(payload)
  }

  // ── Invoices ───────────────────────────────────────────────────────────────

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new KarbonClient(credentials)
    const top = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const skip = params.page != null ? (params.page - 1) * top : 0
    const query: Record<string, unknown> = { $top: top, $skip: skip, $expand: 'LineItems,Payments' }
    if (params.updatedAfter) {
      query['$filter'] = `UpdatedAt gt ${params.updatedAfter.toISOString()}`
    }
    const res = await client.get<ODataList<KarbonInvoice>>('Invoices', query)
    return (res.value ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new KarbonClient(credentials)
    const res = await client.get<KarbonInvoice>(`Invoices/${id}`, { $expand: 'LineItems,Payments' })
    return transformInvoice(res)
  }

  // ── Contacts ───────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new KarbonClient(credentials)
    const top = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const skip = params.page != null ? (params.page - 1) * top : 0
    const query: Record<string, unknown> = { $top: top, $skip: skip }
    if (params.updatedAfter) {
      query['$filter'] = `LastModifiedDateTime gt ${params.updatedAfter.toISOString()}`
    }
    const [contactsRes, orgsRes] = await Promise.all([
      client.get<ODataList<KarbonContact>>('Contacts', query).catch(() => ({ value: [] as KarbonContact[] })),
      client.get<ODataList<KarbonOrganization>>('Organizations', query).catch(() => ({ value: [] as KarbonOrganization[] })),
    ])
    return [
      ...(contactsRes.value ?? []).map(transformContact),
      ...(orgsRes.value ?? []).map(transformOrganization),
    ]
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new KarbonClient(credentials)
    // Try Contact first, then Organization
    try {
      const res = await client.get<KarbonContact>(`Contacts/${id}`)
      if (res.ContactKey) return transformContact(res)
    } catch {
      // fall through
    }
    const res = await client.get<KarbonOrganization>(`Organizations/${id}`)
    return transformOrganization(res)
  }

  // ── Transactions (Payments) ────────────────────────────────────────────────

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new KarbonClient(credentials)
    const top = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const skip = params.page != null ? (params.page - 1) * top : 0
    const query: Record<string, unknown> = { $top: top, $skip: skip }
    if (params.updatedAfter) {
      query['$filter'] = `PaymentDate gt ${params.updatedAfter.toISOString().split('T')[0]}`
    }
    const res = await client.get<ODataList<KarbonPayment>>('Payments', query)
    return (res.value ?? []).map(transformPayment)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new KarbonClient(credentials)
    const res = await client.get<KarbonPayment>(`Payments/${id}`)
    return transformPayment(res)
  }
}
