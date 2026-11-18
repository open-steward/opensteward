/**
 * Documenso adapter — the open-source DocuSign alternative.
 *
 * Targets the stable Documenso v1 public API. Maps Documenso documents →
 * canonical `Envelope` (with embedded recipients → `Signer`), a synthesised
 * signing timeline → `AuditTrailEntry`, and templates → `Template`.
 *
 * Auth is a single long-lived API token (Connect Link flow via `simpleApiKey`);
 * Documenso has no OAuth and no per-call refresh.
 *
 * Resources Documenso v1 does NOT expose — `voidEnvelope` (no document-cancel
 * endpoint) and the file-metadata `Document` surface (a document IS the
 * envelope; there is no separate file manifest) — are intentionally omitted and
 * auto-resolve to 501 Not Implemented.
 */

import { pageLocally, simpleApiKey } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { AuditTrailEntry } from '../../schema/audit-trail-entry'
import type { Template } from '../../schema/template'
import type { WebhookEvent } from '../../schema/webhook'
import type { Document } from '../../schema/document'

import {
  buildAuthUrl,
  exchangeCode as documensoExchange,
  refreshCredentials as documensoRefresh,
} from './auth'
import { DocumensoClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { verifyDocumensoWebhook, parseDocumensoWebhookEvents } from './webhook'

import { transformEnvelope, type RawDocumensoDocument } from './transform/envelope'
import { transformSigner, type RawDocumensoRecipient } from './transform/signer'
import {
  transformAuditTrailEntry,
  type SyntheticAuditEvent,
} from './transform/audit-trail-entry'
import { transformTemplate, type RawDocumensoTemplate } from './transform/template'
import { transformDocument } from './transform/document'
import { idStr, toIso } from './transform/shared'

const SIMPLE_API_KEY_FORM = simpleApiKey({
  label: 'API token',
  placeholder: 'api_xxxxxxxxxxxxxxxxxxxxxxxx',
  helpText: 'Create a token under Settings → API Tokens in your Documenso dashboard.',
})

interface DocumentsListResponse {
  documents?: RawDocumensoDocument[]
  totalPages?: number
}

interface TemplatesListResponse {
  templates?: RawDocumensoTemplate[]
  totalPages?: number
}

export class DocumensoAdapter implements DocsignAdapter {
  readonly platform = 'documenso'
  readonly version = '0.1.0'

  // Connect Link support — single API-token form (Documenso has no OAuth).
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  getAuthUrl(state: string): string {
    return buildAuthUrl('', '', [], state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return documensoExchange(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return documensoRefresh(credentials)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyDocumensoWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseDocumensoWebhookEvents(payload)
  }

  private client(credentials: Credentials): DocumensoClient {
    return new DocumensoClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      page: params.page ?? 1,
      perPage: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    }
  }

  // ── Envelopes (Documenso documents) ─────────────────────────────────────────

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const res = await this.client(credentials).get<DocumentsListResponse>(
      '/documents',
      this.listParams(params),
    )
    return (res.documents ?? []).map(transformEnvelope)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const raw = await this.client(credentials).get<RawDocumensoDocument>(`/documents/${id}`)
    return transformEnvelope(raw)
  }

  // ── Signers (recipients embedded in the document) ───────────────────────────

  /**
   * GET /documents/{id} takes no query params and embeds every recipient, so
   * the whole collection arrives in one call and is sliced locally.
   */
  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    return pageLocally(await this.allSigners(credentials, envelopeId), params)
  }

  private async allSigners(credentials: Credentials, envelopeId: string): Promise<Signer[]> {
    const raw = await this.client(credentials).get<RawDocumensoDocument>(
      `/documents/${envelopeId}`,
    )
    return (raw.recipients ?? []).map((r) => transformSigner(r, envelopeId))
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    // Documenso has no v1 recipient-by-id endpoint; address via "<docId>:<recipientId>".
    const [envelopeId, recipientId] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId || !recipientId) {
      throw new Error('getSigner expects an id of shape "<documentId>:<recipientId>"')
    }
    const all = await this.allSigners(credentials, envelopeId)
    const found = all.find((s) => s.externalId === recipientId)
    if (!found) throw new Error(`Recipient ${recipientId} not found on document ${envelopeId}`)
    return found
  }

  // ── Audit-trail entries — synthesised from document + recipient timestamps ──

  async listAuditTrailEntries(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    return pageLocally(await this.allAuditTrailEntries(credentials, envelopeId), params)
  }

  /** Synthesised from one GET /documents/{id} (no query params): the whole trail. */
  private async allAuditTrailEntries(
    credentials: Credentials,
    envelopeId: string,
  ): Promise<AuditTrailEntry[]> {
    const raw = await this.client(credentials).get<RawDocumensoDocument>(
      `/documents/${envelopeId}`,
    )
    const events: SyntheticAuditEvent[] = []
    const createdAt = toIso(raw.createdAt)
    if (createdAt) {
      events.push({
        envelopeId,
        occurredAt: createdAt,
        type: 'created',
        description: 'Document created',
      })
    }
    for (const r of raw.recipients ?? []) {
      const rec = r as RawDocumensoRecipient
      const signedAt = toIso(rec.signedAt)
      if (!signedAt) continue
      const rejected = (rec.signingStatus ?? '').toUpperCase() === 'REJECTED'
      events.push({
        envelopeId,
        occurredAt: signedAt,
        type: rejected ? 'declined' : 'signed',
        description: rejected ? 'Recipient rejected the document' : 'Recipient signed',
        actorId: idStr(rec.id),
        actorEmail: rec.email,
        actorName: rec.name,
      })
    }
    const completedAt = toIso(raw.completedAt)
    if (completedAt) {
      events.push({
        envelopeId,
        occurredAt: completedAt,
        type: 'completed',
        description: 'Document completed',
      })
    }
    events.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
    return events.map((e, i) => transformAuditTrailEntry(e, i))
  }

  async getAuditTrailEntry(credentials: Credentials, id: string): Promise<AuditTrailEntry> {
    const [envelopeId, indexStr] = id.split(':')
    if (!envelopeId || indexStr === undefined) {
      throw new Error('getAuditTrailEntry expects an id of shape "<documentId>:<index>"')
    }
    const all = await this.allAuditTrailEntries(credentials, envelopeId)
    const found = all[Number(indexStr)]
    if (!found) throw new Error(`Audit entry ${id} not found`)
    return found
  }

  // ── Templates ───────────────────────────────────────────────────────────────

  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    const res = await this.client(credentials).get<TemplatesListResponse>(
      '/templates',
      this.listParams(params),
    )
    return (res.templates ?? []).map(transformTemplate)
  }

  async getTemplate(credentials: Credentials, id: string): Promise<Template> {
    const raw = await this.client(credentials).get<RawDocumensoTemplate>(`/templates/${id}`)
    return transformTemplate(raw)
  }

  // ── Documents ───────────────────────────────────────────────────────────────

  /**
   * In Documenso a document IS the envelope. `listDocuments` fetches the
   * specific envelope by envelopeId and returns it as one Document entry.
   * When envelopeId is absent, falls back to listing all documents.
   */
  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    if (envelopeId) {
      const raw = await this.client(credentials).get<RawDocumensoDocument>(
        `/documents/${envelopeId}`,
      )
      // GET /documents/{id} takes no query params: the collection is this one row.
      return pageLocally([transformDocument(raw, 0)], params)
    }
    const res = await this.client(credentials).get<DocumentsListResponse>(
      '/documents',
      this.listParams(params),
    )
    return (res.documents ?? []).map((doc, i) => transformDocument(doc, i))
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const raw = await this.client(credentials).get<RawDocumensoDocument>(`/documents/${id}`)
    return transformDocument(raw, 0)
  }
}
