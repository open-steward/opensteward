/**
 * WhiteBooks Accounting Adapter
 *
 * WhiteBooks (whitebooks.in) is an Indian GSP-certified accounting and GST
 * compliance platform.  Their public REST API covers:
 *
 *   - e-Invoice / IRN generation and retrieval  →  Invoice
 *   - GSTIN master-data lookup                  →  Contact / Organization
 *   - GST return status (read-only)
 *
 * Resources not covered by the public API (bills, accounts, journals, tax
 * rates, expenses, orders) are intentionally omitted; the framework will
 * respond with 501 Not Implemented automatically.
 *
 * Auth: OAuth 2.0 client-credentials grant
 *   POST /gst/oauth/token  {client_id, client_secret}
 *   → Bearer token (1 h TTL); use oauth2ClientCredentials template for
 *     the Connect Link credential form.
 *
 * Docs:
 *   https://whitebooks.in/api/e-invoice-api-for-developers/
 *   https://whitebooks.in/api/gst-api-for-developers/
 */

import { oauth2ClientCredentials } from '@opensteward/shared'
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Contact } from '../../schema/contact'
import type { Organization } from '../../schema/organization'

import { exchangeClientCredentials, refreshAccessToken } from './auth'
import { WhitebooksClient } from './client'
import { WHITEBOOKS_TOKEN_URL, EINVOICE_VERSION } from './constants'

import {
  transformInvoice,
  untransformInvoice,
  type WhitebooksIrnResponse,
} from './transform/invoice'
import { transformGstinContact, type WhitebooksGstinDtls } from './transform/contact'
import { transformOrganization } from './transform/organization'

// ── Resource coverage ──────────────────────────────────────────────────────────
// Available:   contact, invoice, organization
// Unavailable: account      — no chart-of-accounts endpoint in the public API
// Unavailable: bill         — no accounts-payable/bills endpoint in the public API
// Unavailable: creditmemo   — no credit-note endpoint; IRN cancellation is the only reversal
// Unavailable: expense      — expense management exists in the SaaS UI, not via REST
// Unavailable: journal      — double-entry ledger data not accessible via REST API
// Unavailable: order        — order management exists in the SaaS UI, not via REST
// Unavailable: purchaseorder — purchase-order feature not accessible via REST API
// Unavailable: salesorder   — sales-order feature not accessible via REST API
// Unavailable: taxrate      — HSN/SAC code lookup exists but is a govt reference, not user-configured rates
// Unavailable: transaction  — financial transaction/payment ledger not exposed via REST API

// ── Credential form (Connect Link) ────────────────────────────────────────────

const CRED_FORM = oauth2ClientCredentials({
  tokenUrl: WHITEBOOKS_TOKEN_URL,
  scopes: [],
})

// ── Adapter ───────────────────────────────────────────────────────────────────

export class WhitebooksAdapter implements AccountingAdapter {
  readonly platform = 'whitebooks'
  readonly version  = '0.1.0'

  // Connect Link support — OAuth2 client-credentials form.
  credentialFields    = CRED_FORM.credentialFields
  exchangeCredentials = CRED_FORM.exchangeCredentials

  // ── Auth ──────────────────────────────────────────────────────────────────

  /** Not used — WhiteBooks uses client-credentials, not authorization-code. */
  getAuthUrl(_state: string): string {
    return 'https://accounts.whitebooks.in/login'
  }

  /**
   * If the caller supplies the code as "clientId:clientSecret" (from the
   * sandbox sign-up flow), split and exchange.  Otherwise treat `code` as
   * the raw access token (pass-through).
   */
  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    if (code.includes(':')) {
      const [clientId, ...rest] = code.split(':')
      const clientSecret = rest.join(':')
      return exchangeClientCredentials(clientId, clientSecret)
    }
    return { accessToken: code }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshAccessToken(credentials)
  }

  // ── Organization ──────────────────────────────────────────────────────────

  /**
   * Fetch the authenticated company's GSTIN master data.
   * Requires `credentials.extra.gstin` to be set (the user's own GSTIN).
   */
  async getOrganization(credentials: Credentials): Promise<Organization> {
    const gstin = (credentials.extra?.['gstin'] as string | undefined) ?? ''
    if (!gstin) {
      throw new Error(
        'WhiteBooks: credentials.extra.gstin must be set to look up the organization.',
      )
    }
    const client = WhitebooksClient.gst(credentials)
    const res = await client.get<{ data?: WhitebooksGstinDtls } | WhitebooksGstinDtls>(
      `type/GSTNDETAILS/version/${EINVOICE_VERSION}`,
      { gstin },
    )
    const raw =
      (res as { data?: WhitebooksGstinDtls }).data ?? (res as WhitebooksGstinDtls)
    return transformOrganization(raw)
  }

  // ── Invoices (e-Invoice / IRN) ────────────────────────────────────────────

  /**
   * List IRNs is not directly supported by WhiteBooks (no list endpoint).
   * We return an empty array to stay non-501.
   */
  async listInvoices(_credentials: Credentials, _params: QueryParams): Promise<Invoice[]> {
    return []
  }

  /**
   * Fetch an IRN by its IRN number.
   * id must be a 64-character IRN string.
   */
  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new WhitebooksClient(credentials)
    const res = await client.get<{ data?: WhitebooksIrnResponse } | WhitebooksIrnResponse>(
      `type/GETIRN/version/${EINVOICE_VERSION}`,
      { irn: id },
    )
    const raw =
      (res as { data?: WhitebooksIrnResponse }).data ?? (res as WhitebooksIrnResponse)
    return transformInvoice(raw)
  }

  /**
   * Generate an IRN (create e-Invoice) from a canonical Invoice.
   * Returns the resulting canonical Invoice with the assigned IRN as `id`.
   */
  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new WhitebooksClient(credentials)
    const body = untransformInvoice(data)
    const res = await client.post<{ data?: WhitebooksIrnResponse } | WhitebooksIrnResponse>(
      `type/GENERATE/version/${EINVOICE_VERSION}`,
      body,
    )
    const raw =
      (res as { data?: WhitebooksIrnResponse }).data ?? (res as WhitebooksIrnResponse)
    return transformInvoice(raw)
  }

  /**
   * Cancel an existing IRN (24-hour cancellation window).
   */
  async deleteInvoice(credentials: Credentials, id: string): Promise<void> {
    const client = new WhitebooksClient(credentials)
    await client.post(`type/CANCEL/version/${EINVOICE_VERSION}`, { Irn: id, CnlRsn: '1', CnlRem: 'Cancelled' })
  }

  // ── Contacts (GSTIN master-data lookup) ───────────────────────────────────

  /**
   * List contacts is not supported by WhiteBooks GSTIN API
   * (single-lookup only).  Returns empty array.
   */
  async listContacts(_credentials: Credentials, _params: QueryParams): Promise<Contact[]> {
    return []
  }

  /**
   * Look up a contact by their GSTIN (15-character alphanumeric string).
   */
  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = WhitebooksClient.gst(credentials)
    const res = await client.get<{ data?: WhitebooksGstinDtls } | WhitebooksGstinDtls>(
      `type/GSTNDETAILS/version/${EINVOICE_VERSION}`,
      { gstin: id },
    )
    const raw =
      (res as { data?: WhitebooksGstinDtls }).data ?? (res as WhitebooksGstinDtls)
    return transformGstinContact(raw)
  }
}
