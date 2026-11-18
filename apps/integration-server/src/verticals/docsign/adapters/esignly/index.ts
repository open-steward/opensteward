/**
 * eSignly adapter.
 *
 * API reference: https://www.esignly.com/api-docs.html, which renders the
 * collection https://www.esignly.com/eSignlyDec16-postmanCollection.json.
 * Every documented call is a POST of multipart form-data to
 * https://acc.esignly.com/v1/<rpcName>/ carrying `api_key`.
 *
 * - Signers: POST /v1/checkSignStatus/ → `signatures[]`, paged locally.
 * - Documents and audit-trail entries: refused (501) — the reference documents
 *   no document manifest and no audit-trail endpoint.
 * - Envelopes and templates still call GET /signRequests and GET /templates,
 *   which the reference does not document (it has POST /v1/listSignRequest/
 *   and POST /v1/listTemplate). They were outside this rebuild's targets.
 *
 * eSignly does not document a webhook-signature-verification mechanism, so
 * `verifyWebhook` / `parseWebhookEvents` are not implemented.
 */

import { pageLocally } from '@opensteward/shared'
import type { Credentials, QueryParams, CredentialField } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { AuditTrailEntry } from '../../schema/audit-trail-entry'
import type { Template } from '../../schema/template'

import {
  credentialFields as esignlyCredentialFields,
  exchangeCredentials as esignlyExchangeCredentials,
} from './auth'
import { EsignlyClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import { transformEnvelope, type RawEsignlySignRequest } from './transform/envelope'
import { transformSigner, type RawEsignlySignature } from './transform/signer'
import { transformTemplate, type RawEsignlyTemplate } from './transform/template'

export interface EsignlyAdapterConfig {
  clientId: string
  /** Treated as a fallback API key when set; otherwise the key comes from the form. */
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

interface SignRequestListResponse {
  data?: RawEsignlySignRequest[]
  sign_requests?: RawEsignlySignRequest[]
  documents?: RawEsignlySignRequest[]
  meta?: { page?: number; page_size?: number; total?: number }
}

interface SignRequestDetailResponse {
  data?: RawEsignlySignRequest
  sign_request?: RawEsignlySignRequest
  document?: RawEsignlySignRequest
}

interface TemplateListResponse {
  data?: RawEsignlyTemplate[]
  templates?: RawEsignlyTemplate[]
  meta?: { page?: number; page_size?: number; total?: number }
}

interface TemplateDetailResponse {
  data?: RawEsignlyTemplate
  template?: RawEsignlyTemplate
}

/**
 * Success body of POST /v1/checkSignStatus/ — the documented example carries
 * `signature_request` and `signatures`; only `signatures` is read here.
 */
interface CheckSignStatusResponse {
  signatures?: RawEsignlySignature[]
}

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

export class EsignlyAdapter implements DocsignAdapter {
  readonly platform = 'esignly'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string

  private redirectUri: string

  private scopes: string[]

  constructor(config: EsignlyAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? []
  }

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    throw new Error('eSignly uses static API key auth; use credentialFields() instead')
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('eSignly uses static API key auth; use exchangeCredentials() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  credentialFields(): CredentialField[] {
    return esignlyCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    if (!fields.apiKey && this.clientSecret) {
      return { accessToken: this.clientSecret }
    }
    return esignlyExchangeCredentials(fields)
  }

  private client(credentials: Credentials): EsignlyClient {
    return new EsignlyClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      page: params.page ?? 1,
      page_size: params.limit ?? DEFAULT_PAGE_SIZE,
      ...(params['status'] ? { status: String(params['status']) } : {}),
    }
  }

  private unwrapSignRequest(
    res: SignRequestDetailResponse | RawEsignlySignRequest,
  ): RawEsignlySignRequest {
    const wrapped = res as SignRequestDetailResponse
    return (
      wrapped.data ?? wrapped.sign_request ?? wrapped.document ?? (res as RawEsignlySignRequest)
    )
  }

  // ── Envelopes (sign requests) ─────────────────────────────────────────────

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const res = await this.client(credentials).get<SignRequestListResponse>(
      '/signRequests',
      this.listParams(params),
    )
    const rows = res.data ?? res.sign_requests ?? res.documents ?? []
    return rows.map(transformEnvelope)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const res = await this.client(credentials).get<
      SignRequestDetailResponse | RawEsignlySignRequest
    >(`/signRequests/${id}`)
    return transformEnvelope(this.unwrapSignRequest(res))
  }

  // ── Signers (POST /v1/checkSignStatus/ → signatures[]) ────────────────────
  //
  // eSignly's API reference (https://www.esignly.com/api-docs.html, rendered
  // from https://www.esignly.com/eSignlyDec16-postmanCollection.json) lists a
  // request's signers only through "Get Document status":
  //   POST {{design_base_url}}/v1/checkSignStatus/
  //   formdata: api_key, signature_request_id, api_domain
  // "Check whether a request is complete and review each signer’s state
  // (sent, viewed, signed)." The whole `signatures[]` array comes back in one
  // response with no paging parameters, so it is paged locally.

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    const res = await this.client(credentials).post<CheckSignStatusResponse>('/checkSignStatus/', {
      signature_request_id: envelopeId,
    })
    return pageLocally(
      (res.signatures ?? []).map((s) => transformSigner(s, envelopeId)),
      params,
    )
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    const sep = id.indexOf(':')
    const envelopeId = sep > 0 ? id.slice(0, sep) : ''
    const signatureId = sep > 0 ? id.slice(sep + 1) : ''
    if (!envelopeId || !signatureId) {
      throw new Error(
        'eSignly getSigner expects id of shape "<signature_request_id>:<signature_id>"',
      )
    }
    const all = await this.listSigners(credentials, envelopeId, {})
    const found = all.find((s) => s.externalId === signatureId)
    if (!found) throw new Error(`eSignly signer ${signatureId} not found on request ${envelopeId}`)
    return found
  }

  // ── Documents — REFUSED ──────────────────────────────────────────────────
  //
  // The API reference documents no document manifest. checkSignStatus returns
  // only `signature_request` and `signatures`; the sole per-document call,
  // "Download Document" (POST /v1/downloadDoc/), returns the file content,
  // which this adapter never fetches.

  async listDocuments(
    _credentials: Credentials,
    _envelopeId: string,
    _params: QueryParams,
  ): Promise<Document[]> {
    throw notSupported(
      'eSignly cannot list documents: its API reference documents no document manifest (checkSignStatus returns only "signature_request" and "signatures")',
    )
  }

  async getDocument(_credentials: Credentials, _id: string): Promise<Document> {
    throw notSupported(
      'eSignly cannot read document metadata: its API reference documents no document manifest (checkSignStatus returns only "signature_request" and "signatures")',
    )
  }

  // ── Audit-trail entries — REFUSED ────────────────────────────────────────
  //
  // None of the collection's 45 requests reads an audit trail; audit trails
  // appear only in marketing copy ("detailed audit trails for every document").

  async listAuditTrailEntries(
    _credentials: Credentials,
    _envelopeId: string,
    _params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    throw notSupported(
      'eSignly cannot list audit-trail entries: its API reference documents no audit-trail endpoint',
    )
  }

  async getAuditTrailEntry(_credentials: Credentials, _id: string): Promise<AuditTrailEntry> {
    throw notSupported(
      'eSignly cannot read audit-trail entries: its API reference documents no audit-trail endpoint',
    )
  }

  // ── Templates ────────────────────────────────────────────────────────────

  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    const res = await this.client(credentials).get<TemplateListResponse>(
      '/templates',
      this.listParams(params),
    )
    const rows = res.data ?? res.templates ?? []
    return rows.map(transformTemplate)
  }

  async getTemplate(credentials: Credentials, id: string): Promise<Template> {
    const res = await this.client(credentials).get<TemplateDetailResponse | RawEsignlyTemplate>(
      `/templates/${id}`,
    )
    const wrapped = res as TemplateDetailResponse
    const raw = wrapped.data ?? wrapped.template ?? (res as RawEsignlyTemplate)
    return transformTemplate(raw)
  }
}
