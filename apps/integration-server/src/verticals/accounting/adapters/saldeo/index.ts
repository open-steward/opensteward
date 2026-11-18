/**
 * SaldeoSMART accounting adapter.
 *
 * SaldeoSMART (by BrainSHARE IT / Visma) is a Polish accounting SaaS that
 * automates invoice scanning, OCR, and bookkeeping for accounting offices.
 *
 * Auth: API-key (username + api_token); no OAuth flow.
 * Protocol: REST/XML over HTTPS (base: https://api.saldeosmart.pl/api/xml/1.0)
 * Signature: MD5 over URL-encoded sorted-params + api_token (never on wire)
 *
 * Supported resources:
 *   - organization  → company.list (first entry)
 *   - invoices      → document.list filtered to income/sales types
 *   - bills         → document.list filtered to cost types
 *   - contacts      → contractor.list
 *   - creditmemos   → document.list filtered to correction-invoice types (IS_CORRECTIVE)
 *
 * Not supported (no SaldeoSMART API equivalent):
 *   - accounts, journals, transactions, tax rates, expenses,
 *     orders, sales orders, purchase orders
 *   - webhooks (no signed webhook delivery documented)
 *
 * API docs: https://saldeo.brainshare.pl/static/doc/api/index.html
 * Spec PDF: https://systemsaldeo.pl/pliki/SaldeoSMART%20-%20Specyfikacja%20API.pdf
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: account     — SaldeoSMART API exposes no chart-of-accounts endpoint
 * Unavailable: journal     — No journal/ledger endpoint in the SaldeoSMART API
 * Unavailable: transaction — No transaction-level endpoint; only document summaries available
 * Unavailable: taxrate     — Tax rates are embedded in VAT_REGISTRY line items, no standalone endpoint
 * Unavailable: expense     — No dedicated expense-claim/employee-expense endpoint
 * Unavailable: order       — No order management concept in SaldeoSMART API
 * Unavailable: salesorder  — No sales-order endpoint in SaldeoSMART API
 * Unavailable: purchaseorder — No purchase-order endpoint in SaldeoSMART API
 */

import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Organization } from '../../schema/organization'
import type { CreditMemo } from '../../schema/creditmemo'
import type { CredentialField } from '@opensteward/shared'

