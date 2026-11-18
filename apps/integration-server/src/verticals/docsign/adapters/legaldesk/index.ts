/**
 * LegalDesk adapter — Aadhaar-based eSign / eKYC gateway (legaldesk.com).
 *
 * LegalDesk exposes a CCA eSign transaction API: a customer creates an
 * eSign *transaction*, attaches one-or-more documents and a set of signers,
 * and each signer authorises the signature with an Aadhaar OTP / biometric /
 * iris mode. Status is polled and the completed signed document + audit
 * trail are delivered to a configured callback.
 *
 * Mapping:
 *   transaction          → canonical Envelope
 *
 * Signers, documents and audit-trail entries refuse with 501 NOT_SUPPORTED:
 * LegalDesk documents no endpoint that reads them (see
 * LEGALDESK_UNDOCUMENTED_REASON below).
 *
 * Templates are NOT implemented — the eSign transaction API has no listable
 * template REST resource — so the router returns 501 for template reads.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: template — LegalDesk exposes a CCA Aadhaar eSign transaction
 *   API only; documents are attached per-transaction, not managed as reusable
 *   templates. No template REST resource exists on the platform.
 *
 * Authentication: a per-account API key sent as the `x-api-key` header.
 * There is no OAuth flow — call `credentialFields()` + `exchangeCredentials()`
 * (Connect Link flow). The customer picks production/sandbox.
 *
 * Refused fields:
 *   - Signed-document content / base64 PDF / download URLs
 *   - Audit-trail PDF blobs
 *   - Aadhaar eSign XML responses (eKYC / OTP / biometric payloads)
 *   - Signature images and DSC certificate bundles
 *
 * Docs: https://legaldesk.com/what-are-esign-and-ekyc-api
 */

import type { Credentials, QueryParams, CredentialField } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { AuditTrailEntry } from '../../schema/audit-trail-entry'

import {
  buildAuthUrl,
  exchangeApiKey,
  exchangeCode as legaldeskExchange,
  refreshCredentials as legaldeskRefresh,
  legaldeskCredentialFields,
} from './auth'
import { LegaldeskClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformEnvelope, type RawLegaldeskTransaction } from './transform/envelope'

export interface LegaldeskAdapterConfig {
  redirectUri?: string
}

/** GET /transactions → list response. */
interface TransactionListResponse {
  transactions?: RawLegaldeskTransaction[]
  data?: RawLegaldeskTransaction[]
  total?: number
}

/** GET /transactions/{id} → single-transaction response. */
interface TransactionDetailResponse {
  transaction?: RawLegaldeskTransaction
  data?: RawLegaldeskTransaction
}

/**
 * Why signers, documents and audit-trail entries cannot be read. The only
 * first-party API material LegalDesk publishes names no endpoint; access to
 * the API is by request.
 */
const LEGALDESK_UNDOCUMENTED_REASON =
  'LegalDesk publishes no endpoint for this resource. Its only API page ' +
  '(https://legaldesk.com/what-are-esign-and-ekyc-api) says "The eSign API allows you to get ' +
  'your customers’ signature on documents electronically using Aadhaar-based eSign service" ' +
  'and "click the button below and submit your request", with no path, parameter or response documented.'

function notSupported(what: 'list' | 'get', resource: string): Error {
  return Object.assign(
    new Error(`LegalDesk cannot ${what} ${resource}: ${LEGALDESK_UNDOCUMENTED_REASON}`),
    {
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    },
  )
}

export class LegaldeskAdapter implements DocsignAdapter {
  readonly platform = 'legaldesk'
  readonly version = '0.1.0'
  /** Honours `params.search`; see AdapterCapabilities. Declared so the
   *  router can refuse the parameter on adapters that would drop it. */
  readonly capabilities = { search: true }

  constructor(_config: LegaldeskAdapterConfig = {}) {
    // LegalDesk uses static API-key credentials; no OAuth client config.
  }

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    return buildAuthUrl()
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return legaldeskExchange(code, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return legaldeskRefresh(credentials)
  }

  credentialFields(): CredentialField[] {
    return legaldeskCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return exchangeApiKey(fields)
  }

  private client(credentials: Credentials): LegaldeskClient {
    return new LegaldeskClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const limit = Math.min(Number(params.limit ?? DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE)
    const page = Math.max(Number(params.page ?? 1), 1)
    const out: Record<string, unknown> = { page, limit }
    if (params.search) out.search = String(params.search)
    if (params['status']) out.status = String(params['status'])
    return out
  }

  private async fetchTransaction(
    credentials: Credentials,
    id: string,
  ): Promise<RawLegaldeskTransaction> {
    const res = await this.client(credentials).get<TransactionDetailResponse>(`/transactions/${id}`)
    return res.transaction ?? res.data ?? (res as unknown as RawLegaldeskTransaction)
  }

  // ── Envelopes (eSign transactions) ──────────────────────────────────────────

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const res = await this.client(credentials).get<
      TransactionListResponse | RawLegaldeskTransaction[]
    >('/transactions', this.listParams(params))
    const transactions: RawLegaldeskTransaction[] = Array.isArray(res)
      ? res
      : (res.transactions ?? res.data ?? [])
    return transactions.map(transformEnvelope)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    return transformEnvelope(await this.fetchTransaction(credentials, id))
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Envelope> {
    await this.client(credentials).post(`/transactions/${id}/cancel`, {
      reason: data?.reason ?? 'Cancelled via API',
    })
    return { ...(await this.getEnvelope(credentials, id)), status: 'voided' }
  }

  // ── Signers, documents and audit trail ─────────────────────────────────
  //
  // LegalDesk documents no endpoint that reads a transaction's signers,
  // documents or audit trail (see LEGALDESK_UNDOCUMENTED_REASON). Each method
  // refuses before any request is built rather than call an invented path.

  async listSigners(
    _credentials: Credentials,
    _envelopeId: string,
    _params: QueryParams,
  ): Promise<Signer[]> {
    throw notSupported('list', 'signers')
  }

  async getSigner(_credentials: Credentials, _id: string): Promise<Signer> {
    throw notSupported('get', 'signers')
  }

  async listDocuments(
    _credentials: Credentials,
    _envelopeId: string,
    _params: QueryParams,
  ): Promise<Document[]> {
    throw notSupported('list', 'documents')
  }

  async getDocument(_credentials: Credentials, _id: string): Promise<Document> {
    throw notSupported('get', 'documents')
  }

  async listAuditTrailEntries(
    _credentials: Credentials,
    _envelopeId: string,
    _params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    throw notSupported('list', 'audit trail entries')
  }

  async getAuditTrailEntry(_credentials: Credentials, _id: string): Promise<AuditTrailEntry> {
    throw notSupported('get', 'audit trail entries')
  }
}
