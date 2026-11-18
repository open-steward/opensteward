/**
 * SignWell adapter.
 *
 * SignWell treats a document AS the envelope; there is no separate
 * envelopes resource. Recipients are signers. Templates and audit_trail
 * are first-class.
 */

import type { Credentials, QueryParams, CredentialField } from '@opensteward/shared'
import { pageLocally } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { AuditTrailEntry } from '../../schema/audit-trail-entry'
import type { Template } from '../../schema/template'
import type { WebhookEvent } from '../../schema/webhook'

import {
  credentialFields as signwellCredentialFields,
  exchangeCredentials as signwellExchangeCredentials,
} from './auth'
import { SignWellClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import {
  verifySignWellWebhook,
  parseSignWellWebhookEvents,
} from './webhook'

import {
  transformEnvelope,
  type RawSignWellDocument,
} from './transform/envelope'
import {
  transformSigner,
  type RawSignWellRecipient,
} from './transform/signer'
import { transformDocument } from './transform/document'
import {
  transformTemplate,
  type RawSignWellTemplate,
} from './transform/template'

export interface SignWellAdapterConfig {
  clientId: string
  /** Treated as the API key when no OAuth flow exists. */
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

interface DocumentsListResponse {
  data?: RawSignWellDocument[]
  meta?: { page?: number; per_page?: number; total?: number }
}

interface TemplatesListResponse {
  data?: RawSignWellTemplate[]
  meta?: { page?: number; per_page?: number; total?: number }
}

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

export class SignWellAdapter implements DocsignAdapter {
  readonly platform = 'signwell'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: SignWellAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? []
  }

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    throw new Error('signwell uses static API key auth; use credentialFields() instead')
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('signwell uses static API key auth; use exchangeCredentials() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  credentialFields(): CredentialField[] {
    return signwellCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    if (!fields.apiKey && this.clientSecret) {
      return { accessToken: this.clientSecret }
    }
    return signwellExchangeCredentials(fields)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifySignWellWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseSignWellWebhookEvents(payload)
  }

  private client(credentials: Credentials): SignWellClient {
    return new SignWellClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      page: params.page ?? 1,
      per_page: params.limit ?? DEFAULT_PAGE_SIZE,
      ...(params['status'] ? { status: String(params['status']) } : {}),
    }
  }

  // ── Envelopes (documents) ────────────────────────────────────────────────

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const res = await this.client(credentials).get<DocumentsListResponse>(
      '/documents',
      this.listParams(params),
    )
    return (res.data ?? []).map(transformEnvelope)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const raw = await this.client(credentials).get<RawSignWellDocument>(
      `/documents/${id}`,
    )
    return transformEnvelope(raw)
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Envelope> {
    await this.client(credentials).post(`/documents/${id}/cancel`)
    return this.getEnvelope(credentials, id)
  }

  // ── Signers (recipients) ─────────────────────────────────────────────────

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    // GET /documents/{id} takes only the path id and returns every
    // recipient inline, so the caller's page is cut locally.
    const raw = await this.client(credentials).get<RawSignWellDocument>(
      `/documents/${envelopeId}`,
    )
    const all = (raw.recipients ?? []).map((r: RawSignWellRecipient) =>
      transformSigner(r, envelopeId),
    )
    return pageLocally(all, params)
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    const [envelopeId, recipientId] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId || !recipientId) {
      throw new Error('SignWell getSigner expects id of shape "<documentId>:<recipientId>"')
    }
    const all = await this.listSigners(credentials, envelopeId, {})
    const found = all.find((s) => s.externalId === recipientId)
    if (!found) throw new Error(`SignWell signer ${recipientId} not found on document ${envelopeId}`)
    return found
  }

  // ── Documents — one per envelope ─────────────────────────────────────────

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    // One document per envelope, from the unpaginated GET /documents/{id}.
    const raw = await this.client(credentials).get<RawSignWellDocument>(
      `/documents/${envelopeId}`,
    )
    return pageLocally([transformDocument(raw, envelopeId)], params)
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const envelopeId = id.includes(':') ? (id.split(':')[0] as string) : id
    const raw = await this.client(credentials).get<RawSignWellDocument>(
      `/documents/${envelopeId}`,
    )
    return transformDocument(raw, envelopeId)
  }

  // ── Audit-trail entries ──────────────────────────────────────────────────
  //
  // SignWell documents no audit-trail endpoint: the reference index
  // (https://developers.signwell.com/llms.txt) has no audit route, including
  // the `/documents/{id}/audit_trail` path this adapter used to call.
  // The only audit record is the audit page inside the completed PDF
  // (https://developers.signwell.com/reference/getcompletedpdf.md): "Whether
  // to include the audit page as part of the document." A PDF page is not a
  // list of events, so both methods refuse before sending anything.

  async listAuditTrailEntries(
    _credentials: Credentials,
    _envelopeId: string,
    _params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    throw notSupported(
      'SignWell cannot list audit-trail entries: its API reference documents no audit-trail endpoint; the audit record exists only as "the audit page as part of the document" in the completed PDF',
    )
  }

  async getAuditTrailEntry(_credentials: Credentials, _id: string): Promise<AuditTrailEntry> {
    throw notSupported(
      'SignWell cannot get audit-trail entries: its API reference documents no audit-trail endpoint; the audit record exists only as "the audit page as part of the document" in the completed PDF',
    )
  }

  // ── Templates ────────────────────────────────────────────────────────────

  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    const res = await this.client(credentials).get<TemplatesListResponse>(
      '/document_templates',
      this.listParams(params),
    )
    return (res.data ?? []).map(transformTemplate)
  }

  async getTemplate(credentials: Credentials, id: string): Promise<Template> {
    const raw = await this.client(credentials).get<RawSignWellTemplate>(
      `/document_templates/${id}`,
    )
    return transformTemplate(raw)
  }
}
