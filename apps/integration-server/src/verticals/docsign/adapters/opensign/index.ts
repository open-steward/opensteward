/**
 * OpenSign™ adapter.
 *
 * Maps OpenSign's `contracts_Document` (signature request) → canonical
 * `Envelope`, the embedded `Signers` (contactbook) array → `Signer`, the
 * attached PDF → `Document` (metadata only), the embedded `AuditTrail` →
 * `AuditTrailEntry`, and `contracts_Template` → `Template`.
 *
 * Authentication: a static API token in the `x-api-token` header — no OAuth.
 * Credentials are collected via the Connect Link flow (`credentialFields()`
 * + `exchangeCredentials()`); the customer picks a region (or self-hosted
 * base URL) and may supply the webhook security key.
 *
 * Refused fields: document content (`URL` / `SignedUrl`), completion
 * certificate (`CertificateUrl`), and signature images are never surfaced —
 * the canonical schema has no body field.
 *
 * Docs: https://docs.opensignlabs.com/docs/API-docs/v1.2/intro/
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
  exchangeApiToken,
  exchangeCode as opensignExchange,
  opensignCredentialFields,
  refreshCredentials as opensignRefresh,
} from './auth'
import { OpensignClient } from './client'
import { DEFAULT_DOCUMENT_REPORTS, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { verifyOpensignWebhook, parseOpensignWebhookEvents } from './webhook'

import { transformEnvelope, type RawOpensignDocument } from './transform/envelope'
import { transformSigner } from './transform/signer'
import { transformDocument } from './transform/document'
import { transformAuditTrailEntry } from './transform/audit-trail-entry'
import { transformTemplate, type RawOpensignTemplate } from './transform/template'

export interface OpensignAdapterConfig {
  redirectUri?: string
}

/** GET /document/:id → the document object, or an `{ error }` envelope. */
type DocumentResponse = RawOpensignDocument & { error?: string }
type TemplateResponse = RawOpensignTemplate & { error?: string }

/** GET /documentlist/:reportId → bare array, or an `{ error }` object. */
type DocumentListResponse = RawOpensignDocument[] | { error?: string }
type TemplateListResponse = RawOpensignTemplate[] | { error?: string }

function isError(res: unknown): res is { error: string } {
  return !!res && typeof res === 'object' && !Array.isArray(res) && 'error' in res
}

export class OpensignAdapter implements DocsignAdapter {
  readonly platform = 'opensign'
  readonly version = '0.1.0'
  /** Honours `params.search`; see AdapterCapabilities. Declared so the
   *  router can refuse the parameter on adapters that would drop it. */
  readonly capabilities = { search: true }

  constructor(_config: OpensignAdapterConfig = {}) {
    // OpenSign uses a static API token; no OAuth client config.
  }

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    return buildAuthUrl()
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return opensignExchange(code, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return opensignRefresh(credentials)
  }

  credentialFields(): CredentialField[] {
    return opensignCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return exchangeApiToken(fields)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyOpensignWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseOpensignWebhookEvents(payload)
  }

  private client(credentials: Credentials): OpensignClient {
    return new OpensignClient(credentials)
  }

