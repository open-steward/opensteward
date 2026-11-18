/**
 * Signaturit adapter (REST API v3).
 *
 * Spanish eIDAS-qualified trust service provider. Docs:
 * https://docs.signaturit.com/api/latest
 *
 *   - `GET /v3/signatures.json` (limit ≤ 100, offset; "the result window size
 *     (limit + offset) cannot exceed 10.000") → canonical `Envelope`.
 *   - `GET /v3/signatures/{id}.json` → its `documents` items ("created for
 *     every signer and uploaded file") → `Signer` and `Document`, and their
 *     `events` → `AuditTrailEntry`. The only other audit trail is a PDF.
 *   - `GET /v3/templates.json` (limit ≤ 100, offset) → `Template`. No
 *     get-by-id is documented, so `getTemplate` refuses.
 *
 * Auth: static API key sent as `Authorization: Bearer <apiKey>`. No
 * interactive OAuth flow, so `getAuthUrl()` throws.
 */
import { pageLocally, pageOffset, reportUpstreamPage } from '@opensteward/shared'
import type { Credentials, CredentialField, QueryParams } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { AuditTrailEntry } from '../../schema/audit-trail-entry'
import type { Template } from '../../schema/template'
import type { WebhookEvent } from '../../schema/webhook'

import {
  SIGNATURIT_CREDENTIAL_FIELDS,
  exchangeSignaturitCredentials,
  refreshSignaturitCredentials,
} from './auth'
import { SignaturitClient } from './client'
import { DEFAULT_PAGE_SIZE, DEFAULT_SCOPES, MAX_PAGE_SIZE, MAX_RESULT_WINDOW } from './constants'
import { verifySignaturitWebhook, parseSignaturitWebhookEvents } from './webhook'

import {
  transformEnvelope,
  type RawSignaturitDocumentItem,
  type RawSignaturitSignature,
} from './transform/envelope'
import { transformSigner } from './transform/signer'
import { transformDocument } from './transform/document'
import { transformAuditTrailEntry } from './transform/audit-trail-entry'
import { transformTemplate, type RawSignaturitTemplate } from './transform/template'

export interface SignaturitAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

export class SignaturitAdapter implements DocsignAdapter {
  readonly platform = 'signaturit'
  readonly version = '0.1.0'
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  private _clientId: string
  private _clientSecret: string
  private _redirectUri: string
  private _scopes: string[]

  constructor(config: SignaturitAdapterConfig) {
    this._clientId = config.clientId
    this._clientSecret = config.clientSecret
    this._redirectUri = config.redirectUri
    this._scopes = config.scopes ?? DEFAULT_SCOPES
    void this._clientId
    void this._clientSecret
    void this._redirectUri
    void this._scopes
  }

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    throw new Error(
      'signaturit uses static API key auth; use credentialFields() instead',
    )
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error(
      'signaturit uses static API key auth; use exchangeCredentials() instead',
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshSignaturitCredentials(credentials)
  }

  credentialFields(): CredentialField[] {
    return SIGNATURIT_CREDENTIAL_FIELDS
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return exchangeSignaturitCredentials(fields)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifySignaturitWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseSignaturitWebhookEvents(payload)
  }

  private client(credentials: Credentials): SignaturitClient {
    return new SignaturitClient(credentials)
  }

  /**
   * The upstream page size for a caller's `limit`: that limit, clamped to the
   * documented maximum ("The signature limit is 100", "The template limit is
   * 100"). A clamped size is reported so short-page judgements use it.
   */
  private pageSize(params: QueryParams): number {
    const asked = params.limit ?? DEFAULT_PAGE_SIZE
    const size = Math.min(Math.max(1, Math.floor(asked)), MAX_PAGE_SIZE)
    if (params.limit !== undefined && size < params.limit) {
      reportUpstreamPage(params, { pageSize: size })
    }
    return size
  }

  /** `GET /v3/signatures/{id}.json` — "Get a given signature request." */
  private async signature(
    credentials: Credentials,
    envelopeId: string,
  ): Promise<RawSignaturitSignature> {
    return this.client(credentials).get<RawSignaturitSignature>(
      `/signatures/${encodeURIComponent(envelopeId)}.json`,
    )
  }

  /** Split `<envelopeId>:<documentItemId>`, the id a signer / document list returns. */
  private splitItemId(id: string, what: string): [string, string] {
    const [envelopeId, itemId, ...rest] = id.split(':')
    if (!envelopeId || !itemId || rest.length > 0) {
      throw Object.assign(
        new Error(`Signaturit ${what} id expects shape "<signatureId>:<documentId>"`),
        { statusCode: 400, code: 'VALIDATION' },
      )
    }
    return [envelopeId, itemId]
  }

