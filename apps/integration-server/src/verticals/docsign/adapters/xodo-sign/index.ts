/**
 * Xodo Sign (formerly eversign) adapter.
 *
 * Maps the Xodo Sign `document` object → canonical `Envelope`, its
 * `signers[]` → `Signer`, its `files[]` (metadata only) → `Document`, its
 * `log[]` → `AuditTrailEntry`, and template documents (`type=templates`) →
 * `Template`.
 *
 * Auth is a single API access key (no OAuth) passed as the `access_key`
 * query parameter, scoped to a `business_id`; both are injected by the
 * client. The OAuth `BaseAdapter` methods throw — credentials arrive via
 * the Connect Link form (`credentialFields` / `exchangeCredentials`).
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { AuditTrailEntry } from '../../schema/audit-trail-entry'
import type { Template } from '../../schema/template'
import type { WebhookEvent } from '../../schema/webhook'

import { credentialFields, exchangeCredentials } from './auth'
import { XodoSignClient } from './client'
import { DEFAULT_PAGE_SIZE, DOCUMENT_PATH, TEMPLATE_LIST_TYPE } from './constants'
import { verifyXodoSignWebhook, parseXodoSignWebhookEvents } from './webhook'

import {
  transformEnvelope,
  type RawXodoSignDocument,
} from './transform/envelope'
import { transformSigner } from './transform/signer'
import { transformDocument } from './transform/document'
import { transformAuditTrailEntry } from './transform/audit-trail-entry'
import { transformTemplate, type RawXodoSignTemplate } from './transform/template'

export interface XodoSignAdapterConfig {
  /** Optional config; Xodo Sign collects its API key via the Connect form. */
  redirectUri?: string
}

/** The document-list and template-list endpoints return a bare JSON array. */
type DocumentListResponse = RawXodoSignDocument[]

const NO_OAUTH =
  'Xodo Sign uses an API access key, not OAuth. Use the Connect Link credential form (credentialFields / exchangeCredentials).'

export class XodoSignAdapter implements DocsignAdapter {
  readonly platform = 'xodo-sign'
  readonly version = '0.1.0'

   
  constructor(_config: XodoSignAdapterConfig = {}) {}

  // ── Auth (API key via Connect Link form; no OAuth) ────────────────────────

  getAuthUrl(): string {
    throw new Error(NO_OAUTH)
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error(NO_OAUTH)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // API keys don't expire — return as-is.
    return credentials
  }

  credentialFields = credentialFields
  exchangeCredentials = exchangeCredentials

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyXodoSignWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseXodoSignWebhookEvents(payload)
  }

  private client(credentials: Credentials): XodoSignClient {
    return new XodoSignClient(credentials)
  }

  private async fetchDocument(
    credentials: Credentials,
    documentHash: string,
  ): Promise<RawXodoSignDocument> {
    const raw = await this.client(credentials).get<RawXodoSignDocument>(DOCUMENT_PATH, {
      document_hash: documentHash,
    })
    if (!raw || !raw.document_hash) throw new Error(`Document ${documentHash} not found`)
    return raw
  }

  // ── Envelopes (documents) ─────────────────────────────────────────────────

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const res = await this.client(credentials).get<DocumentListResponse>(DOCUMENT_PATH, {
      type: params['type'] ? String(params['type']) : 'all',
      page: params.page ?? 1,
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
    })
    return (Array.isArray(res) ? res : []).map(transformEnvelope)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    return transformEnvelope(await this.fetchDocument(credentials, id))
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Envelope> {
    // Cancel is a DELETE on /document with cancel=1.
    await this.client(credentials).delete(DOCUMENT_PATH, { document_hash: id, cancel: 1 })
    return this.getEnvelope(credentials, id)
  }

  // ── Signers (the document's signers[] array) ──────────────────────────────

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    _params: QueryParams,
  ): Promise<Signer[]> {
    const doc = await this.fetchDocument(credentials, envelopeId)
    return (doc.signers ?? []).map((s, i) => transformSigner(s, envelopeId, i))
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    const [envelopeId, signerId] = id.split(':')
    if (!envelopeId || !signerId) {
      throw new Error('getSigner expects an id of shape "<documentHash>:<signerId>"')
    }
    const all = await this.listSigners(credentials, envelopeId, {})
    const found = all.find((s) => s.externalId === signerId)
    if (!found) throw new Error(`Signer ${signerId} not found on document ${envelopeId}`)
    return found
  }

  // ── Documents (files manifest — metadata only, no content) ────────────────

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    _params: QueryParams,
  ): Promise<Document[]> {
    const doc = await this.fetchDocument(credentials, envelopeId)
    return (doc.files ?? []).map((f, i) => transformDocument(f, envelopeId, i))
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const [envelopeId, fileId] = id.split(':')
    if (!envelopeId || !fileId) {
      throw new Error('getDocument expects an id of shape "<documentHash>:<fileId>"')
    }
    const all = await this.listDocuments(credentials, envelopeId, {})
    const found = all.find((d) => d.externalId === fileId)
    if (!found) throw new Error(`Document file ${fileId} not found on document ${envelopeId}`)
    return found
  }

  // ── Audit-trail entries (the document's log[] array) ──────────────────────

  async listAuditTrailEntries(
    credentials: Credentials,
    envelopeId: string,
    _params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    const doc = await this.fetchDocument(credentials, envelopeId)
    const signerById = new Map(
      (doc.signers ?? []).map((s, i) => [String(s.id ?? s.order ?? i + 1), s] as const),
    )
    return (doc.log ?? []).map((entry, i) =>
      transformAuditTrailEntry(entry, envelopeId, i, signerById),
    )
  }

  async getAuditTrailEntry(credentials: Credentials, id: string): Promise<AuditTrailEntry> {
    const [envelopeId, indexStr] = id.split(':')
    if (!envelopeId || indexStr === undefined) {
      throw new Error('getAuditTrailEntry expects an id of shape "<documentHash>:<index>"')
    }
    const all = await this.listAuditTrailEntries(credentials, envelopeId, {})
    const found = all[Number(indexStr)]
    if (!found) throw new Error(`Audit entry ${id} not found`)
    return found
  }

  // ── Templates (documents with type=templates) ─────────────────────────────

  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    const res = await this.client(credentials).get<DocumentListResponse>(DOCUMENT_PATH, {
      type: TEMPLATE_LIST_TYPE,
      page: params.page ?? 1,
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
    })
    return (Array.isArray(res) ? res : []).map((t) => transformTemplate(t as RawXodoSignTemplate))
  }

  async getTemplate(credentials: Credentials, id: string): Promise<Template> {
    return transformTemplate(
      (await this.fetchDocument(credentials, id)) as RawXodoSignTemplate,
    )
  }
}
