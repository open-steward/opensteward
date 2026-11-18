/**
 * BreezeDoc adapter — maps the BreezeDoc REST API to the canonical docsign
 * schema.
 *
 * BreezeDoc models a signing flow as a `document` with nested `recipients`
 * and `document_files`. The adapter maps:
 *   - documents          → canonical Envelope
 *   - recipients         → canonical Signer
 *   - document_files     → canonical Document (metadata only, no content)
 *   - templates          → canonical Template
 *   - recipient timeline → synthesised AuditTrailEntry rows
 *
 * Auth is a Personal Access Token (api_key) entered via the Connect Link
 * form. BreezeDoc documents no webhook channel, no void/cancel endpoint,
 * and no standalone signer/file endpoints, so those resources are derived
 * from the parent document or left off (the router returns 501).
 */

import { pageLocally, simpleApiKey } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { AuditTrailEntry } from '../../schema/audit-trail-entry'
import type { Template } from '../../schema/template'

import {
  buildAuthUrl,
  exchangeCode as breezedocExchange,
  refreshCredentials as breezedocRefresh,
} from './auth'
import { BreezedocClient } from './client'
import { DEFAULT_PAGE } from './constants'

import { transformEnvelope, type RawBreezedocDocument } from './transform/envelope'
import { transformSigner, type RawBreezedocRecipient } from './transform/signer'
import { transformDocument } from './transform/document'
import {
  transformAuditTrailEntry,
  type SyntheticBreezedocAuditEvent,
} from './transform/audit-trail-entry'
import { transformTemplate, type RawBreezedocTemplate } from './transform/template'

export interface BreezedocAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

/** Laravel-style paginator wrapper used by all list endpoints. */
interface Paginated<T> {
  current_page?: number
  data?: T[]
  last_page?: number
  next_page_url?: string | null
  per_page?: number
  total?: number
}

const SIMPLE_API_KEY_FORM = simpleApiKey({
  label: 'Personal Access Token',
  placeholder: 'breezedoc personal access token',
  helpText: 'Create a Personal Access Token at https://breezedoc.com/integrations/api.',
})

export class BreezedocAdapter implements DocsignAdapter {
  readonly platform = 'breezedoc'
  readonly version = '0.1.0'

