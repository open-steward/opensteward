/**
 * SignRequest adapter.
 *
 * Maps SignRequest's document-centric REST API to the canonical docsign
 * schema. A SignRequest "document" carries both the file and the nested
 * `signrequest` (the signing process), so one document → one canonical
 * Envelope + one canonical Document, keyed by the document uuid:
 *
 *   Envelope            ← GET /documents/{uuid}/ (document.signrequest + status)
 *   Signer              ← document.signrequest.signers[] (inline)
 *   Document            ← GET /documents/{uuid}/ (single file, metadata only)
 *   AuditTrailEntry     ← GET /events/?document__uuid={uuid}
 *   Template            ← GET /templates/
 *
 * Auth is a static API token (`Authorization: Token <token>`); SignRequest
 * has no OAuth, so the OAuth methods throw and the adapter uses the Connect
 * Link single-API-key credential form. voidEnvelope cancels the underlying
 * signrequest. Document binary content is never read.
 */

import { pageLocally, pageOffset, reportUpstreamPage } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { AuditTrailEntry } from '../../schema/audit-trail-entry'
import type { Template } from '../../schema/template'
import type { WebhookEvent } from '../../schema/webhook'

import { SIGNREQUEST_API_KEY_FORM } from './auth'
import { SignRequestClient, type SignRequestList } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import { verifySignRequestWebhook, parseSignRequestWebhookEvents } from './webhook'

import { transformEnvelope, type RawSignRequestDocument } from './transform/envelope'
import { transformSigner } from './transform/signer'
import { transformDocument } from './transform/document'
import {
  transformAuditTrailEntry,
  type RawSignRequestEvent,
} from './transform/audit-trail-entry'
import { transformTemplate, type RawSignRequestTemplate } from './transform/template'

export interface SignrequestAdapterConfig {
  clientId?: string
  clientSecret?: string
  redirectUri?: string
}

export class SignrequestAdapter implements DocsignAdapter {
  readonly platform = 'signrequest'
  readonly version = '0.1.0'

  // SignRequest authenticates with a static API token — Connect Link renders
  // a single API-key field; the OAuth methods below are unsupported.
  credentialFields = SIGNREQUEST_API_KEY_FORM.credentialFields
  exchangeCredentials = SIGNREQUEST_API_KEY_FORM.exchangeCredentials

