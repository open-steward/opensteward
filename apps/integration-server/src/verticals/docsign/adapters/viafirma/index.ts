/**
 * Viafirma Documents adapter.
 *
 * Maps the Viafirma Documents "SET" (a set of messages sent to one or more
 * recipients for signing) onto the canonical docsign schema:
 *   SET                → Envelope   (GET /set/summary/{code}, PUT /set/reject/{code})
 *   SET link (recipient) → Signer   (derived from the SET summary)
 *   SET message        → Document   (derived from the SET summary)
 *   user template      → Template   (GET /template/list/{userCode})
 *
 * Resources Viafirma does NOT expose are deliberately left unimplemented and
 * auto-resolve to 501 Not Implemented at the router:
 *   - listEnvelopes: Documents has no SET list/search endpoint.
 *   - getTemplate:   no template-by-id endpoint (list only).
 *   - audit-trail:   the audit trail is delivered as a PDF link, not as
 *                    queryable events, so it cannot back the canonical
 *                    AuditTrailEntry resource.
 *   - webhooks:      the auto-response callback carries no signature, so
 *                    there is nothing to verify and no handler is wired.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: audit-trail-entry — The Viafirma Documents API only exposes
 *   audit-trail data as a PDF download link (GET /documents/api/v3/download/
 *   trail/{messageCode} → {link, fileName, expires}); there is no endpoint
 *   that returns structured, queryable audit-trail event records.
 *
 * Docs: https://doc.viafirma.com/documents/api/latest/en/
 */

import { pageLocally } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { Template } from '../../schema/template'

import {
  buildAuthUrl,
  exchangeCode as viafirmaExchange,
  refreshCredentials as viafirmaRefresh,
} from './auth'
import { ViafirmaClient } from './client'
import {
  DEFAULT_BASE_URL,
  DEFAULT_FORTRESS_URL,
  DEFAULT_SCOPES,
  PRODUCTION_BASE_URL,
  PRODUCTION_FORTRESS_URL,
} from './constants'

import { transformEnvelope } from './transform/envelope'
import { transformSigner } from './transform/signer'
import { transformDocument } from './transform/document'
import { transformTemplate, type RawViafirmaTemplate } from './transform/template'
import type { RawViafirmaSet, RawViafirmaMessage } from './transform/shared'

export interface ViafirmaAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
  /**
   * Use the Viafirma sandbox (sandbox.viafirma.com) instead of production.
   * An OAuth client is registered on exactly one Fortress, so the environment
   * follows the deployment's client — it is deployment config, not a
   * per-customer input.
   */
  sandbox?: boolean
  /** Fortress OAuth2 base override for private installations, e.g. https://fortress.example.com/fortress. */
  fortressUrl?: string
  /** Documents API host override for private installations, e.g. https://documents.example.com. */
  baseUrl?: string
}

export class ViafirmaAdapter implements DocsignAdapter {
  readonly platform = 'viafirma'
  readonly version = '0.1.0'

  /** Production and sandbox are separate Fortress servers; the admin UI offers the toggle. */
  readonly capabilities = { supportsSandbox: true }

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]
  private fortressUrl: string
  private baseUrl: string

  constructor(config: ViafirmaAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? DEFAULT_SCOPES
    const sandbox = config.sandbox === true
    this.fortressUrl = config.fortressUrl ?? (sandbox ? DEFAULT_FORTRESS_URL : PRODUCTION_FORTRESS_URL)
    this.baseUrl = config.baseUrl ?? (sandbox ? DEFAULT_BASE_URL : PRODUCTION_BASE_URL)
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(
      this.clientId,
      this.redirectUri,
      overrideScopes ?? this.scopes,
      state,
      this.fortressUrl,
    )
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return viafirmaExchange(
      code,
      redirectUri,
      this.clientId,
      this.clientSecret,
      this.fortressUrl,
      this.baseUrl,
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return viafirmaRefresh(credentials, this.clientId, this.clientSecret)
  }

  private client(credentials: Credentials): ViafirmaClient {
    return new ViafirmaClient(credentials)
  }

  private async fetchSet(credentials: Credentials, setCode: string): Promise<RawViafirmaSet> {
    return this.client(credentials).get<RawViafirmaSet>(`/set/summary/${setCode}`)
  }

  /** Index a SET's messages by their `code` for recipient ↔ message joins. */
  private messageIndex(set: RawViafirmaSet): Map<string, RawViafirmaMessage> {
    const idx = new Map<string, RawViafirmaMessage>()
    for (const m of set.messages ?? []) {
      if (m.code) idx.set(m.code, m)
    }
    return idx
  }

  // ── Envelopes (SETs) ───────────────────────────────────────────────────────

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const raw = await this.fetchSet(credentials, id)
    return transformEnvelope(raw)
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Envelope> {
    await this.client(credentials).putForm(`/set/reject/${id}`, {
      setCode: id,
      comment: data?.reason ?? 'Rejected via API',
    })
    return this.getEnvelope(credentials, id)
  }

  // ── Signers (SET recipients / links) ────────────────────────────────────────

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    // GET /set/summary/{setCode} takes only the SET code and carries the
    // whole `links` array, so there is no upstream page: page it here.
    const set = await this.fetchSet(credentials, envelopeId)
    const messages = this.messageIndex(set)
    const all = (set.links ?? []).map((link) =>
      transformSigner(link, envelopeId, link.messageCode ? messages.get(link.messageCode) : undefined),
    )
    return pageLocally(all, params)
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    const sep = id.indexOf(':')
    if (sep <= 0) {
      throw new Error('getSigner expects an id of shape "<setCode>:<messageCode>"')
    }
    const envelopeId = id.slice(0, sep)
    const recipientId = id.slice(sep + 1)
    const all = await this.listSigners(credentials, envelopeId, {})
    const found = all.find((s) => s.externalId === recipientId)
    if (!found) throw new Error(`Signer ${recipientId} not found on SET ${envelopeId}`)
    return found
  }

  // ── Documents (SET messages — metadata only, content REFUSED) ───────────────

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    // Same summary, whole `messages` array: page it here.
    const set = await this.fetchSet(credentials, envelopeId)
    const all = (set.messages ?? []).map((m, i) => transformDocument(m, envelopeId, i))
    return pageLocally(all, params)
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const sep = id.indexOf(':')
    if (sep <= 0) {
      throw new Error('getDocument expects an id of shape "<setCode>:<messageCode>"')
    }
    const envelopeId = id.slice(0, sep)
    const documentId = id.slice(sep + 1)
    const all = await this.listDocuments(credentials, envelopeId, {})
    const found = all.find((d) => d.externalId === documentId)
    if (!found) throw new Error(`Document ${documentId} not found on SET ${envelopeId}`)
    return found
  }

  // ── Templates (linked to a user) ─────────────────────────────────────────────

  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    const userCode = String(params['userCode'] ?? credentials.extra?.['userCode'] ?? '')
    if (!userCode) {
      throw new Error('listTemplates requires a userCode (params.userCode or credentials.extra.userCode)')
    }
    const res = await this.client(credentials).get<RawViafirmaTemplate[]>(`/template/list/${userCode}`)
    return (res ?? []).map(transformTemplate)
  }
}
