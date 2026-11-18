/**
 * Clicksign adapter — Brazilian e-signature provider with ICP-Brasil
 * compatibility.
 *
 * Maps Clicksign `documents` → canonical `Envelope`, embedded `signers[]`
 * → `Signer`, the same record → `Document`, its embedded `events[]` →
 * `AuditTrailEntry`, and `/templates` → `Template`.
 *
 * Authentication: API key passed as the `access_token` query-string
 * parameter on every request. This adapter does NOT use OAuth — call
 * `credentialFields()` + `exchangeCredentials()` (Connect Link flow).
 *
 * Refused fields:
 *   - Document content / preview URLs
 *   - Signature images
 *   - ICP-Brasil digital certificate payloads
 *
 * Docs: https://developers.clicksign.com/
 */

import { pageLocally } from '@opensteward/shared'
import type { Credentials, QueryParams, CredentialField } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { AuditTrailEntry } from '../../schema/audit-trail-entry'
import type { Template } from '../../schema/template'
import type { WebhookEvent } from '../../schema/webhook'

import {
  buildAuthUrl,
  exchangeCode as csExchange,
  exchangeApiKey,
  refreshCredentials as csRefresh,
} from './auth'
import { ClicksignClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import { verifyClicksignWebhook, parseClicksignWebhookEvents } from './webhook'

import {
  transformEnvelope,
  type RawClicksignDocument,
  type RawClicksignSigner,
} from './transform/envelope'
import { transformSigner } from './transform/signer'
import { transformDocument } from './transform/document'
import { transformAuditTrailEntry, type RawClicksignEvent } from './transform/audit-trail-entry'
import { transformTemplate, type RawClicksignTemplate } from './transform/template'

export interface ClicksignAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

interface DocumentEnvelope {
  document?: RawClicksignDocument
}

/**
 * `GET /api/v1/documents/:key` as the events block documents it: the events
 * sit inside `document` (https://developers.clicksign.com/v1.0/docs/visualizar-documento.md,
 * "Events: atributos dos eventos"; https://developers.clicksign.com/v1.0/docs/exemplo-document.md).
 */
interface DocumentWithEvents {
  document?: { key: string; events?: RawClicksignEvent[] }
}

interface DocumentListResponse {
  documents?: RawClicksignDocument[]
}

interface TemplateListResponse {
  templates?: RawClicksignTemplate[]
}

interface TemplateEnvelope {
  template?: RawClicksignTemplate
}

export class ClicksignAdapter implements DocsignAdapter {
  readonly platform = 'clicksign'
  readonly version = '0.1.0'

  // Stored for parity with the OAuth adapter shape; unused by Clicksign.
  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: {
    clientId: string
    clientSecret: string
    redirectUri: string
    scopes?: string[]
  }) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? []
    void this.clientId
    void this.clientSecret
    void this.redirectUri
    void this.scopes
  }

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    return buildAuthUrl()
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return csExchange(code, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return csRefresh(credentials)
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'apiKey',
        label: 'API Access Token',
        type: 'password',
        required: true,
        placeholder: 'Clicksign access token',
        helpText:
          'Generate an access token at app.clicksign.com → Account → API. Sent as ?access_token=… on every request.',
      },
    ]
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return exchangeApiKey(fields)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyClicksignWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseClicksignWebhookEvents(payload)
  }

  private client(credentials: Credentials): ClicksignClient {
    return new ClicksignClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      per_page: params.limit ?? DEFAULT_PAGE_SIZE,
      page: params.page ?? 1,
    }
  }

  private extractSigners(raw: RawClicksignDocument): RawClicksignSigner[] {
    if (Array.isArray(raw.signers)) return raw.signers
    if (raw.list && Array.isArray(raw.list.signers)) return raw.list.signers
    return []
  }

  // ── Envelopes (documents) ────────────────────────────────────────────────

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const res = await this.client(credentials).get<DocumentListResponse>(
      '/documents',
      this.listParams(params),
    )
    return (res.documents ?? []).map(transformEnvelope)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const res = await this.client(credentials).get<DocumentEnvelope>(`/documents/${id}`)
    if (!res.document) throw new Error(`Clicksign document ${id} not found`)
    return transformEnvelope(res.document)
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Envelope> {
    await this.client(credentials).patch(`/documents/${id}/cancel`)
    return this.getEnvelope(credentials, id)
  }

  // ── Signers ───────────────────────────────────────────────────────────────

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    _params: QueryParams,
  ): Promise<Signer[]> {
    const res = await this.client(credentials).get<DocumentEnvelope>(`/documents/${envelopeId}`)
    if (!res.document) throw new Error(`Clicksign document ${envelopeId} not found`)
    return this.extractSigners(res.document).map((s) => transformSigner(s, envelopeId))
  }

  async getSigner(_credentials: Credentials, id: string): Promise<Signer> {
    throw new Error(
      `Clicksign does not expose a signer-by-id endpoint. Use listSigners(envelopeId). id=${id}`,
    )
  }

  // ── Documents (metadata only — content REFUSED) ──────────────────────────

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    _params: QueryParams,
  ): Promise<Document[]> {
    const res = await this.client(credentials).get<DocumentEnvelope>(`/documents/${envelopeId}`)
    if (!res.document) throw new Error(`Clicksign document ${envelopeId} not found`)
    return [transformDocument(res.document)]
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const res = await this.client(credentials).get<DocumentEnvelope>(`/documents/${id}`)
    if (!res.document) throw new Error(`Clicksign document ${id} not found`)
    return transformDocument(res.document)
  }

  // ── Audit-trail entries ──────────────────────────────────────────────────

  /**
   * Clicksign v1 documents no events endpoint: a document's events come
   * embedded, whole, in `GET /api/v1/documents/:key`
   * (https://developers.clicksign.com/v1.0/docs/visualizar-documento.md), so
   * they are paged locally.
   *
   * The docs disagree on where `events` sits: the "Events" section example
   * and exemplo-document.md nest it in `document`; the "Exemplo completo"
   * puts it beside `document`. This reads `document.events` only, and throws
   * when it is absent rather than reporting a complete, empty audit trail.
   *
   * Clicksign gives an event no id. Ids are `<key>:<occurred_at>:<name>`,
   * built from documented fields, so a newly added event does not shift them
   * (both documented examples list events newest-first). Exact duplicates
   * get `#<n>`, counted from the end of the array (the oldest end).
   */
  private async fetchAuditTrail(
    credentials: Credentials,
    envelopeId: string,
  ): Promise<AuditTrailEntry[]> {
    const res = await this.client(credentials).get<DocumentWithEvents>(`/documents/${envelopeId}`)
    if (!res.document) throw new Error(`Clicksign document ${envelopeId} not found`)
    const events = res.document.events
    if (!Array.isArray(events)) {
      throw new Error(`Clicksign document ${envelopeId} returned no document.events block`)
    }
    const entries = events.map((raw) => transformAuditTrailEntry(raw, envelopeId))
    const seen = new Map<string, number>()
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i]!
      const n = seen.get(entry.id) ?? 0
      seen.set(entry.id, n + 1)
      if (n > 0) {
        entry.id = `${entry.id}#${n}`
        entry.externalId = entry.id
      }
    }
    return entries
  }

  async listAuditTrailEntries(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    return pageLocally(await this.fetchAuditTrail(credentials, envelopeId), params)
  }

  async getAuditTrailEntry(credentials: Credentials, id: string): Promise<AuditTrailEntry> {
    const sep = id.indexOf(':')
    const envelopeId = sep > 0 ? id.slice(0, sep) : ''
    if (!envelopeId || sep === id.length - 1) {
      throw new Error('Clicksign audit-trail id expects shape "<envelopeId>:<occurred_at>:<name>"')
    }
    const all = await this.fetchAuditTrail(credentials, envelopeId)
    const found = all.find((e) => e.id === id)
    if (!found) throw new Error(`Audit entry ${id} not found`)
    return found
  }

  // ── Templates ────────────────────────────────────────────────────────────

  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    const res = await this.client(credentials).get<TemplateListResponse>(
      '/templates',
      this.listParams(params),
    )
    return (res.templates ?? []).map(transformTemplate)
  }

  async getTemplate(credentials: Credentials, id: string): Promise<Template> {
    const res = await this.client(credentials).get<TemplateEnvelope>(`/templates/${id}`)
    if (!res.template) throw new Error(`Clicksign template ${id} not found`)
    return transformTemplate(res.template)
  }
}