  constructor(_config: SignrequestAdapterConfig = {}) {}

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    throw new Error('SignRequest does not support OAuth. Use the API-token credential form.')
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('SignRequest does not support OAuth. Use the API-token credential form.')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Static API tokens never expire; nothing to refresh.
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifySignRequestWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseSignRequestWebhookEvents(payload)
  }

  private client(credentials: Credentials): SignRequestClient {
    return new SignRequestClient(credentials)
  }

  /** The caller's page size: its limit, or DEFAULT_PAGE_SIZE when it names none usable. */
  private pageSize(params: QueryParams): number {
    const limit = params.limit
    return typeof limit === 'number' && Number.isFinite(limit) && limit >= 1
      ? Math.floor(limit)
      : DEFAULT_PAGE_SIZE
  }

  /**
   * One caller page of a DRF-paginated collection. SignRequest pages by
   * `page` ("A page number within the paginated result set") and `limit`
   * ("Number of results to return per page"), and answers
   * `{ count, next, previous, results }` with `next` null on the last page —
   * so one upstream page IS one caller page, and `next` is the end signal.
   */
  private async fetchPage<T>(
    credentials: Credentials,
    path: string,
    filters: Record<string, unknown>,
    params: QueryParams,
  ): Promise<T[]> {
    const res = await this.client(credentials).get<SignRequestList<T>>(path, {
      ...filters,
      page: params.page ?? 1,
      limit: this.pageSize(params),
    })
    const count = res.count
    reportUpstreamPage(params, {
      hasMore: Boolean(res.next),
      ...(typeof count === 'number' && Number.isInteger(count) && count >= 0
        ? { totalCount: count }
        : {}),
    })
    return res.results ?? []
  }

  private statusFilter(params: QueryParams): Record<string, unknown> {
    return params['status'] ? { status: String(params['status']) } : {}
  }

  // ── Envelopes (documents) ──────────────────────────────────────────────────

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const docs = await this.fetchPage<RawSignRequestDocument>(
      credentials,
      '/documents/',
      this.statusFilter(params),
      params,
    )
    return docs.map(transformEnvelope)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const raw = await this.client(credentials).get<RawSignRequestDocument>(`/documents/${id}/`)
    return transformEnvelope(raw)
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Envelope> {
    const doc = await this.client(credentials).get<RawSignRequestDocument>(`/documents/${id}/`)
    const signrequestUuid = doc.signrequest?.uuid
    if (!signrequestUuid) {
      throw new Error(`Document ${id} has no active signrequest to cancel`)
    }
    await this.client(credentials).post(`/signrequests/${signrequestUuid}/cancel_signrequest/`, {})
    return this.getEnvelope(credentials, id)
  }

  // ── Signers (inline on document.signrequest.signers) ───────────────────────

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    // Signers are inline on GET /documents/{uuid}/, which takes no paging
    // parameter: every signer arrives at once, so page them here.
    const doc = await this.client(credentials).get<RawSignRequestDocument>(
      `/documents/${envelopeId}/`,
    )
    const signers = doc.signrequest?.signers ?? []
    return pageLocally(
      signers.map((s) => transformSigner(s, envelopeId)),
      params,
    )
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    const [envelopeId, signerKey] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId || !signerKey) {
      throw new Error('getSigner expects an id of shape "<documentUuid>:<signerUuidOrEmail>"')
    }
    const all = await this.listSigners(credentials, envelopeId, {})
    const found = all.find((s) => s.externalId === signerKey || s.id === id || s.email === signerKey)
    if (!found) throw new Error(`Signer ${signerKey} not found on document ${envelopeId}`)
    return found
  }

  // ── Documents (single file per document — content REFUSED) ─────────────────

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    // One document IS one file, read whole from GET /documents/{uuid}/.
    const doc = await this.client(credentials).get<RawSignRequestDocument>(
      `/documents/${envelopeId}/`,
    )
    return pageLocally([transformDocument(doc)], params)
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    // A SignRequest document IS the file, so the document id equals the
    // envelope/document uuid (the optional "<uuid>:<uuid>" shape is tolerated).
    const uuid = id.includes(':') ? (id.split(':')[0] ?? id) : id
    const doc = await this.client(credentials).get<RawSignRequestDocument>(`/documents/${uuid}/`)
    return transformDocument(doc)
  }

  // ── Audit-trail entries (events) ───────────────────────────────────────────

  async listAuditTrailEntries(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    const events = await this.fetchPage<RawSignRequestEvent>(
      credentials,
      '/events/',
      { document__uuid: envelopeId },
      params,
    )
    // The fallback id of an event with no uuid is its position in the whole
    // trail, so offset the index by the rows on earlier pages.
    const first = pageOffset(params, this.pageSize(params))
    return events.map((raw, i) => transformAuditTrailEntry(raw, envelopeId, first + i))
  }

  async getAuditTrailEntry(credentials: Credentials, id: string): Promise<AuditTrailEntry> {
    const raw = await this.client(credentials).get<RawSignRequestEvent>(`/events/${id}/`)
    const envelopeId =
      raw.document && typeof raw.document === 'object' && 'uuid' in raw.document
        ? String(raw.document.uuid ?? '')
        : ''
    return transformAuditTrailEntry(raw, envelopeId, 0)
  }

  // ── Templates ──────────────────────────────────────────────────────────────

  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    const templates = await this.fetchPage<RawSignRequestTemplate>(
      credentials,
      '/templates/',
      this.statusFilter(params),
      params,
    )
    return templates.map(transformTemplate)
  }

  async getTemplate(credentials: Credentials, id: string): Promise<Template> {
    const raw = await this.client(credentials).get<RawSignRequestTemplate>(`/templates/${id}/`)
    return transformTemplate(raw)
  }
}
