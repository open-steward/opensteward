/**
 * GetAccept adapter.
 *
 * Maps GetAccept `documents` → canonical `Envelope`, `recipients[]` →
 * `Signer`, the document record → single `Document` (metadata only),
 * `/documents/{id}/log` → `AuditTrailEntry`, and `/templates` →
 * `Template`.
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
  exchangeCode as getacceptExchange,
  refreshCredentials as getacceptRefresh,
} from './auth'
import { GetAcceptClient } from './client'
import { DEFAULT_PAGE_SIZE, DEFAULT_SCOPES } from './constants'
import {
  verifyGetAcceptWebhook,
  parseGetAcceptWebhookEvents,
} from './webhook'

import {
  transformEnvelope,
  type RawGetAcceptDocument,
} from './transform/envelope'
import {
  transformSigner,
  type RawGetAcceptRecipient,
} from './transform/signer'
import { transformDocument } from './transform/document'
import {
  transformAuditTrailEntry,
  type RawGetAcceptLogEntry,
} from './transform/audit-trail-entry'
import {
  transformTemplate,
  type RawGetAcceptTemplate,
} from './transform/template'

export interface GetAcceptAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

interface DocumentsListResponse {
  documents?: RawGetAcceptDocument[]
  page?: number
  limit?: number
  total?: number
}

interface DocumentEnvelope {
  document?: RawGetAcceptDocument
}

interface TemplatesListResponse {
  templates?: RawGetAcceptTemplate[]
  page?: number
  limit?: number
  total?: number
}

interface TemplateEnvelope {
  template?: RawGetAcceptTemplate
}

function unwrapDocument(raw: RawGetAcceptDocument | DocumentEnvelope): RawGetAcceptDocument | undefined {
  if (raw && typeof raw === 'object' && 'document' in (raw as object)) {
    return (raw as DocumentEnvelope).document
  }
  return raw as RawGetAcceptDocument
}

export class GetAcceptAdapter implements DocsignAdapter {
  readonly platform = 'getaccept'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: GetAcceptAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return getacceptExchange(code, redirectUri, this.clientId, this.clientSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return getacceptRefresh(credentials, this.clientId, this.clientSecret)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyGetAcceptWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseGetAcceptWebhookEvents(payload)
  }

  private client(credentials: Credentials): GetAcceptClient {
    return new GetAcceptClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      page: params.page ?? 1,
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
      ...(params['status'] ? { status: String(params['status']) } : {}),
    }
  }

  // ── Envelopes (documents) ────────────────────────────────────────────────

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const res = await this.client(credentials).get<DocumentsListResponse>(
      '/documents',
      this.listParams(params),
    )
    return (res.documents ?? []).map(transformEnvelope)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const raw = await this.client(credentials).get<RawGetAcceptDocument | DocumentEnvelope>(
      `/documents/${id}`,
    )
    const doc = unwrapDocument(raw)
    if (!doc) throw new Error(`GetAccept document ${id} not found`)
    return transformEnvelope(doc)
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Envelope> {
    await this.client(credentials).post(`/documents/${id}/recall`)
    return this.getEnvelope(credentials, id)
  }

  // ── Signers (recipients) ─────────────────────────────────────────────────

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    const raw = await this.client(credentials).get<RawGetAcceptDocument | DocumentEnvelope>(
      `/documents/${envelopeId}`,
    )
    const doc = unwrapDocument(raw)
    if (!doc) throw new Error(`GetAccept document ${envelopeId} not found`)
    // GET /documents/{documentId} takes no paging parameter and returns
    // every recipient, so the caller's page is cut here.
    const rows = (doc.recipients ?? []).map((r: RawGetAcceptRecipient) =>
      transformSigner(r, envelopeId),
    )
    return pageLocally(rows, params)
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    const [envelopeId, recipientId] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId || !recipientId) {
      throw new Error('GetAccept getSigner expects id of shape "<documentId>:<recipientId>"')
    }
    const all = await this.listSigners(credentials, envelopeId, {})
    const found = all.find((s) => s.externalId === recipientId)
    if (!found) throw new Error(`GetAccept signer ${recipientId} not found on document ${envelopeId}`)
    return found
  }

  // ── Documents — one per envelope ─────────────────────────────────────────

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    const raw = await this.client(credentials).get<RawGetAcceptDocument | DocumentEnvelope>(
      `/documents/${envelopeId}`,
    )
    const doc = unwrapDocument(raw)
    if (!doc) throw new Error(`GetAccept document ${envelopeId} not found`)
    return pageLocally([transformDocument(doc, envelopeId)], params)
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const envelopeId = id.includes(':') ? (id.split(':')[0] as string) : id
    const raw = await this.client(credentials).get<RawGetAcceptDocument | DocumentEnvelope>(
      `/documents/${envelopeId}`,
    )
    const doc = unwrapDocument(raw)
    if (!doc) throw new Error(`GetAccept document ${envelopeId} not found`)
    return transformDocument(doc, envelopeId)
  }

  // ── Audit-trail entries (detailed log) ───────────────────────────────────

  /**
   * `GET /documents/{documentId}/log` — "Get a detailed log of events for a
   * specific document." It takes only the path id and returns a bare array
   * of `LogEntry`, with no paging parameter, so the caller's page is cut
   * here. (`/documents/{id}/activities`, called before, is not in the spec.)
   */
  async listAuditTrailEntries(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    const res = await this.client(credentials).get<RawGetAcceptLogEntry[]>(
      `/documents/${envelopeId}/log`,
    )
    if (!Array.isArray(res)) {
      throw new Error(`GetAccept GET /documents/${envelopeId}/log did not return an array`)
    }
    const rows = res.map((raw, i) => transformAuditTrailEntry(raw, envelopeId, i))
    return pageLocally(rows, params)
  }

  async getAuditTrailEntry(credentials: Credentials, id: string): Promise<AuditTrailEntry> {
    const [envelopeId, indexStr] = id.split(':')
    if (!envelopeId || !indexStr) {
      throw new Error('GetAccept audit-trail id expects shape "<documentId>:<index>"')
    }
    const all = await this.listAuditTrailEntries(credentials, envelopeId, {})
    const found = all[Number(indexStr)]
    if (!found) throw new Error(`GetAccept audit entry ${id} not found`)
    return found
  }

  // ── Templates ────────────────────────────────────────────────────────────

  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    const res = await this.client(credentials).get<TemplatesListResponse>(
      '/templates',
      this.listParams(params),
    )
    return (res.templates ?? []).map(transformTemplate)
  }

  async getTemplate(credentials: Credentials, id: string): Promise<Template> {
    const raw = await this.client(credentials).get<RawGetAcceptTemplate | TemplateEnvelope>(
      `/templates/${id}`,
    )
    const tpl =
      raw && typeof raw === 'object' && 'template' in (raw as object)
        ? (raw as TemplateEnvelope).template
        : (raw as RawGetAcceptTemplate)
    if (!tpl) throw new Error(`GetAccept template ${id} not found`)
    return transformTemplate(tpl)
  }
}