  // ── Envelopes (signatures) ───────────────────────────────────────────────

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const size = this.pageSize(params)
    const offset = pageOffset(params, size)
    if (offset >= MAX_RESULT_WINDOW) {
      throw Object.assign(
        new Error(
          'Signaturit cannot list signatures past row 10,000: "the result window size ' +
            '(limit + offset) cannot exceed 10.000". Narrow the query with status.',
        ),
        { statusCode: 400, code: 'VALIDATION' },
      )
    }
    // The last page inside the window asks only for the rows left in it, so
    // no row before row 10,000 is out of reach.
    const limit = Math.min(size, MAX_RESULT_WINDOW - offset)
    const query: Record<string, unknown> = { limit, offset }
    if (params['status'] !== undefined) query.status = String(params['status'])
    const rows = await this.client(credentials).get<RawSignaturitSignature[]>(
      '/signatures.json',
      query,
    )
    if (!Array.isArray(rows)) throw new Error('Signaturit GET /signatures.json did not return an array')
    // No total is returned: a short page is the end, and so is the end of the
    // window, since no later page can be requested.
    reportUpstreamPage(params, {
      hasMore: rows.length >= limit && offset + rows.length < MAX_RESULT_WINDOW,
    })
    return rows.map(transformEnvelope)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    return transformEnvelope(await this.signature(credentials, id))
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Envelope> {
    await this.client(credentials).patch(`/signatures/${id}/cancel`, {})
    return this.getEnvelope(credentials, id)
  }

  // ── Signers (one document item per signer and file) ──────────────────────

  private async signerRows(credentials: Credentials, envelopeId: string): Promise<Signer[]> {
    const env = await this.signature(credentials, envelopeId)
    return (env.documents ?? []).map((d: RawSignaturitDocumentItem) =>
      transformSigner(d, envelopeId),
    )
  }

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    // The signature returns every document item at once; the caller's page
    // is cut here.
    return pageLocally(await this.signerRows(credentials, envelopeId), params)
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    const [envelopeId] = this.splitItemId(id, 'signer')
    const found = (await this.signerRows(credentials, envelopeId)).find((s) => s.id === id)
    if (!found) throw Object.assign(new Error(`Signaturit signer ${id} not found`), { statusCode: 404 })
    return found
  }

  // ── Documents (metadata only — content REFUSED) ──────────────────────────

  private async documentRows(credentials: Credentials, envelopeId: string): Promise<Document[]> {
    const env = await this.signature(credentials, envelopeId)
    return (env.documents ?? []).map((d: RawSignaturitDocumentItem, i: number) =>
      transformDocument(d, envelopeId, i),
    )
  }

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    return pageLocally(await this.documentRows(credentials, envelopeId), params)
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const [envelopeId] = this.splitItemId(id, 'document')
    const found = (await this.documentRows(credentials, envelopeId)).find((d) => d.id === id)
    if (!found) throw Object.assign(new Error(`Signaturit document ${id} not found`), { statusCode: 404 })
    return found
  }

  // ── Audit-trail entries (documents[].events) ─────────────────────────────

  private async auditRows(credentials: Credentials, envelopeId: string): Promise<AuditTrailEntry[]> {
    const env = await this.signature(credentials, envelopeId)
    return (env.documents ?? []).flatMap((d: RawSignaturitDocumentItem) =>
      (d.events ?? []).map((e, i) => transformAuditTrailEntry(e, d, envelopeId, i)),
    )
  }

  async listAuditTrailEntries(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    return pageLocally(await this.auditRows(credentials, envelopeId), params)
  }

  async getAuditTrailEntry(credentials: Credentials, id: string): Promise<AuditTrailEntry> {
    const [envelopeId, itemId, index, ...rest] = id.split(':')
    if (!envelopeId || !itemId || !index || rest.length > 0) {
      throw Object.assign(
        new Error('Signaturit audit-trail id expects shape "<signatureId>:<documentId>:<index>"'),
        { statusCode: 400, code: 'VALIDATION' },
      )
    }
    const found = (await this.auditRows(credentials, envelopeId)).find((e) => e.id === id)
    if (!found) throw Object.assign(new Error(`Signaturit audit entry ${id} not found`), { statusCode: 404 })
    return found
  }

  // ── Templates ────────────────────────────────────────────────────────────

  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    const size = this.pageSize(params)
    const rows = await this.client(credentials).get<RawSignaturitTemplate[]>('/templates.json', {
      limit: size,
      offset: pageOffset(params, size),
    })
    if (!Array.isArray(rows)) throw new Error('Signaturit GET /templates.json did not return an array')
    // No total is returned: a short page is the end.
    reportUpstreamPage(params, { hasMore: rows.length >= size })
    return rows.map(transformTemplate)
  }

  async getTemplate(_credentials: Credentials, _id: string): Promise<Template> {
    throw Object.assign(
      new Error(
        'Signaturit cannot read a template by id: the API documents only "GET ' +
          '/v3/templates.json — List templates from the requester."',
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }
}
