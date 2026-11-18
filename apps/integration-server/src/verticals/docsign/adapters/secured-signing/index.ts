/**
 * Secured Signing adapter.
 *
 * Maps the Secured Signing REST API to the canonical docsign schema:
 *   - `Document` (signing request) → Envelope
 *   - nested `Signers`             → Signer
 *   - the `Document` file metadata → Document (metadata only, no content)
 *   - `DocumentLog` rows           → AuditTrailEntry
 *   - `EmailTemplate`              → Template
 *
 * Auth is OAuth 2.0 Authorization-Code Grant. Secured Signing exposes a
 * `NotifyUrl` callback on send requests but documents no webhook payload
 * shape or signature scheme, so this adapter implements no webhook methods.
 */

import { pageLocally } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { AuditTrailEntry } from '../../schema/audit-trail-entry'
import type { Template } from '../../schema/template'

import {
  buildAuthUrl,
  exchangeCode as securedSigningExchange,
  refreshCredentials as securedSigningRefresh,
} from './auth'
import { SecuredSigningClient } from './client'
import { DEFAULT_FOLDER, DEFAULT_SCOPES } from './constants'

import {
  transformEnvelope,
  type RawSecuredSigningDocument,
} from './transform/envelope'
import { transformSigner } from './transform/signer'
import { transformDocument } from './transform/document'
import {
  transformAuditTrailEntry,
  type RawSecuredSigningDocumentLog,
} from './transform/audit-trail-entry'
import {
  transformTemplate,
  type RawSecuredSigningEmailTemplate,
} from './transform/template'

export interface SecuredSigningAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

export class SecuredSigningAdapter implements DocsignAdapter {
  readonly platform = 'secured-signing'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: SecuredSigningAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return securedSigningExchange(code, redirectUri, this.clientId, this.clientSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return securedSigningRefresh(credentials, this.clientId, this.clientSecret)
  }

  private client(credentials: Credentials): SecuredSigningClient {
    return new SecuredSigningClient(credentials)
  }

  /** `GetActiveDocuments` takes a folder filter: InBox | Progress | Signed. */
  private folder(params: QueryParams): string {
    const f = params['folder']
    return typeof f === 'string' && f.length > 0 ? f : DEFAULT_FOLDER
  }

  // ── Envelopes (Document signing requests) ─────────────────────────────────

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const res = await this.client(credentials).get<RawSecuredSigningDocument[]>(
      `/Document/GetActiveDocuments/${encodeURIComponent(this.folder(params))}`,
      { DocumentLog: false },
    )
    return (res ?? []).map(transformEnvelope)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const raw = await this.client(credentials).get<RawSecuredSigningDocument>(
      `/Document/Status/${encodeURIComponent(id)}`,
      { DocumentLog: true },
    )
    return transformEnvelope(raw)
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Envelope> {
    // Secured Signing has no "void" verb; deleting the document is the
    // closest read-model equivalent. `RemoveFromPackage` removes only this
    // document when it belongs to a package.
    const raw = await this.client(credentials).post<RawSecuredSigningDocument>(
      `/Document/Delete/${encodeURIComponent(id)}`,
      { RemoveFromPackage: true },
    )
    return transformEnvelope(raw)
  }

  // ── Signers (nested on the Document) ──────────────────────────────────────

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    // GET /Document/Status/{DocumentReference} takes only the reference and a
    // DocumentLog flag, and returns the whole Signers list: page it here.
    const raw = await this.client(credentials).get<RawSecuredSigningDocument>(
      `/Document/Status/${encodeURIComponent(envelopeId)}`,
      { DocumentLog: false },
    )
    return pageLocally(
      (raw.Signers ?? []).map((s) => transformSigner(s, envelopeId)),
      params,
    )
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    // Secured Signing has no signer-by-id endpoint; resolve via the parent
    // document. Id shape: "<documentReference>:<signerReference>".
    const [envelopeId, signerReference] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId || !signerReference) {
      throw new Error('getSigner expects an id of shape "<documentReference>:<signerReference>"')
    }
    const all = await this.listSigners(credentials, envelopeId, {})
    const found = all.find((s) => s.externalId === signerReference)
    if (!found) throw new Error(`Signer ${signerReference} not found on document ${envelopeId}`)
    return found
  }

  // ── Documents (metadata only — content REFUSED) ───────────────────────────

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    // A Secured Signing signing request is a single document, so the list is
    // the one document the reference points at.
    const raw = await this.client(credentials).get<RawSecuredSigningDocument>(
      `/Document/Status/${encodeURIComponent(envelopeId)}`,
      { DocumentLog: false },
    )
    return pageLocally([transformDocument(raw, envelopeId)], params)
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const [envelopeId] = id.includes(':') ? id.split(':') : [id]
    const documentRef = envelopeId ?? id
    const raw = await this.client(credentials).get<RawSecuredSigningDocument>(
      `/Document/Status/${encodeURIComponent(documentRef)}`,
      { DocumentLog: false },
    )
    return transformDocument(raw, documentRef)
  }

  // ── Audit-trail entries (DocumentLog) ─────────────────────────────────────

  async listAuditTrailEntries(
    credentials: Credentials,
    envelopeId: string,
    _params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    const res = await this.client(credentials).get<RawSecuredSigningDocumentLog[]>(
      `/Document/Log/${encodeURIComponent(envelopeId)}`,
    )
    return (res ?? []).map((raw, i) => transformAuditTrailEntry(raw, envelopeId, i))
  }

  async getAuditTrailEntry(credentials: Credentials, id: string): Promise<AuditTrailEntry> {
    const [envelopeId, indexStr] = id.split(':')
    if (!envelopeId || indexStr === undefined) {
      throw new Error('getAuditTrailEntry expects an id of shape "<documentReference>:<index>"')
    }
    const all = await this.listAuditTrailEntries(credentials, envelopeId, {})
    const found = all[Number(indexStr)]
    if (!found) throw new Error(`Audit entry ${id} not found`)
    return found
  }

  // ── Templates (EmailTemplate) ─────────────────────────────────────────────

  async listTemplates(credentials: Credentials, _params: QueryParams): Promise<Template[]> {
    const res = await this.client(credentials).get<RawSecuredSigningEmailTemplate[]>(
      '/EmailTemplate/GetInvitationTemplates',
    )
    return (res ?? []).map(transformTemplate)
  }

  async getTemplate(credentials: Credentials, id: string): Promise<Template> {
    // Secured Signing has no template-by-id endpoint; resolve via the list.
    const all = await this.listTemplates(credentials, {})
    const found = all.find((t) => t.externalId === id)
    if (!found) throw new Error(`Template ${id} not found`)
    return found
  }
}
