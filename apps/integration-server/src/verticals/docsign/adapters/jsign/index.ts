/**
 * jSign adapter.
 *
 * Maps jSign (api.jsign.com, by Consensus Cloud Solutions / Cygnature) envelopes
 * → canonical `Envelope`, recipients → `Signer`, documents → `Document`
 * (metadata only — content REFUSED), history events → `AuditTrailEntry`,
 * and templates → `Template`.
 *
 * Auth is Bearer-token (JWT): the adapter collects email + password via
 * Connect Link and exchanges them for a token via
 * POST /api/v2/Authorization/token. There is no OAuth Authorization-Code
 * Grant; `getAuthUrl` / `exchangeCode` throw.
 *
 * Endpoints used:
 *   POST /api/v2/envelopes/list             — list envelopes
 *   GET  /api/v2/envelopes/{id}/details     — get single envelope
 *   POST /api/v2/envelopes/{id}/cancel      — void/cancel envelope
 *   GET  /api/v2/envelopes/{id}/history     — audit trail
 *   GET  /api/v2/templates/list             — list templates
 *   GET  /api/v2/templates/{id}/details     — get single template
 *
 * Swagger: https://api.jsign.com/swagger/v2/swagger.json
 */

import { pageLocally, type Credentials, type QueryParams, type CredentialField } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { AuditTrailEntry } from '../../schema/audit-trail-entry'
import type { Template } from '../../schema/template'
import type { WebhookEvent } from '../../schema/webhook'

