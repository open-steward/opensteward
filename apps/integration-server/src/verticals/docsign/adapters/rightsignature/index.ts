/**
 * RightSignature adapter (Citrix RightSignature REST API).
 *
 * Maps RightSignature `documents` → canonical `Envelope` (single-document-
 * per-envelope), `signers[]`/`recipients[]` → `Signer`, the envelope's own
 * file metadata → `Document` (metadata only), `audits[]` of `/public/v1/documents/{id}` →
 * `AuditTrailEntry`, and `/reusable_forms` → `Template`.
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

import { buildAuthUrl, exchangeCode as rsExchange, refreshCredentials as rsRefresh } from './auth'
import { RightSignatureClient } from './client'
import { DEFAULT_PAGE_SIZE, DEFAULT_SCOPES, DOCUMENTS_PATH } from './constants'
import { verifyRightSignatureWebhook, parseRightSignatureWebhookEvents } from './webhook'

import { transformEnvelope, type RawRightSignatureDocument } from './transform/envelope'
import { transformSigner, type RawRightSignatureRecipient } from './transform/signer'
import { transformDocument, type RawRightSignatureDocumentFile } from './transform/document'
import {
  transformAuditTrailEntry,
  type RawRightSignatureAudit,
} from './transform/audit-trail-entry'
import { transformTemplate, type RawRightSignatureReusableForm } from './transform/template'

export interface RightSignatureAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

interface DocumentListResponse {
  documents?: RawRightSignatureDocument[]
  data?: RawRightSignatureDocument[]
  meta?: { cursor?: string }
}

interface ReusableFormListResponse {
  reusable_forms?: RawRightSignatureReusableForm[]
  templates?: RawRightSignatureReusableForm[]
  data?: RawRightSignatureReusableForm[]
}

/**
 * The fields of `GET /public/v1/documents/:id` → `document` this adapter reads
 * for signers, the file and the audit trail.
 */
interface RawRightSignatureShowDocument extends RawRightSignatureDocumentFile {
  recipients?: RawRightSignatureRecipient[]
  audits?: RawRightSignatureAudit[]
}

function notFound(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 404, code: 'NOT_FOUND' })
}

/** Splits a compound `<documentId>:<childId>` id, rejecting any other shape. */
function splitPair(id: string, kind: string, shape: string): [string, string] {
  const parts = id.split(':')
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw Object.assign(new Error(`RightSignature ${kind} id expects shape "${shape}"`), {
      statusCode: 400,
      code: 'VALIDATION',
    })
  }
  return [parts[0], parts[1]]
}

function pickArray<T>(...sources: Array<T[] | undefined>): T[] {
  for (const s of sources) {
    if (Array.isArray(s)) return s
  }
  return []
}

export class RightSignatureAdapter implements DocsignAdapter {
  readonly platform = 'rightsignature'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: RightSignatureAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return rsExchange(code, redirectUri, this.clientId, this.clientSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return rsRefresh(credentials, this.clientId, this.clientSecret)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyRightSignatureWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseRightSignatureWebhookEvents(payload)
  }

  private client(credentials: Credentials): RightSignatureClient {
    return new RightSignatureClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      per_page: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    if (params.page) out.page = params.page
    if (params['cursor']) out.cursor = String(params['cursor'])
    if (params['status']) out.status = String(params['status'])
    if (params.updatedAfter instanceof Date) {
      out.updated_after = params.updatedAfter.toISOString()
    } else if (params['updated_after']) {
      out.updated_after = String(params['updated_after'])
    }
    return out
  }

  // ── Envelopes (RightSignature documents) ──────────────────────────────────

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const res = await this.client(credentials).get<DocumentListResponse>(
      '/documents',
      this.listParams(params),
    )
    return pickArray<RawRightSignatureDocument>(res.documents, res.data).map(transformEnvelope)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const raw = await this.client(credentials).get<
      RawRightSignatureDocument | { document: RawRightSignatureDocument }
    >(`/documents/${id}`)
    const doc =
      (raw as { document?: RawRightSignatureDocument }).document ??
      (raw as RawRightSignatureDocument)
    return transformEnvelope(doc)
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

  // ── Signers, documents and audits (GET /public/v1/documents/:id) ────────
  //
  // RightSignature documents no list endpoint for a document's recipients,
  // file or audit trail. All three are nested in the one show response
  // (https://api.rightsignature.com/documentation/resources/v1/documents:
  // "api_url":"/public/v1/documents/:id","http_method":"GET"), which takes no
  // paging parameters, so each is the whole collection and is paged locally.

  private async showDocument(
    credentials: Credentials,
    documentId: string,
  ): Promise<RawRightSignatureShowDocument> {
    const res = await this.client(credentials).get<{ document?: RawRightSignatureShowDocument }>(
      `${DOCUMENTS_PATH}/${encodeURIComponent(documentId)}`,
    )
    if (!res?.document) {
      throw notFound(`RightSignature document ${documentId} not found`)
    }
    return res.document
  }

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    const doc = await this.showDocument(credentials, envelopeId)
    return pageLocally(
      (doc.recipients ?? []).map((r) => transformSigner(r, envelopeId)),
      params,
    )
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    const [envelopeId, signerId] = splitPair(id, 'signer', '<documentId>:<recipientId>')
    const doc = await this.showDocument(credentials, envelopeId)
    const found = (doc.recipients ?? []).find((r) => r.id === signerId)
    if (!found)
      throw notFound(`RightSignature recipient ${signerId} not found on document ${envelopeId}`)
    return transformSigner(found, envelopeId)
  }

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    const doc = await this.showDocument(credentials, envelopeId)
    return pageLocally([transformDocument(doc)], params)
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const [envelopeId, fileId] = splitPair(id, 'document', '<documentId>:<documentId>')
    if (fileId !== envelopeId) throw notFound(`RightSignature document ${id} not found`)
    return transformDocument(await this.showDocument(credentials, envelopeId))
  }

  async listAuditTrailEntries(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    const doc = await this.showDocument(credentials, envelopeId)
    return pageLocally(
      (doc.audits ?? []).map((a) => transformAuditTrailEntry(a, envelopeId)),
      params,
    )
  }

  async getAuditTrailEntry(credentials: Credentials, id: string): Promise<AuditTrailEntry> {
    const [envelopeId, auditId] = splitPair(id, 'audit-trail', '<documentId>:<auditId>')
    const doc = await this.showDocument(credentials, envelopeId)
    const found = (doc.audits ?? []).find((a) => String(a.id) === auditId)
    if (!found)
      throw notFound(`RightSignature audit ${auditId} not found on document ${envelopeId}`)
    return transformAuditTrailEntry(found, envelopeId)
  }

  // ── Templates (/reusable_forms) ──────────────────────────────────────────

  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    const res = await this.client(credentials).get<ReusableFormListResponse>(
      '/reusable_forms',
      this.listParams(params),
    )
    return pickArray<RawRightSignatureReusableForm>(
      res.reusable_forms,
      res.templates,
      res.data,
    ).map(transformTemplate)
  }

  async getTemplate(credentials: Credentials, id: string): Promise<Template> {
    const raw = await this.client(credentials).get<
      | RawRightSignatureReusableForm
      | { reusable_form: RawRightSignatureReusableForm }
      | { template: RawRightSignatureReusableForm }
    >(`/reusable_forms/${id}`)
    const t =
      (raw as { reusable_form?: RawRightSignatureReusableForm }).reusable_form ??
      (raw as { template?: RawRightSignatureReusableForm }).template ??
      (raw as RawRightSignatureReusableForm)
    return transformTemplate(t)
  }
}
