/**
 * DocHub adapter.
 *
 * DocHub documents "DocHub Public API V2" at
 * https://dev.dochub.com/api-reference/openapi.yaml (see constants.ts).
 *
 * Rebuilt onto that spec: listSigners / getSigner / listDocuments /
 * getDocument, all reading GET /api/v2/sign-requests/{id} (operationId
 * getSignRequest), and voidEnvelope on POST /api/v2/sign-requests/{id}/void
 * (operationId voidSignRequest), on V2_API_BASE_URL; the OAuth flow in
 * auth.ts (authorization code + PKCE S256, client Basic auth at
 * /api/v2/oauth/token).
 *
 * STILL UNVERIFIED PLACEHOLDERS: listEnvelopes, getEnvelope, listTemplates,
 * getTemplate (api.dochub.com/v1, underscore paths). The spec documents
 * GET /api/v2/sign-requests and GET /api/v2/documents instead; those reads
 * are not rebuilt yet.
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unverified: audit-trail-entry — DocHub (dochub.com) has no confirmed public REST API as of
//   June 2026; dochub.com/developers shows "No available documents here". Audit trails are
//   exposed only as downloadable PDFs in the UI. No API endpoint could be verified.

import { pageLocally } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { Template } from '../../schema/template'

import {
  buildAuthUrl,
  exchangeCode as dochubExchange,
  refreshCredentials as dochubRefresh,
} from './auth'
import { DochubClient } from './client'
import { DEFAULT_PAGE_SIZE, DEFAULT_SCOPES, V2_API_BASE_URL } from './constants'

import {
  transformEnvelope,
  transformFlatEnvelope,
  type RawDochubSignRequest,
} from './transform/envelope'
import { transformTemplate, type RawDochubTemplate } from './transform/template'
import { transformSigner } from './transform/signer'
import { transformDocument } from './transform/document'
import type { RawDochubFlatSignRequest } from './transform/sign-request'

/** Canonical signer/document ids are `<signRequestId>:<id>`; DocHub
 *  documents no by-id read for either, only the sign request carrying them. */
function splitCompositeId(id: string, resource: string): [string, string] {
  const at = id.indexOf(':')
  if (at <= 0 || at === id.length - 1) {
    throw Object.assign(
      new Error(`DocHub ${resource} id must be <signRequestId>:<id> as listed (got "${id}")`),
      { statusCode: 404, code: 'NOT_FOUND' },
    )
  }
  return [id.slice(0, at), id.slice(at + 1)]
}

function notFound(resource: string, id: string): Error {
  return Object.assign(new Error(`DocHub ${resource} ${id} not found`), {
    statusCode: 404,
    code: 'NOT_FOUND',
  })
}

export interface DochubAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

interface SignRequestListResponse {
  data?: RawDochubSignRequest[]
  meta?: { page?: number; per_page?: number; total?: number }
}

interface TemplateListResponse {
  data?: RawDochubTemplate[]
  meta?: { page?: number; per_page?: number; total?: number }
}

export class DochubAdapter implements DocsignAdapter {
  readonly platform = 'dochub'
  readonly version = '0.1.0'
  /** `search`: honours `params.search`; see AdapterCapabilities. Declared so
   *  the router can refuse the parameter on adapters that would drop it.
   *  `requiresPkce`: the token endpoint's authorization_code grant is
   *  "Exchange authorization code for access token (with PKCE)", and
   *  https://dochub.com/.well-known/oauth-authorization-server gives
   *  `"code_challenge_methods_supported":["S256"]`. */
  readonly capabilities = { search: true, requiresPkce: true }

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: DochubAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  getAuthUrl(state: string, overrideScopes?: string[], codeChallenge?: string): string {
    return buildAuthUrl(
      this.clientId,
      this.redirectUri,
      overrideScopes ?? this.scopes,
      state,
      codeChallenge,
    )
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return dochubExchange(code, redirectUri, this.clientId, this.clientSecret)
  }

  async exchangeCodeWithVerifier(
    code: string,
    redirectUri: string,
    codeVerifier: string,
  ): Promise<Credentials> {
    return dochubExchange(code, redirectUri, this.clientId, this.clientSecret, codeVerifier)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return dochubRefresh(credentials, this.clientId, this.clientSecret)
  }

  private client(credentials: Credentials): DochubClient {
    return new DochubClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      page: params.page ?? 1,
      per_page: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    if (params['status']) out.status = String(params['status'])
    if (params.updatedAfter instanceof Date) out.updated_after = params.updatedAfter.toISOString()
    else if (params['updated_after']) out.updated_after = String(params['updated_after'])
    if (params.search) out.query = String(params.search)
    return out
  }

