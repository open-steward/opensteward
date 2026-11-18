/**
 * Skribble adapter (REST API v2).
 *
 * Swiss-headquartered eIDAS-qualified + ZertES trust service provider.
 * Maps Skribble `signature-requests` → canonical `Envelope`,
 * `signatures[]` → `Signer`, the single documented `document_id` →
 * `Document` (read with `GET /v2/documents/{id}`), synthesised
 * per-signer timestamps → `AuditTrailEntry`. The documented API has no
 * template resource, so template reads refuse with 501 NOT_SUPPORTED.
 *
 * Auth: server-to-server. POST username + api-key to
 * `/v2/access/login` to mint a short-lived JWT. There is no
 * authorization-code flow, so `getAuthUrl()` throws and credential
 * collection happens via `credentialFields()` + `exchangeCredentials()`.
 */
import { pageLocally } from '@opensteward/shared'
import type { Credentials, CredentialField, QueryParams } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { AuditTrailEntry } from '../../schema/audit-trail-entry'
import type { Template } from '../../schema/template'
import type { WebhookEvent } from '../../schema/webhook'

import {
  SKRIBBLE_CREDENTIAL_FIELDS,
  exchangeSkribbleCredentials,
  refreshSkribbleCredentials,
} from './auth'
import { SkribbleClient } from './client'
import { DEFAULT_SCOPES } from './constants'
import { verifySkribbleWebhook, parseSkribbleWebhookEvents } from './webhook'

import { transformEnvelope, type RawSkribbleSignatureRequest } from './transform/envelope'
import { transformSigner } from './transform/signer'
import {
  SKRIBBLE_DOCUMENT_SLOT,
  transformDocument,
  type RawSkribbleDocument,
} from './transform/document'
import {
  synthesiseAuditEvents,
  transformAuditTrailEntry,
} from './transform/audit-trail-entry'

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

export interface SkribbleAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

export class SkribbleAdapter implements DocsignAdapter {
  readonly platform = 'skribble'
  readonly version = '0.1.0'

  // Connect Link support — Skribble has no OAuth, so we collect
  // username + api-key via the hosted form and mint a JWT at exchange.
  // The fields are kept under `_clientId` etc. only to satisfy the
  // standardised constructor signature; they are not used.
  private _clientId: string
  private _clientSecret: string
  private _redirectUri: string
  private _scopes: string[]

  constructor(config: SkribbleAdapterConfig) {
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
      'skribble uses static API key auth; use credentialFields() instead',
    )
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error(
      'skribble uses static API key auth; use exchangeCredentials() instead',
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshSkribbleCredentials(credentials)
  }

  credentialFields(): CredentialField[] {
    return SKRIBBLE_CREDENTIAL_FIELDS
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return exchangeSkribbleCredentials(fields)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifySkribbleWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseSkribbleWebhookEvents(payload)
  }

  private client(credentials: Credentials): SkribbleClient {
    return new SkribbleClient(credentials)
  }

  // ── Envelopes (signature-requests) ────────────────────────────────────────

  // `page_number` is documented as "Default: Pagination is disabled", and the
  // docs disagree on whether it is 0- or 1-based, so ask for the whole
  // collection and page it here (https://api-doc.skribble.com/).
  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const res = await this.client(credentials).get<RawSkribbleSignatureRequest[]>(
      '/signature-requests',
    )
    return pageLocally((Array.isArray(res) ? res : []).map(transformEnvelope), params)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const raw = await this.client(credentials).get<RawSkribbleSignatureRequest>(
      `/signature-requests/${id}`,
    )
    return transformEnvelope(raw)
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Envelope> {
    await this.client(credentials).put(`/signature-requests/${id}/withdraw`, {})
    return this.getEnvelope(credentials, id)
  }

