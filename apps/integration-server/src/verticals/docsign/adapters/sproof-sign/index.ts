/**
 * sproof Sign adapter.
 *
 * Spec: https://sign.sproof.com/api/v1/documentation/json. A sproof
 * `_Document` (one file sent to its `members`) maps to a canonical Envelope,
 * keyed by its owner's member id, since GET /documents/{memberId} is the only
 * documented read of one document. Members → Signer, the file → Document,
 * GET /documents?view=templates → Template. The audit trail is a PDF only
 * (GET /documents/{memberId}/pdfAuditTrail, binary; GET
 * /documents/{memberId}/fda, Base64), so audit-trail entries refuse.
 *
 * Auth: static API key sent as the `token` query parameter. No interactive
 * OAuth flow, so `getAuthUrl()` throws.
 */
import { pageLocally, reportUpstreamPage } from '@opensteward/shared'
import type { Credentials, CredentialField, QueryParams } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { AuditTrailEntry } from '../../schema/audit-trail-entry'
import type { Template } from '../../schema/template'
import type { WebhookEvent } from '../../schema/webhook'

import {
  SPROOF_CREDENTIAL_FIELDS,
  exchangeSproofCredentials,
  refreshSproofCredentials,
} from './auth'
import { SproofSignClient } from './client'
import { DEFAULT_PAGE_SIZE, DEFAULT_SCOPES } from './constants'
import { verifySproofSignWebhook, parseSproofSignWebhookEvents } from './webhook'

import { transformEnvelope } from './transform/envelope'
import { transformSigner } from './transform/signer'
import { transformDocument } from './transform/document'
import { transformTemplate } from './transform/template'
import type { RawSproofDocument, RawSproofDocumentList } from './transform/shared'

export interface SproofSignAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

export class SproofSignAdapter implements DocsignAdapter {
  readonly platform = 'sproof-sign'
  readonly version = '0.1.0'

  private _clientId: string
  private _clientSecret: string
  private _redirectUri: string
  private _scopes: string[]

  constructor(config: SproofSignAdapterConfig) {
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
      'sproof-sign uses static API key auth; use credentialFields() instead',
    )
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error(
      'sproof-sign uses static API key auth; use exchangeCredentials() instead',
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshSproofCredentials(credentials)
  }

  credentialFields(): CredentialField[] {
    return SPROOF_CREDENTIAL_FIELDS
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return exchangeSproofCredentials(fields)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifySproofSignWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseSproofSignWebhookEvents(payload)
  }

  private client(credentials: Credentials): SproofSignClient {
    return new SproofSignClient(credentials)
  }

  /**
   * GET /documents at the caller's page and exact limit. `page` ("Page
   * number", default 1) and `perPage` ("Number of entries per page", default
   * 10); no maximum is documented, so the limit is sent as is. The end signal
   * is the reply's own `pagination.currentPage` / `lastPage`.
   */
  private async listDocumentsPage(
    credentials: Credentials,
    params: QueryParams,
    view?: 'templates',
  ): Promise<RawSproofDocument[]> {
    const page =
      typeof params.page === 'number' && Number.isFinite(params.page) && params.page >= 1
        ? Math.floor(params.page)
        : 1
    const perPage = params.limit ?? DEFAULT_PAGE_SIZE
    const query: Record<string, unknown> = { page, perPage }
    if (view) query.view = view
    const res = await this.client(credentials).get<RawSproofDocumentList>('/documents', query)
    const p = res.pagination
    if (typeof p?.currentPage === 'number' && typeof p.lastPage === 'number') {
      reportUpstreamPage(params, {
        hasMore: p.currentPage < p.lastPage,
        ...(typeof p.total === 'number' ? { totalCount: p.total } : {}),
      })
    }
    return res.data ?? []
  }

  /** GET /documents/{memberId}: "Get the status of a signature request. Returns a document JSON object". */
  private async readDocument(credentials: Credentials, memberId: string): Promise<RawSproofDocument> {
    return this.client(credentials).get<RawSproofDocument>(
      `/documents/${encodeURIComponent(memberId)}`,
    )
  }

  private static splitChildId(id: string, what: string): [string, string] {
    const i = id.indexOf(':')
    if (i <= 0 || i === id.length - 1) {
      throw Object.assign(
        new Error(`sproof-sign ${what} id must have the shape "<envelopeId>:<id>" (got "${id}")`),
        { statusCode: 400, code: 'VALIDATION' },
      )
    }
    return [id.slice(0, i), id.slice(i + 1)]
  }

  // ── Envelopes (documents) ─────────────────────────────────────────────────

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    return (await this.listDocumentsPage(credentials, params)).map(transformEnvelope)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    return transformEnvelope(await this.readDocument(credentials, id))
  }

  // Write method, out of scope of the list rebuild: POST
  // /signature-requests/{id}/cancel is not in the sproof spec.
  async voidEnvelope(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Envelope> {
    await this.client(credentials).post(`/signature-requests/${id}/cancel`, {
      reason: data?.reason ?? 'Voided by API',
    })
    return this.getEnvelope(credentials, id)
  }

  // ── Signers (document members) ────────────────────────────────────────────

  /** `_Document.members`, whole in one reply, paged here. */
  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    const doc = await this.readDocument(credentials, envelopeId)
    const signers = (doc.members ?? []).map((m) => transformSigner(m, envelopeId, doc.state))
    return pageLocally(signers, params)
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    const [envelopeId, memberId] = SproofSignAdapter.splitChildId(id, 'signer')
    const all = await this.listSigners(credentials, envelopeId, {})
    const found = all.find((s) => s.externalId === memberId)
    if (!found) {
      throw Object.assign(new Error(`sproof-sign signer ${memberId} not found on ${envelopeId}`), {
        statusCode: 404,
        code: 'NOT_FOUND',
      })
    }
    return found
  }

  // ── Documents (metadata only; content REFUSED) ───────────────────────────

  /** A sproof document is one file: one Document per envelope. */
  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    const doc = await this.readDocument(credentials, envelopeId)
    return pageLocally([transformDocument(doc, envelopeId)], params)
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const [envelopeId, documentId] = SproofSignAdapter.splitChildId(id, 'document')
    const all = await this.listDocuments(credentials, envelopeId, {})
    const found = all.find((d) => d.externalId === documentId)
    if (!found) {
      throw Object.assign(new Error(`sproof-sign document ${documentId} not found on ${envelopeId}`), {
        statusCode: 404,
        code: 'NOT_FOUND',
      })
    }
    return found
  }

  // ── Audit-trail entries: REFUSED ─────────────────────────────────────────

  private static auditRefusal(): Error {
    return Object.assign(
      new Error(
        'sproof Sign cannot list audit-trail entries: both of its audit endpoints return a PDF. ' +
          'GET /documents/{memberId}/pdfAuditTrail returns a "Binary PDF audit trail file" and ' +
          'GET /documents/{memberId}/fda returns a "Base64 encoded PDF audit trail"',
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }

  async listAuditTrailEntries(
    _credentials: Credentials,
    _envelopeId: string,
    _params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    throw SproofSignAdapter.auditRefusal()
  }

  async getAuditTrailEntry(_credentials: Credentials, _id: string): Promise<AuditTrailEntry> {
    throw SproofSignAdapter.auditRefusal()
  }

  // ── Templates (GET /documents?view=templates) ────────────────────────────

  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    return (await this.listDocumentsPage(credentials, params, 'templates')).map(transformTemplate)
  }

  async getTemplate(credentials: Credentials, id: string): Promise<Template> {
    return transformTemplate(await this.readDocument(credentials, id))
  }
}