  // Connect Link support — single Personal-Access-Token form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: BreezedocAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? []
  }

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    return buildAuthUrl()
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return breezedocExchange(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return breezedocRefresh(credentials)
  }

  private client(credentials: Credentials): BreezedocClient {
    return new BreezedocClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = { page: params.page ?? DEFAULT_PAGE }
    if (params['order_by']) out.order_by = String(params['order_by'])
    if (params['direction']) out.direction = String(params['direction'])
    return out
  }

  // ── Envelopes (BreezeDoc documents) ─────────────────────────────────────────

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const res = await this.client(credentials).get<Paginated<RawBreezedocDocument>>(
      '/documents',
      this.listParams(params),
    )
    return (res.data ?? []).map(transformEnvelope)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const raw = await this.client(credentials).get<RawBreezedocDocument>(`/documents/${id}`)
    return transformEnvelope(raw)
  }

  // ── Signers (recipients on a document) ──────────────────────────────────────

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    const res = await this.client(credentials).get<Paginated<RawBreezedocRecipient>>(
      `/documents/${envelopeId}/recipients`,
      this.listParams(params),
    )
    return (res.data ?? []).map((raw) => transformSigner(raw, envelopeId))
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    const [envelopeId, recipientId] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId || !recipientId) {
      throw new Error('getSigner expects an id of shape "<documentId>:<recipientId>"')
    }
    const all = await this.listSigners(credentials, envelopeId, {})
    const found = all.find((s) => s.externalId === recipientId)
    if (!found) throw new Error(`Recipient ${recipientId} not found on document ${envelopeId}`)
    return found
  }

  // ── Documents (file metadata, no content) ───────────────────────────────────

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    // GET /documents/{document} takes only the path id and carries the whole
    // document_files array, so the caller's page is cut from it here.
    const raw = await this.client(credentials).get<RawBreezedocDocument>(`/documents/${envelopeId}`)
    const all = (raw.document_files ?? []).map((file, i) =>
      transformDocument(file, envelopeId, i, raw.title),
    )
    return pageLocally(all, params)
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const [envelopeId, fileId] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId || !fileId) {
      throw new Error('getDocument expects an id of shape "<documentId>:<fileId>"')
    }
    const all = await this.listDocuments(credentials, envelopeId, {})
    const found = all.find((d) => d.externalId === fileId)
    if (!found) throw new Error(`File ${fileId} not found on document ${envelopeId}`)
    return found
  }

  // ── Audit-trail entries — synthesised from recipient timestamps ─────────────

  async listAuditTrailEntries(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    const raw = await this.client(credentials).get<RawBreezedocDocument>(`/documents/${envelopeId}`)
    const events: SyntheticBreezedocAuditEvent[] = []
    if (raw.created_at) {
      events.push({
        envelopeId,
        occurredIso: raw.created_at,
        type: 'created',
        description: 'Document created',
      })
    }
    for (const r of raw.recipients ?? []) {
      const signerExternalId = String(r.id)
      if (r.sent_at) {
        events.push({
          envelopeId,
          occurredIso: r.sent_at,
          type: 'sent',
          signerExternalId,
          signerEmail: r.email,
          signerName: r.name,
          description: 'Document sent to recipient',
        })
      }
      if (r.opened_at) {
        events.push({
          envelopeId,
          occurredIso: r.opened_at,
          type: 'viewed',
          signerExternalId,
          signerEmail: r.email,
          signerName: r.name,
          description: 'Recipient opened the document',
        })
      }
      if (r.completed_at) {
        events.push({
          envelopeId,
          occurredIso: r.completed_at,
          type: 'signed',
          signerExternalId,
          signerEmail: r.email,
          signerName: r.name,
          description: 'Recipient completed signing',
        })
      }
    }
    const signers = (raw.recipients ?? []).filter((r) => !r.owner)
    if (signers.length > 0 && signers.every((r) => r.completed_at)) {
      const last = signers
        .map((r) => r.completed_at)
        .filter((t): t is string => typeof t === 'string')
        .sort()
        .at(-1)
      if (last) {
        events.push({
          envelopeId,
          occurredIso: last,
          type: 'completed',
          description: 'Document completed',
        })
      }
    }
    events.sort((a, b) => a.occurredIso.localeCompare(b.occurredIso))
    // Ids are indexes into the whole sorted timeline, so the caller's page is
    // cut only after every event has its id.
    return pageLocally(
      events.map((e, i) => transformAuditTrailEntry(e, i)),
      params,
    )
  }

  async getAuditTrailEntry(credentials: Credentials, id: string): Promise<AuditTrailEntry> {
    const [envelopeId, indexStr] = id.split(':')
    if (!envelopeId || !indexStr) {
      throw new Error('getAuditTrailEntry expects an id of shape "<documentId>:<index>"')
    }
    const all = await this.listAuditTrailEntries(credentials, envelopeId, {})
    const found = all[Number(indexStr)]
    if (!found) throw new Error(`Audit entry ${id} not found`)
    return found
  }

  // ── Templates ───────────────────────────────────────────────────────────────

  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    const res = await this.client(credentials).get<Paginated<RawBreezedocTemplate>>(
      '/templates',
      this.listParams(params),
    )
    return (res.data ?? []).map(transformTemplate)
  }

  async getTemplate(credentials: Credentials, id: string): Promise<Template> {
    const raw = await this.client(credentials).get<RawBreezedocTemplate>(`/templates/${id}`)
    return transformTemplate(raw)
  }
}