  // ── Envelopes (sign requests) ─────────────────────────────────────────────

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const res = await this.client(credentials).get<SignRequestListResponse>(
      '/sign_requests',
      this.listParams(params),
    )
    return (res.data ?? []).map(transformEnvelope)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const res = await this.client(credentials).get<{ data?: RawDochubSignRequest }>(
      `/sign_requests/${id}`,
    )
    if (!res.data) throw new Error(`sign request ${id} not found`)
    return transformEnvelope(res.data)
  }

  /**
   * POST /api/v2/sign-requests/{id}/void (operationId voidSignRequest):
   * "Voids an in-progress sign request, cancelling it: status becomes
   * `VOIDED`". The operation documents no requestBody, so the canonical
   * `reason` has nowhere to go and is not sent. Its 200 `application/json`
   * body is `sign_request_flat_resource`, the voided sign request itself.
   *
   * Sent with `idempotent: false`: the operation says "Void is a one-way
   * transition and is **not retry-idempotent**: once voided the sign request
   * is no longer `IN_PROGRESS`, so a repeated void returns `422`". Re-POSTing
   * after a 5xx that followed a committed void would report that success as a
   * 422, so a 5xx is surfaced instead. 429 is still retried.
   */
  async voidEnvelope(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Envelope> {
    const sr = await new DochubClient(credentials, V2_API_BASE_URL).post<RawDochubFlatSignRequest>(
      `/sign-requests/${encodeURIComponent(id)}/void`,
      undefined,
      { idempotent: false },
    )
    return transformFlatEnvelope(sr)
  }

  // ── Sign-request reads on DocHub Public API V2 ──────────────────────────
  // GET /api/v2/sign-requests/{id} "Returns comprehensive sign request
  // information including: ... All signers assigned to the sign request /
  // Document information". It documents only `id` and `include` ("Supported
  // values: `document`, `user.entity`, `signers.user`,
  // `signers.user.entity`") and no paging, so each list is whole and paged
  // locally. `Accept: application/json` (set by the client) selects the flat
  // format, where related resources are "embedded inline in the root object
  // (`user`, `document`, `signersData`)".

  private async getSignRequest(
    credentials: Credentials,
    id: string,
    include: 'signers.user' | 'document',
  ): Promise<RawDochubFlatSignRequest> {
    return new DochubClient(credentials, V2_API_BASE_URL).get<RawDochubFlatSignRequest>(
      `/sign-requests/${encodeURIComponent(id)}`,
      { include },
    )
  }

  private async signersOf(credentials: Credentials, envelopeId: string): Promise<Signer[]> {
    const sr = await this.getSignRequest(credentials, envelopeId, 'signers.user')
    if (!Array.isArray(sr.signersData)) {
      throw new Error(
        `DocHub sign request ${envelopeId} returned no signersData for include=signers.user`,
      )
    }
    return sr.signersData.map((s) => transformSigner(s, envelopeId))
  }

  private async documentOf(credentials: Credentials, envelopeId: string): Promise<Document> {
    const sr = await this.getSignRequest(credentials, envelopeId, 'document')
    if (!sr.document) {
      throw new Error(`DocHub sign request ${envelopeId} returned no document for include=document`)
    }
    return transformDocument(sr.document, envelopeId)
  }

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    return pageLocally(await this.signersOf(credentials, envelopeId), params)
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    const [envelopeId, signerId] = splitCompositeId(id, 'signer')
    const signer = (await this.signersOf(credentials, envelopeId)).find(
      (s) => s.externalId === signerId,
    )
    if (!signer) throw notFound('signer', id)
    return signer
  }

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    // A sign request has one document (the singular `document` relationship).
    return pageLocally([await this.documentOf(credentials, envelopeId)], params)
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const [envelopeId, documentId] = splitCompositeId(id, 'document')
    const doc = await this.documentOf(credentials, envelopeId)
    if (doc.externalId !== documentId) throw notFound('document', id)
    return doc
  }

  // ── Templates ──────────────────────────────────────────────────────────────

  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    const res = await this.client(credentials).get<TemplateListResponse>(
      '/templates',
      this.listParams(params),
    )
    return (res.data ?? []).map(transformTemplate)
  }

  async getTemplate(credentials: Credentials, id: string): Promise<Template> {
    const res = await this.client(credentials).get<{ data?: RawDochubTemplate }>(`/templates/${id}`)
    if (!res.data) throw new Error(`template ${id} not found`)
    return transformTemplate(res.data)
  }
}