  // ── Signers ───────────────────────────────────────────────────────────────

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    const env = await this.client(credentials).get<RawSkribbleSignatureRequest>(
      `/signature-requests/${envelopeId}`,
    )
    return pageLocally(
      (env.signatures ?? []).map((s) => transformSigner(s, envelopeId)),
      params,
    )
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    const [envelopeId, sid] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId || !sid) {
      throw new Error('Skribble getSigner expects an id of shape "<envelopeId>:<signatureId>"')
    }
    const all = await this.listSigners(credentials, envelopeId, {})
    const found = all.find((s) => s.externalId === sid)
    if (!found) throw new Error(`Signer ${sid} not found on signature-request ${envelopeId}`)
    return found
  }

  // ── Documents (metadata only — content REFUSED) ──────────────────────────

  // A SignatureRequest documents a single `document_id` ("ID of the
  // `Document` object ... Use this for detailled requests to this
  // `Document`"), read with `GET /v2/documents/{{DOC_ID}}` ("Get the document
  // metadata"), https://api-doc.skribble.com/. There is no `documents[]`
  // array, so a request lists at most one document, paged locally.
  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    const client = this.client(credentials)
    const env = await client.get<RawSkribbleSignatureRequest>(
      `/signature-requests/${encodeURIComponent(envelopeId)}`,
    )
    const documentId = typeof env.document_id === 'string' && env.document_id ? env.document_id : undefined
    if (!documentId) return pageLocally([], params)
    const raw = await client.get<RawSkribbleDocument>(`/documents/${encodeURIComponent(documentId)}`)
    return pageLocally([transformDocument(raw, envelopeId)], params)
  }

  // The id is `<envelopeId>:document` (see transform/document.ts): the
  // Skribble document id changes on signing, so the read resolves the
  // request's current `document_id` instead of matching a stored one.
  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const sep = id.lastIndexOf(':')
    const envelopeId = sep > 0 ? id.slice(0, sep) : ''
    if (!envelopeId || id.slice(sep + 1) !== SKRIBBLE_DOCUMENT_SLOT) {
      throw new Error(
        `Skribble getDocument expects an id of shape "<envelopeId>:${SKRIBBLE_DOCUMENT_SLOT}"`,
      )
    }
    const [found] = await this.listDocuments(credentials, envelopeId, {})
    if (!found) throw new Error(`Signature-request ${envelopeId} has no document_id`)
    return found
  }

  // ── Audit-trail entries (synthesised) ────────────────────────────────────

  async listAuditTrailEntries(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    const env = await this.client(credentials).get<RawSkribbleSignatureRequest>(
      `/signature-requests/${envelopeId}`,
    )
    const events = synthesiseAuditEvents(env.signatures)
    return pageLocally(
      events.map((ev, i) => transformAuditTrailEntry(ev, envelopeId, i)),
      params,
    )
  }

  async getAuditTrailEntry(
    credentials: Credentials,
    id: string,
  ): Promise<AuditTrailEntry> {
    const [envelopeId, indexStr] = id.split(':')
    if (!envelopeId || !indexStr) {
      throw new Error('Skribble audit-trail id expects shape "<envelopeId>:<index>"')
    }
    const all = await this.listAuditTrailEntries(credentials, envelopeId, {})
    const found = all[Number(indexStr)]
    if (!found) throw new Error(`Audit entry ${id} not found`)
    return found
  }

  // ── Templates ────────────────────────────────────────────────────────────

  // The API reference (https://api-doc.skribble.com/) documents SignatureRequests,
  // Seal, Send-to, Documents, User, Report and Callbacks, and no template
  // resource: the adapter's old `/signature-requests/templates` was invented.
  async listTemplates(_credentials: Credentials, _params: QueryParams): Promise<Template[]> {
    throw notSupported('Skribble cannot list templates: the API reference documents no template resource')
  }

  async getTemplate(_credentials: Credentials, _id: string): Promise<Template> {
    throw notSupported('Skribble cannot read templates: the API reference documents no template resource')
  }
}
