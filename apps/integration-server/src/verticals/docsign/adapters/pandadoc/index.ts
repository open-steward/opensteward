/**
 * PandaDoc adapter.
 *
 * PandaDoc treats a document AS the envelope; there is no separate
 * envelopes resource. Recipients are signers. Templates are first-class.
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

import {
  buildAuthUrl,
  exchangeCode as pandadocExchange,
  refreshCredentials as pandadocRefresh,
} from './auth'
import { PandaDocClient } from './client'
import {
  API_V2_BASE_URL,
  AUDIT_TRAIL_MAX_LIMIT,
  DEFAULT_PAGE_SIZE,
  DEFAULT_SCOPES,
} from './constants'
import { verifyPandaDocWebhook, parsePandaDocWebhookEvents } from './webhook'

import { transformEnvelope, type RawPandaDocDocument } from './transform/envelope'
import { transformSigner, type RawPandaDocRecipient } from './transform/signer'
import { transformDocument } from './transform/document'
import {
  transformAuditTrailEntry,
  type RawPandaDocAuditTrailEntry,
} from './transform/audit-trail-entry'
import { transformTemplate, type RawPandaDocTemplate } from './transform/template'

export interface PandaDocAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

interface DocumentsListResponse {
  results?: RawPandaDocDocument[]
}

interface TemplatesListResponse {
  results?: RawPandaDocTemplate[]
}

/** `DocumentAuditTrailResponse`: `count` is the total across all pages. */
interface AuditTrailResponse {
  count?: number
  results?: RawPandaDocAuditTrailEntry[]
}

export class PandaDocAdapter implements DocsignAdapter {
  readonly platform = 'pandadoc'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: PandaDocAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return pandadocExchange(code, redirectUri, this.clientId, this.clientSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return pandadocRefresh(credentials, this.clientId, this.clientSecret)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyPandaDocWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parsePandaDocWebhookEvents(payload)
  }

  private client(credentials: Credentials): PandaDocClient {
    return new PandaDocClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      page: params.page ?? 1,
      count: params.limit ?? DEFAULT_PAGE_SIZE,
      ...(params['status'] ? { status: String(params['status']) } : {}),
    }
  }

  // ── Envelopes (documents) ────────────────────────────────────────────────

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const res = await this.client(credentials).get<DocumentsListResponse>(
      '/documents',
      this.listParams(params),
    )
    return (res.results ?? []).map(transformEnvelope)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const raw = await this.client(credentials).get<RawPandaDocDocument>(
      `/documents/${id}/details`,
    )
    return transformEnvelope(raw)
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Envelope> {
    await this.client(credentials).post(`/documents/${id}/cancel`, {
      reason: data?.reason ?? 'Voided by API',
    })
    return this.getEnvelope(credentials, id)
  }

  // ── Signers (recipients) ─────────────────────────────────────────────────

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    // GET /documents/{id}/details takes only the path id and embeds every
    // recipient, so the array is the whole collection and is paged locally.
    const raw = await this.client(credentials).get<RawPandaDocDocument>(
      `/documents/${envelopeId}/details`,
    )
    return pageLocally(
      (raw.recipients ?? []).map((r) => transformSigner(r as RawPandaDocRecipient, envelopeId)),
      params,
    )
  }

  async getSigner(_credentials: Credentials, id: string): Promise<Signer> {
    throw new Error(
      `PandaDoc does not expose a signer-by-id endpoint. Use listSigners(envelopeId). id=${id}`,
    )
  }

  // ── Documents — PandaDoc has one document per envelope ───────────────────

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    // The document is its one document; paged locally so page 2 is empty.
    const raw = await this.client(credentials).get<RawPandaDocDocument>(
      `/documents/${envelopeId}/details`,
    )
    return pageLocally([transformDocument(raw)], params)
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const raw = await this.client(credentials).get<RawPandaDocDocument>(
      `/documents/${id}/details`,
    )
    return transformDocument(raw)
  }

  // ── Audit-trail entries (document log) ───────────────────────────────────

  /**
   * `GET /public/v2/documents/{document_id}/audit-trail`, paged by `limit`
   * (1..100) and `offset`; `count` is the total across all pages.
   * https://developers.pandadoc.com/reference/list-document-audit-trail
   */
  private auditTrailPage(
    credentials: Credentials,
    envelopeId: string,
    limit: number,
    offset: number,
  ): Promise<AuditTrailResponse> {
    return this.client(credentials).get<AuditTrailResponse>(
      `${API_V2_BASE_URL}/documents/${encodeURIComponent(envelopeId)}/audit-trail`,
      { limit, offset },
    )
  }

  async listAuditTrailEntries(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, AUDIT_TRAIL_MAX_LIMIT)
    const offset = pageOffset(params, limit)
    reportUpstreamPage(params, { pageSize: limit })
    const res = await this.auditTrailPage(credentials, envelopeId, limit, offset)
    const rows = res.results ?? []
    if (typeof res.count === 'number') {
      reportUpstreamPage(params, {
        totalCount: res.count,
        hasMore: offset + rows.length < res.count,
      })
    }
    return rows.map((raw) => transformAuditTrailEntry(raw, envelopeId))
  }

  /**
   * PandaDoc has no endpoint for one audit-trail entry, so the trail of the
   * document named in the id (`<envelopeId>:<entry id>`) is walked page by page.
   */
  async getAuditTrailEntry(credentials: Credentials, id: string): Promise<AuditTrailEntry> {
    const sep = id.indexOf(':')
    const envelopeId = sep > 0 ? id.slice(0, sep) : ''
    const entryId = sep > 0 ? id.slice(sep + 1) : ''
    if (!envelopeId || !entryId) {
      throw new Error('PandaDoc audit-trail id expects shape "<envelopeId>:<entry id>"')
    }
    const seen = new Set<string>()
    for (let offset = 0; ; offset += AUDIT_TRAIL_MAX_LIMIT) {
      const res = await this.auditTrailPage(credentials, envelopeId, AUDIT_TRAIL_MAX_LIMIT, offset)
      const rows = res.results ?? []
      const raw = rows.find((r) => r.id === entryId)
      if (raw) return transformAuditTrailEntry(raw, envelopeId)
      // A page that adds no entry not already seen means the upstream ignored
      // `offset`; stop rather than walk forever.
      const before = seen.size
      for (const r of rows) if (typeof r.id === 'string') seen.add(r.id)
      const end =
        rows.length < AUDIT_TRAIL_MAX_LIMIT ||
        (typeof res.count === 'number' && offset + rows.length >= res.count) ||
        seen.size === before
      if (end) break
    }
    throw Object.assign(new Error(`Audit entry ${id} not found`), { statusCode: 404 })
  }

  // ── Templates ────────────────────────────────────────────────────────────

  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    const res = await this.client(credentials).get<TemplatesListResponse>(
      '/templates',
      this.listParams(params),
    )
    return (res.results ?? []).map(transformTemplate)
  }

  async getTemplate(credentials: Credentials, id: string): Promise<Template> {
    const raw = await this.client(credentials).get<RawPandaDocTemplate>(
      `/templates/${id}/details`,
    )
    return transformTemplate(raw)
  }
}
