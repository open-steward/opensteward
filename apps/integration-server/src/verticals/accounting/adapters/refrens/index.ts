/**
 * RefrensAdapter — OpenSteward accounting adapter for Refrens.
 *
 * Refrens is an Indian invoicing / accounting SaaS platform.
 * Docs: https://www.refrens.com/api/docs/
 *
 * Supported resources:
 *   - Organization (GET /businesses/:urlKey  → inferred from business data)
 *   - Invoices     (GET list + GET by id + POST create + PATCH cancel)
 *   - Bills        (POST create expenditure only; list not documented)
 *
 * Auth model: appId + appSecret exchanged for a short-lived JWT at
 * POST /authentication.  The urlKey (business slug) is also required and
 * is stored in credentials.extra.urlKey alongside appId + appSecret for
 * token refresh.
 *
 * Unimplemented resources (platform does not document public endpoints):
 *   contacts, accounts, journals, taxrates, expenses, creditMemos,
 *   orders, salesOrders, purchaseOrders, transactions.
 *
 * Those methods are intentionally absent and will auto-501 via the framework.
 */

import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Organization } from '../../schema/organization'

import { REFRENS_CREDENTIAL_FORM, getAuthUrl, exchangeCode, refreshCredentials } from './auth'
import { RefrensClient, RefrensRootClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, untransformInvoice, type RefrensInvoice } from './transform/invoice'
import { transformBill, untransformBill, type RefrensExpenditure } from './transform/bill'
import { transformOrganization, type RefrensBusiness } from './transform/organization'

// ── Pagination envelope ───────────────────────────────────────────────────────

interface RefrensListEnvelope<T> {
  total: number
  limit: number
  skip: number
  data: T[]
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class RefrensAdapter implements AccountingAdapter {
  readonly platform = 'refrens'
  readonly version = '0.1.0'

  // Connect Link: three-field form (appId, appSecret, urlKey)
  credentialFields = REFRENS_CREDENTIAL_FORM.credentialFields
  exchangeCredentials = REFRENS_CREDENTIAL_FORM.exchangeCredentials

  // No OAuth redirect flow — stubs to satisfy BaseAdapter interface
  getAuthUrl(state: string): string {
    return getAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeCode(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshCredentials(credentials)
  }

  // ── Pagination helpers ──────────────────────────────────────────────────────

  private paginationParams(params: QueryParams): Record<string, unknown> {
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    // Refrens uses $skip (offset) not page numbers
    const page = params.page ?? 1
    const skip = (page - 1) * limit
    return {
      $limit: limit,
      $skip: skip,
    }
  }

  // ── Organization ────────────────────────────────────────────────────────────

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new RefrensRootClient(credentials)
    const urlKey = (credentials.extra?.['urlKey'] as string | undefined) ?? ''
    const res = await client.get<RefrensBusiness>(`businesses/${urlKey}`)
    return transformOrganization(res)
  }

  // ── Invoices ────────────────────────────────────────────────────────────────

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new RefrensClient(credentials)
    const res = await client.get<RefrensListEnvelope<RefrensInvoice>>(
      'invoices',
      this.paginationParams(params),
    )
    return (res.data ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new RefrensClient(credentials)
    const res = await client.get<RefrensInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new RefrensClient(credentials)
    const res = await client.post<RefrensInvoice>('invoices', untransformInvoice(data))
    return transformInvoice(res)
  }

  async updateInvoice(
    credentials: Credentials,
    id: string,
    data: Partial<Invoice>,
  ): Promise<Invoice> {
    const client = new RefrensClient(credentials)
    // Refrens update (cancel) uses PATCH; partial field updates follow the
    // same shape as create.
    const res = await client.patch<RefrensInvoice>(`invoices/${id}`, untransformInvoice(data))
    return transformInvoice(res)
  }

  // ── Bills (expenditures) ────────────────────────────────────────────────────

  async createBill(credentials: Credentials, data: Partial<Bill>): Promise<Bill> {
    const client = new RefrensClient(credentials)
    const res = await client.post<RefrensExpenditure>('expenditures', untransformBill(data))
    return transformBill(res)
  }
}