import {
  credentialFields as adapterCredentialFields,
  exchangeCredentials as adapterExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { SaldeoClient, xmlBlocks } from './client'
import {
  ENDPOINT_COMPANY_LIST,
  ENDPOINT_CONTRACTOR_LIST,
  ENDPOINT_DOCUMENT_LIST,
  POLICY_ALL,
  DEFAULT_PAGE_SIZE,
} from './constants'

import {
  parseSaldeoDocument,
  transformInvoice,
  type SaldeoDocument,
} from './transform/invoice'
import { transformBill } from './transform/bill'
import {
  parseSaldeoContractor,
  transformContractor,
} from './transform/contact'
import {
  parseSaldeoCompany,
  transformOrganization,
} from './transform/organization'
import {
  isCreditMemoType,
  transformCreditMemo,
} from './transform/creditmemo'

// ── Document type classification ──────────────────────────────────────────────
//
// SaldeoSMART document types are surfaced via DOCUMENT_TYPE.TYPE.
// Income/sales-facing types → Invoice; cost/supplier-facing types → Bill.

const INVOICE_TYPES = new Set([
  'INVOICE',
  'INVOICE_INCOME',
  'INVOICE_PRO_FORMA',
  'INVOICE_ADVANCE',
  'INVOICE_INCOME_CORRECTION',
  'INVOICE_INCOME_ADVANCE',
])

const BILL_TYPES = new Set([
  'INVOICE_COST',
  'INVOICE_COST_ADVANCE',
  'INVOICE_COST_CORRECTION',
  'INVOICE_COST_ADVANCE_CORRECTION',
])

function isInvoiceType(docTypeType?: string): boolean {
  if (!docTypeType) return true // default to invoice if unknown
  const t = docTypeType.toUpperCase()
  // Explicitly a cost type → not an invoice
  if (BILL_TYPES.has(t)) return false
  // Explicitly a known income type → invoice
  if (INVOICE_TYPES.has(t)) return true
  // Unknown type: default to invoice (non-cost documents are treated as receivables)
  return true
}

function isBillType(docTypeType?: string): boolean {
  if (!docTypeType) return false
  return BILL_TYPES.has(docTypeType.toUpperCase())
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class SaldeoAdapter implements AccountingAdapter {
  readonly platform = 'saldeo'
  readonly version = '0.1.0'

  // No OAuth config — API-key auth only.
  constructor() {}

  // ── Credential fields (API-key form) ─────────────────────────────────────────

  credentialFields(): CredentialField[] {
    return adapterCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return adapterExchangeCredentials(fields)
  }

  // ── Auth stubs (not used for API-key adapters) ────────────────────────────────

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('SaldeoSMART uses API-key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // API tokens do not expire.
    return credentials
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): SaldeoClient {
    return new SaldeoClient(credentials)
  }

  /**
   * Fetch all documents for a given company_program_id and parse them.
   * The policy controls date window; default is "SALDEO" (all documents).
   */
  private async fetchDocuments(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<SaldeoDocument[]> {
    const companyProgramId = params['companyProgramId'] as string | undefined
    if (!companyProgramId) {
      throw new Error(
        'SaldeoSMART: companyProgramId is required in QueryParams for document operations',
      )
    }
    const extra: Record<string, string> = {
      company_program_id: companyProgramId,
      policy: (params['policy'] as string) ?? POLICY_ALL,
    }
    const xml = await this.client(credentials).get(ENDPOINT_DOCUMENT_LIST, extra)
    const blocks = xmlBlocks(xml, 'DOCUMENT')
    return blocks.map(parseSaldeoDocument)
  }

  // ── Organization ──────────────────────────────────────────────────────────────

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const xml = await this.client(credentials).get(ENDPOINT_COMPANY_LIST)
    const blocks = xmlBlocks(xml, 'COMPANY')
    if (!blocks.length) {
      throw new Error('SaldeoSMART: no company found for this account')
    }
    const company = parseSaldeoCompany(blocks[0])
    return transformOrganization(company)
  }

  // ── Invoices ──────────────────────────────────────────────────────────────────

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const docs = await this.fetchDocuments(credentials, params)
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const page = (params.page ?? 1) - 1 // convert to 0-based offset

    return docs
      .filter((d) => isInvoiceType(d.DOCUMENT_TYPE_TYPE))
      .slice(page * limit, page * limit + limit)
      .map(transformInvoice)
  }

  // getInvoice is intentionally omitted: SaldeoSMART has no single-document
  // retrieval endpoint and requires companyProgramId (a list-scoped param) that
  // the AccountingAdapter interface does not supply to point-lookup signatures.
  // Callers must use listInvoices with companyProgramId in QueryParams instead.

  // ── Bills ─────────────────────────────────────────────────────────────────────

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const docs = await this.fetchDocuments(credentials, params)
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const page = (params.page ?? 1) - 1

    return docs
      .filter((d) => isBillType(d.DOCUMENT_TYPE_TYPE))
      .slice(page * limit, page * limit + limit)
      .map(transformBill)
  }

  // getBill is intentionally omitted: same limitation as getInvoice — no
  // single-document endpoint exists and companyProgramId cannot be threaded
  // through the AccountingAdapter interface's (credentials, id) signature.

  // ── Credit Memos (correction invoices) ────────────────────────────────────────

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const docs = await this.fetchDocuments(credentials, params)
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const page = (params.page ?? 1) - 1

    return docs
      .filter((d) => isCreditMemoType(d.DOCUMENT_TYPE_TYPE))
      .slice(page * limit, page * limit + limit)
      .map(transformCreditMemo)
  }

  // getCreditMemo is intentionally omitted: same limitation as getInvoice/getBill.

  // ── Contacts (contractors) ────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const companyProgramId = params['companyProgramId'] as string | undefined
    if (!companyProgramId) {
      throw new Error(
        'SaldeoSMART: companyProgramId is required in QueryParams for contact operations',
      )
    }
    const xml = await this.client(credentials).get(ENDPOINT_CONTRACTOR_LIST, {
      company_program_id: companyProgramId,
    })
    const blocks = xmlBlocks(xml, 'CONTRACTOR')
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const page = (params.page ?? 1) - 1

    return blocks
      .slice(page * limit, page * limit + limit)
      .map(parseSaldeoContractor)
      .map(transformContractor)
  }

  // getContact is intentionally omitted: contractor.list also requires
  // companyProgramId which cannot be supplied via the standard
  // AccountingAdapter getContact(credentials, id) signature.
  // Use listContacts with companyProgramId in QueryParams and filter client-side.
}
