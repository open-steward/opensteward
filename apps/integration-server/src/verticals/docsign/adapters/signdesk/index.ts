/**
 * SignDesk (Melento) adapter — Indian eSign + document-automation gateway.
 *
 * Maps the SignDesk eSign request → canonical `Envelope`, its
 * `signatories[]` → `Signer`, the attached `documents[]` → `Document`
 * (metadata only), and the per-request audit trail → `AuditTrailEntry`.
 *
 * Authentication: an Application ID + License Key sent as the
 * `x-application-id` + `x-license-key` headers. There is no OAuth flow —
 * call `credentialFields()` + `exchangeCredentials()` (Connect Link flow).
 * The customer picks production/sandbox.
 *
 * Resources SignDesk's REST surface supports here: envelopes. Signers,
 * documents and audit-trail entries refuse with 501 (see below). Templates are NOT implemented — SignDesk
 * has no listable template REST resource — so the router returns 501.
 *
 * ── Resource coverage ──────────────────────────────────────────────────────
 * Unverified: template — API docs are login-gated (docs.melento.ai requires
 *   authentication); no public source confirms a listable template endpoint.
 *   The adapter was authored with the note that SignDesk has no listable
 *   template REST resource, but this could not be independently verified.
 *
 * Refused fields:
 *   - Signed-document content / base64 PDF / download URLs
 *   - Audit-trail PDF blobs
 *   - Aadhaar eSign XML responses (eKYC / OTP / biometric payloads)
 *   - Signature images and DSC certificate bundles
 *
 * Docs: https://signdesk.com/esign-api  (reference: https://docs.melento.ai/)
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
  exchangeCode as signdeskExchange,
  refreshCredentials as signdeskRefresh,
  signdeskCredentialFields,
} from './auth'
import { SigndeskClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformEnvelope, type RawSigndeskRequest } from './transform/envelope'

export interface SigndeskAdapterConfig {
  redirectUri?: string
}

/** GET /api/esign/requests → list response. */
interface RequestListResponse {
  requests?: RawSigndeskRequest[]
  data?: RawSigndeskRequest[]
  total?: number
}

/** GET /api/esign/requests/{id} → single-request response. */
interface RequestDetailResponse {
  request?: RawSigndeskRequest
  data?: RawSigndeskRequest
}

const REQUEST_PATH = '/api/esign/requests/{id}'
const AUDIT_TRAIL_PATH = '/api/esign/requests/{id}/audit-trail'

function notSupported(what: string, path: string): Error {
  const reason =
    'no public first-party source documents a read for it (the reference at ' +
    'https://docs.melento.ai/ is login-gated), and the path this adapter used is not routed ' +
    `on api.signdesk.in, which answers "Cannot GET ${path}" (HTTP 404) before any authentication`
  return Object.assign(new Error(`SignDesk cannot ${what}: ${reason}`), {
    statusCode: 501,
    code: 'NOT_SUPPORTED',
  })
}

export class SigndeskAdapter implements DocsignAdapter {
  readonly platform = 'signdesk'
  readonly version = '0.1.0'
  /** Honours `params.search`; see AdapterCapabilities. Declared so the
   *  router can refuse the parameter on adapters that would drop it. */
  readonly capabilities = { search: true }

  constructor(_config: SigndeskAdapterConfig = {}) {
    // SignDesk uses static API-key credentials; no OAuth client config.
  }

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    return buildAuthUrl()
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return signdeskExchange(code, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return signdeskRefresh(credentials)
  }

  credentialFields(): CredentialField[] {
    return signdeskCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return exchangeApiKey(fields)
  }

  private client(credentials: Credentials): SigndeskClient {
    return new SigndeskClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const limit = Math.min(Number(params.limit ?? DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE)
    const page = Math.max(Number(params.page ?? 1), 1)
    const out: Record<string, unknown> = { page, limit }
    if (params.search) out.search = String(params.search)
    if (params['status']) out.status = String(params['status'])
    return out
  }

  private async fetchRequest(credentials: Credentials, id: string): Promise<RawSigndeskRequest> {
    const res = await this.client(credentials).get<RequestDetailResponse>(`/esign/requests/${id}`)
    return res.request ?? res.data ?? (res as unknown as RawSigndeskRequest)
  }

  // ── Envelopes (eSign requests) ──────────────────────────────────────────────

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const res = await this.client(credentials).get<RequestListResponse | RawSigndeskRequest[]>(
      '/esign/requests',
      this.listParams(params),
    )
    const requests: RawSigndeskRequest[] = Array.isArray(res)
      ? res
      : (res.requests ?? res.data ?? [])
    return requests.map(transformEnvelope)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    return transformEnvelope(await this.fetchRequest(credentials, id))
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Envelope> {
    await this.client(credentials).post(`/esign/requests/${id}/cancel`, {
      reason: data?.reason ?? 'Cancelled via API',
    })
    return { ...(await this.getEnvelope(credentials, id)), status: 'voided' }
  }

  // ── Signers, documents, audit trail: refused ─────────────────────────────
  //
  // These used to read GET /api/esign/requests/{id} and
  // GET /api/esign/requests/{id}/audit-trail. No public first-party source
  // documents either path (https://docs.melento.ai/ is behind an OTP login),
  // and api.signdesk.in answers both with Express's route-level 404
  // "Cannot GET …" before any authentication. The audit-trail method also
  // built synthetic entries from timestamps when that call failed. They now
  // refuse before sending anything.

  async listSigners(
    _credentials: Credentials,
    _envId: string,
    _params: QueryParams,
  ): Promise<Signer[]> {
    throw notSupported('list signers', REQUEST_PATH)
  }

  async getSigner(_credentials: Credentials, _id: string): Promise<Signer> {
    throw notSupported('get signers', REQUEST_PATH)
  }

  async listDocuments(
    _credentials: Credentials,
    _envId: string,
    _params: QueryParams,
  ): Promise<Document[]> {
    throw notSupported('list documents', REQUEST_PATH)
  }

  async getDocument(_credentials: Credentials, _id: string): Promise<Document> {
    throw notSupported('get documents', REQUEST_PATH)
  }

  async listAuditTrailEntries(
    _credentials: Credentials,
    _envId: string,
    _params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    throw notSupported('list audit trail entries', AUDIT_TRAIL_PATH)
  }

  async getAuditTrailEntry(_credentials: Credentials, _id: string): Promise<AuditTrailEntry> {
    throw notSupported('get audit trail entries', AUDIT_TRAIL_PATH)
  }
}