import {
  credentialFields as jsignCredentialFields,
  exchangeCredentials as jsignExchangeCredentials,
  refreshCredentials as jsignRefreshCredentials,
} from './auth'
import { JsignClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import { verifyJsignWebhook, parseJsignWebhookEvents } from './webhook'

import {
  transformEnvelope,
  type RawJsignEnvelope,
} from './transform/envelope'
import { transformSigner, type RawJsignSigner } from './transform/signer'
import { transformDocument, type RawJsignDocument } from './transform/document'
import {
  transformAuditTrailEntry,
  type RawJsignHistoryEvent,
} from './transform/audit-trail-entry'
import { transformTemplate, type RawJsignTemplate } from './transform/template'

export interface JsignAdapterConfig {
  clientId?: string
  clientSecret?: string
  redirectUri?: string
  scopes?: string[]
}

/** POST /api/v2/envelopes/list response shape. */
interface ListEnvelopesResponse {
  envelopes?: RawJsignEnvelope[]
  data?: RawJsignEnvelope[]
  total?: number
  page?: number
  page_size?: number
}

/** GET /api/v2/envelopes/{id}/history response shape. */
interface HistoryResponse {
  history?: RawJsignHistoryEvent[]
  data?: RawJsignHistoryEvent[]
  events?: RawJsignHistoryEvent[]
}

/** GET /api/v2/templates/list response shape. */
interface ListTemplatesResponse {
  templates?: RawJsignTemplate[]
  data?: RawJsignTemplate[]
  total?: number
}

export class JsignAdapter implements DocsignAdapter {
  readonly platform = 'jsign'
  readonly version = '0.1.0'

  constructor(_config?: JsignAdapterConfig) {
    // No OAuth config needed — credentials are collected via the form.
  }

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    throw new Error('jsign uses email+password auth; use credentialFields() instead')
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('jsign uses email+password auth; use exchangeCredentials() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return jsignRefreshCredentials(credentials)
  }

  credentialFields(): CredentialField[] {
    return jsignCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return jsignExchangeCredentials(fields)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyJsignWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseJsignWebhookEvents(payload)
  }

  private client(credentials: Credentials): JsignClient {
    return new JsignClient(credentials)
  }

  // ── Envelopes ─────────────────────────────────────────────────────────────

  /**
   * The 1-based page to ask for. The swagger spec
   * (https://api.jsign.com/swagger/v2/swagger.json) gives both list endpoints
   * `page` and `page_size` and documents no next-page signal or maximum, so
   * the adapter sends the caller's page and limit and reports nothing: the
   * router and sync worker judge the end from a short page. A legacy
   * `cursor` holding a page number is still honoured when no page is given.
   */
  private static pageNumber(params: QueryParams): number {
    if (params.page !== undefined) return params.page >= 1 ? Math.floor(params.page) : 1
    return Number(params['cursor']) || 1
  }

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const body: Record<string, unknown> = {
      page_size: params.limit ?? DEFAULT_PAGE_SIZE,
      page: JsignAdapter.pageNumber(params),
    }
    if (params['status']) body['status'] = [String(params['status'])]
    if (params['updated_after']) body['start_date'] = String(params['updated_after'])
    else if (params.updatedAfter instanceof Date) body['start_date'] = params.updatedAfter.toISOString()

    const res = await this.client(credentials).post<ListEnvelopesResponse>(
      '/api/v2/envelopes/list',
      body,
    )
    const items = res.envelopes ?? res.data ?? []
    return items.map(transformEnvelope)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const raw = await this.client(credentials).get<RawJsignEnvelope>(
      `/api/v2/envelopes/${id}/details`,
    )
    return transformEnvelope(raw)
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Envelope> {
    await this.client(credentials).post(`/api/v2/envelopes/${id}/cancel`, {
      cancel_reason: data?.reason ?? 'Cancelled by API',
    })
    return this.getEnvelope(credentials, id)
  }

  // ── Signers ───────────────────────────────────────────────────────────────

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    const raw = await this.client(credentials).get<RawJsignEnvelope>(
      `/api/v2/envelopes/${envelopeId}/details`,
    )
    // GET /details takes no paging params: every signer comes back at once.
    const signers: RawJsignSigner[] = raw.recipients?.signers ?? []
    return pageLocally(
      signers.map((s) => transformSigner(s, envelopeId)),
      params,
    )
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    const [envelopeId, signerId] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId || !signerId) {
      throw new Error('getSigner expects an id of shape "<envelopeId>:<signerId>"')
    }
    const all = await this.listSigners(credentials, envelopeId, {})
    const found = all.find((s) => s.externalId === signerId || s.id === signerId)
    if (!found) throw new Error(`Signer ${signerId} not found on envelope ${envelopeId}`)
    return found
  }

  // ── Documents (metadata only — content REFUSED) ──────────────────────────

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    const raw = await this.client(credentials).get<RawJsignEnvelope>(
      `/api/v2/envelopes/${envelopeId}/details`,
    )
    // GET /details takes no paging params: every document comes back at once.
    const docs: RawJsignDocument[] = (raw.documents ?? []) as RawJsignDocument[]
    return pageLocally(
      docs.map((d) => transformDocument(d, envelopeId)),
      params,
    )
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const [envelopeId, documentId] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId || !documentId) {
      throw new Error('getDocument expects an id of shape "<envelopeId>:<documentId>"')
    }
    const all = await this.listDocuments(credentials, envelopeId, {})
    const found = all.find((d) => d.externalId === documentId || d.id === documentId)
    if (!found) throw new Error(`Document ${documentId} not found on envelope ${envelopeId}`)
    return found
  }

  // ── Audit-trail entries ──────────────────────────────────────────────────

  async listAuditTrailEntries(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    const res = await this.client(credentials).get<HistoryResponse>(
      `/api/v2/envelopes/${envelopeId}/history`,
    )
    // GET /history takes no paging params: the whole trail comes back at once.
    const events = res.history ?? res.data ?? res.events ?? []
    return pageLocally(
      events.map((raw, i) => transformAuditTrailEntry(raw, envelopeId, i)),
      params,
    )
  }

  async getAuditTrailEntry(credentials: Credentials, id: string): Promise<AuditTrailEntry> {
    const [envelopeId, indexStr] = id.split(':')
    if (!envelopeId || !indexStr) {
      throw new Error('getAuditTrailEntry expects an id of shape "<envelopeId>:<index>"')
    }
    const all = await this.listAuditTrailEntries(credentials, envelopeId, {})
    const found = all[Number(indexStr)]
    if (!found) throw new Error(`Audit entry ${id} not found`)
    return found
  }

  // ── Templates ────────────────────────────────────────────────────────────

  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    const res = await this.client(credentials).get<ListTemplatesResponse>(
      '/api/v2/templates/list',
      {
        page_size: params.limit ?? DEFAULT_PAGE_SIZE,
        page: JsignAdapter.pageNumber(params),
      },
    )
    const items = res.templates ?? res.data ?? []
    return items.map(transformTemplate)
  }

  async getTemplate(credentials: Credentials, id: string): Promise<Template> {
    const raw = await this.client(credentials).get<RawJsignTemplate>(
      `/api/v2/templates/${id}/details`,
    )
    return transformTemplate(raw)
  }
}