  private listParams(params: QueryParams): { limit: number; skip: number } {
    const limit = Math.min(Number(params.limit ?? DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE)
    const page = Math.max(Number(params.page ?? 1), 1)
    return { limit, skip: (page - 1) * limit }
  }

  private async fetchDocument(
    credentials: Credentials,
    id: string,
  ): Promise<RawOpensignDocument> {
    const res = await this.client(credentials).get<DocumentResponse>(`/document/${id}`)
    if (isError(res)) throw new Error(`OpenSign document ${id}: ${res.error}`)
    return res
  }

  // ── Envelopes (contracts_Document) ─────────────────────────────────────────

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const { limit, skip } = this.listParams(params)
    const client = this.client(credentials)
    const search = params.search ? String(params.search) : ''

    const seen = new Set<string>()
    const out: Envelope[] = []
    for (const reportId of DEFAULT_DOCUMENT_REPORTS) {
      const res = await client.get<DocumentListResponse>(`/documentlist/${reportId}`, {
        limit,
        skip,
        ...(search ? { searchTerm: search } : {}),
      })
      if (isError(res) || !Array.isArray(res)) continue
      for (const doc of res) {
        if (!doc?.objectId || seen.has(doc.objectId)) continue
        seen.add(doc.objectId)
        out.push(transformEnvelope(doc))
      }
    }
    return out
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    return transformEnvelope(await this.fetchDocument(credentials, id))
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Envelope> {
    // OpenSign revokes a signature request by deleting the document. The
    // document is no longer fetchable afterward, so synthesise the voided
    // envelope from the pre-deletion snapshot.
    const before = await this.getEnvelope(credentials, id).catch(() => undefined)
    await this.client(credentials).delete(`/document/${id}`)
    if (before) return { ...before, status: 'voided' }
    return {
      id,
      externalId: id,
      status: 'voided',
      subject: '',
      signingOrder: 'parallel',
      signerIds: [],
      documentIds: [],
      platform: 'opensign',
      metadata: {},
    }
  }

  // ── Signers (embedded contactbook entries) ───────────────────────────────

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    // GET /document/:document_id documents no paging parameter: the embedded
    // signer array is the whole collection, so it is paged here.
    const doc = await this.fetchDocument(credentials, envelopeId)
    return pageLocally(
      (doc.Signers ?? []).map((s, i) => transformSigner(s, doc, i)),
      params,
    )
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    const sep = id.lastIndexOf(':')
    if (sep <= 0) {
      throw new Error('OpenSign getSigner expects an id of shape "<envelopeId>:<signerId>"')
    }
    const envelopeId = id.slice(0, sep)
    const signerId = id.slice(sep + 1)
    const all = await this.listSigners(credentials, envelopeId, {})
    const found = all.find((s) => s.externalId === signerId) ?? all.find((s) => s.externalId === id)
    if (!found) throw new Error(`Signer ${id} not found on envelope ${envelopeId}`)
    return found
  }

  // ── Documents (single PDF per envelope — content REFUSED) ──────────────────

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    // One PDF per envelope: the whole collection is this one row.
    const doc = await this.fetchDocument(credentials, envelopeId)
    return pageLocally([transformDocument(doc)], params)
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const sep = id.lastIndexOf(':')
    const envelopeId = sep > 0 ? id.slice(0, sep) : id
    const doc = await this.fetchDocument(credentials, envelopeId)
    return transformDocument(doc)
  }

  // ── Audit-trail entries (embedded AuditTrail array) ────────────────────────

  async listAuditTrailEntries(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    // The embedded audit trail is the whole collection; page it here.
    const doc = await this.fetchDocument(credentials, envelopeId)
    return pageLocally(
      (doc.AuditTrail ?? []).map((entry, i) => transformAuditTrailEntry(entry, envelopeId, i)),
      params,
    )
  }

  async getAuditTrailEntry(credentials: Credentials, id: string): Promise<AuditTrailEntry> {
    const sep = id.lastIndexOf(':')
    if (sep <= 0) {
      throw new Error('OpenSign getAuditTrailEntry expects an id of shape "<envelopeId>:<entryId>"')
    }
    const envelopeId = id.slice(0, sep)
    const all = await this.listAuditTrailEntries(credentials, envelopeId, {})
    const found = all.find((e) => e.id === id)
    if (!found) throw new Error(`Audit entry ${id} not found`)
    return found
  }

  // ── Templates (contracts_Template) ─────────────────────────────────────────

  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    const { limit, skip } = this.listParams(params)
    const res = await this.client(credentials).get<TemplateListResponse>('/templatelist', {
      limit,
      skip,
    })
    if (isError(res) || !Array.isArray(res)) return []
    return res.map(transformTemplate)
  }

  async getTemplate(credentials: Credentials, id: string): Promise<Template> {
    const res = await this.client(credentials).get<TemplateResponse>(`/template/${id}`)
    if (isError(res)) throw new Error(`OpenSign template ${id}: ${res.error}`)
    return transformTemplate(res)
  }
}
