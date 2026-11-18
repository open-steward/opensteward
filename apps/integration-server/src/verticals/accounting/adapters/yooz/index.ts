/**
 * Yooz Rising accounting adapter.
 *
 * Yooz is an AI-powered AP (accounts payable) automation platform.
 * It is NOT a general accounting system — it captures and processes supplier
 * invoices (bills) through an approval workflow before exporting to an ERP.
 *
 * Supported resources:
 *   - Organization  (GET /orgUnits — returns the tenant company info)
 *   - Bills         (GET/GET-by-id /documents — AP documents / supplier invoices)
 *   - Contacts      (GET/GET-by-id /suppliers — vendor master data)
 *
 * Auth: api_key — Bearer token + applicationId header (no OAuth redirect,
 *   no refresh). Credentials are entered once via the Connect form.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: account       — No chart-of-accounts REST endpoint; accounts are imported into Yooz via CSV file only.
 * Unavailable: creditmemo    — Yooz is AP-only; no AR module, no credit-memo concept.
 * Unavailable: expense       — No employee-expense module or expenses endpoint in the Yooz Rising REST API.
 * Unavailable: invoice       — Yooz is AP-only; no AR invoice module and no GET /invoices endpoint.
 * Unavailable: journal       — Accounting entries are exported as files (CSV/XML) to the ERP; no readable journal REST endpoint.
 * Unavailable: order         — Generic order resource does not exist in the Yooz Rising REST API.
 * Unavailable: purchaseorder — POs can only be imported via write-only CSV POST; no GET endpoint to retrieve purchase orders.
 * Unavailable: salesorder    — Yooz is AP-only; sales orders are not a supported concept.
 * Unavailable: taxrate       — Tax codes are imported via CSV as master data; no readable tax-rate REST endpoint.
 * Unavailable: transaction   — Ledger transactions are exported to ERP as files, not queryable as records via REST.
 */
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { CredentialField } from '@opensteward/shared'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Organization } from '../../schema/organization'

import {
  getAuthUrlUnsupported,
  credentialFields as adapterCredentialFields,
  exchangeCredentials as adapterExchangeCredentials,
} from './auth'
import { YoozClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformBill, type YoozDocument } from './transform/bill'
import { transformSupplier, type YoozSupplier } from './transform/contact'
import { transformOrganization, type YoozOrgUnit } from './transform/organization'

// ── Yooz REST response envelopes ──────────────────────────────────────────────

interface YoozPagedResponse<T> {
  data?: T[]
  items?: T[]
  content?: T[]
  totalCount?: number
  total?: number
  page?: number
  pageSize?: number
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class YoozAdapter implements AccountingAdapter {
  readonly platform = 'yooz'
  readonly version = '0.1.0'

  // ── Credential form (api_key model) ────────────────────────────────────────

  credentialFields(): CredentialField[] {
    return adapterCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return adapterExchangeCredentials(fields)
  }

  // ── OAuth stubs (not used — api_key adapter) ───────────────────────────────

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('Yooz uses API key authentication; OAuth code exchange is not supported.')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // API keys do not expire — return credentials unchanged.
    return credentials
  }

  // ── Pagination helper ──────────────────────────────────────────────────────

  private pageParams(params: QueryParams): Record<string, unknown> {
    return {
      page: params.page ?? 1,
      pageSize: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      ...(params.updatedAfter && {
        updatedAfter: params.updatedAfter.toISOString(),
      }),
    }
  }

  // ── Unwrap paged envelope ──────────────────────────────────────────────────

  private unwrapList<T>(res: YoozPagedResponse<T>): T[] {
    return res.data ?? res.items ?? res.content ?? []
  }

  // ── Organization ───────────────────────────────────────────────────────────

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new YoozClient(credentials)
    // orgUnits returns either an object or a paged list; handle both.
    const res = await client.get<YoozOrgUnit | YoozPagedResponse<YoozOrgUnit>>('orgUnits')
    if (res && 'id' in (res as YoozOrgUnit)) {
      return transformOrganization(res as YoozOrgUnit)
    }
    const list = this.unwrapList(res as YoozPagedResponse<YoozOrgUnit>)
    return transformOrganization(list[0] ?? {})
  }

  // ── Bills (AP documents / supplier invoices) ───────────────────────────────

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new YoozClient(credentials)
    const res = await client.get<YoozPagedResponse<YoozDocument>>(
      'documents',
      this.pageParams(params),
    )
    return this.unwrapList(res).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new YoozClient(credentials)
    const res = await client.get<YoozDocument>(`documents/${id}`)
    return transformBill(res)
  }

  // ── Contacts (suppliers / vendors) ────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new YoozClient(credentials)
    const res = await client.get<YoozPagedResponse<YoozSupplier>>(
      'suppliers',
      this.pageParams(params),
    )
    return this.unwrapList(res).map(transformSupplier)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new YoozClient(credentials)
    const res = await client.get<YoozSupplier>(`suppliers/${id}`)
    return transformSupplier(res)
  }
}
