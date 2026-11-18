/**
 * SignNow adapter.
 *
 * Maps SignNow `documents` → canonical `Envelope`, field_invites → `Signer`,
 * the same document record → `Document`, history → `AuditTrailEntry`,
 * template-flagged document records → `Template`.
 */

import { pageLocally } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { AuditTrailEntry } from '../../schema/audit-trail-entry'
import type { Template } from '../../schema/template'
import type { WebhookEvent } from '../../schema/webhook'

import {
  buildAuthUrl,
  exchangeCode as signnowExchange,
  refreshCredentials as signnowRefresh,
} from './auth'
import { SignNowClient } from './client'
import { DEFAULT_PAGE_SIZE, DEFAULT_SCOPES } from './constants'
import { verifySignNowWebhook, parseSignNowWebhookEvents } from './webhook'

import { transformEnvelope, type RawSignNowDocument } from './transform/envelope'
import { transformSigner, type RawSignNowFieldInvite } from './transform/signer'
import { transformDocument } from './transform/document'
import {
  transformAuditTrailEntry,
  type RawSignNowHistoryEntry,
} from './transform/audit-trail-entry'
import { transformTemplate } from './transform/template'

export interface SignNowAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

interface UserDocumentsResponse {
  documents?: RawSignNowDocument[]
}

/**
 * GET /document/{document_id}/historyfull 200 body. The docs show two shapes:
 * `{ document_history: [...], email_history_events: [...] }` ("Example 1")
 * a bare array of history rows (the `signer_authentication_*` examples), and a
 * lone history row ("Example: without email history events").
 * https://docs.signnow.com/docs/document/operations/get-document-historyfull
 */
type DocumentHistoryResponse =
  | RawSignNowHistoryEntry[]
  | RawSignNowHistoryEntry
  | { document_history?: RawSignNowHistoryEntry[]; email_history_events?: unknown[] }

export class SignNowAdapter implements DocsignAdapter {
  readonly platform = 'signnow'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: SignNowAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return signnowExchange(code, redirectUri, this.clientId, this.clientSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return signnowRefresh(credentials, this.clientId, this.clientSecret)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifySignNowWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseSignNowWebhookEvents(payload)
  }

  private client(credentials: Credentials): SignNowClient {
    return new SignNowClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      per_page: params.limit ?? DEFAULT_PAGE_SIZE,
      page: params.page ?? 1,
    }
  }

  // ── Envelopes (documents) ────────────────────────────────────────────────

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const res = await this.client(credentials).get<UserDocumentsResponse>(
      '/user/documentsv2',
      this.listParams(params),
    )
    return (res.documents ?? [])
      .filter((d) => !d.is_template && !d.template)
      .map(transformEnvelope)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const raw = await this.client(credentials).get<RawSignNowDocument>(`/document/${id}`)
    return transformEnvelope(raw)
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Envelope> {
    // SignNow cancels the invitation (effective void) via POST /document/{id}/fieldinvitecancel
    await this.client(credentials).post(`/document/${id}/fieldinvitecancel`)
    return this.getEnvelope(credentials, id)
  }

  // ── Signers (field_invites) ───────────────────────────────────────────────

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    // GET /document/{document_id} has no paging parameter and returns the
    // whole field_invites[] array inline, so the caller's page is cut here.
    const raw = await this.client(credentials).get<RawSignNowDocument>(`/document/${envelopeId}`)
    return pageLocally(
      (raw.field_invites ?? []).map((i) =>
        transformSigner(i as RawSignNowFieldInvite, envelopeId),
      ),
      params,
    )
  }

  async getSigner(_credentials: Credentials, id: string): Promise<Signer> {
    throw new Error(
      `SignNow does not expose a signer-by-id endpoint. Use listSigners(envelopeId). id=${id}`,
    )
  }

  // ── Documents ────────────────────────────────────────────────────────────

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    // The envelope is one document: the whole collection is this one row.
    const raw = await this.client(credentials).get<RawSignNowDocument>(`/document/${envelopeId}`)
    return pageLocally([transformDocument(raw)], params)
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const raw = await this.client(credentials).get<RawSignNowDocument>(`/document/${id}`)
    return transformDocument(raw)
  }

  // ── Audit-trail entries ──────────────────────────────────────────────────

  /**
   * GET /document/{document_id}/historyfull takes only the path id: the docs
   * list no query parameter, so the whole history comes back and the
   * caller's page is cut locally. `email_history_events` rows carry no
   * id and are not audit entries of the document; they stay out.
   */
  async listAuditTrailEntries(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    return pageLocally(await this.fetchHistory(credentials, envelopeId), params)
  }

  /**
   * SignNow has no endpoint for one history row. The id is
   * `<envelopeId>:<unique_id>`, so the row is found in its document's history.
   */
  async getAuditTrailEntry(
    credentials: Credentials,
    id: string,
  ): Promise<AuditTrailEntry> {
    const sep = id.indexOf(':')
    const envelopeId = sep > 0 ? id.slice(0, sep) : ''
    const uniqueId = sep > 0 ? id.slice(sep + 1) : ''
    if (!envelopeId || !uniqueId) {
      throw Object.assign(
        new Error('SignNow audit-trail id expects shape "<envelopeId>:<unique_id>"'),
        { statusCode: 400, code: 'INVALID_ID' },
      )
    }
    const found = (await this.fetchHistory(credentials, envelopeId)).find(
      (e) => e.externalId === uniqueId,
    )
    if (!found) {
      throw Object.assign(new Error(`SignNow audit entry ${id} not found`), {
        statusCode: 404,
        code: 'NOT_FOUND',
      })
    }
    return found
  }

  private async fetchHistory(
    credentials: Credentials,
    envelopeId: string,
  ): Promise<AuditTrailEntry[]> {
    const res = await this.client(credentials).get<DocumentHistoryResponse>(
      `/document/${envelopeId}/historyfull`,
    )
    if (Array.isArray(res)) return res.map((raw) => transformAuditTrailEntry(raw, envelopeId))
    if (res === null || typeof res !== 'object') {
      throw new Error('SignNow historyfull returned neither an object nor an array')
    }
    if ('document_history' in res && Array.isArray(res.document_history)) {
      return res.document_history.map((raw) => transformAuditTrailEntry(raw, envelopeId))
    }
    // "Example: without email history events" is one history row, unwrapped.
    if ('unique_id' in res) return [transformAuditTrailEntry(res, envelopeId)]
    throw new Error(
      'SignNow historyfull returned an object with neither document_history nor a history row',
    )
  }

  // ── Templates ────────────────────────────────────────────────────────────

  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    const res = await this.client(credentials).get<UserDocumentsResponse>(
      '/user/documentsv2',
      { ...this.listParams(params), is_template: true },
    )
    return (res.documents ?? [])
      .filter((d) => d.is_template || d.template)
      .map(transformTemplate)
  }

  async getTemplate(credentials: Credentials, id: string): Promise<Template> {
    const raw = await this.client(credentials).get<RawSignNowDocument>(`/document/${id}`)
    return transformTemplate(raw)
  }
}
