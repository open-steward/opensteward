/**
 * BoldSign adapter.
 *
 * Maps BoldSign documents → canonical `Envelope` (a document IS the
 * envelope — there is no separate envelopes resource), the document's
 * `signerDetails` → `Signer`, its `files` manifest → `Document` (metadata
 * only), its `documentHistory` → `AuditTrailEntry`, and BoldSign templates
 * → `Template`.
 *
 * Auth is a static API key (`X-API-KEY`) collected via the Connect Link
 * form; there is no OAuth flow, so `getAuthUrl`/`exchangeCode` throw.
 *
 * Docs: https://developers.boldsign.com/
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

import { FORM } from './auth'
import { BoldsignClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import { verifyBoldsignWebhook, parseBoldsignWebhookEvents } from './webhook'

import {
  transformEnvelope,
  type RawBoldsignDocument,
} from './transform/envelope'
import { transformSigner } from './transform/signer'
import { transformDocument } from './transform/document'
import {
  transformAuditTrailEntry,
  type RawBoldsignHistoryEvent,
} from './transform/audit-trail-entry'
import { transformTemplate, type RawBoldsignTemplate } from './transform/template'

export interface BoldsignAdapterConfig {
  clientId: string
  /** Treated as the API key when supplied via instance config rather than the form. */
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

interface DocumentListResponse {
  result?: RawBoldsignDocument[]
  pageDetails?: { page?: number; pageSize?: number; totalRecordsCount?: number; totalPages?: number }
}

interface TemplateListResponse {
  result?: RawBoldsignTemplate[]
  pageDetails?: { page?: number; pageSize?: number; totalRecordsCount?: number; totalPages?: number }
}

/** Document properties carry the optional `documentHistory` audit array. */
type DocumentPropertiesResponse = RawBoldsignDocument & {
  documentHistory?: RawBoldsignHistoryEvent[]
}

export class BoldsignAdapter implements DocsignAdapter {
  readonly platform = 'boldsign'
  readonly version = '0.1.0'
  /** Honours `params.search`; see AdapterCapabilities. Declared so the
   *  router can refuse the parameter on adapters that would drop it. */
  readonly capabilities = { search: true }

   
  private clientId: string
  private clientSecret: string
   
  private redirectUri: string
   
  private scopes: string[]

  constructor(config: BoldsignAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? []
  }

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    throw new Error('boldsign uses static API key auth; use credentialFields() instead')
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('boldsign uses static API key auth; use exchangeCredentials() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  credentialFields(): CredentialField[] {
    return FORM.credentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return FORM.exchangeCredentials(fields)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyBoldsignWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseBoldsignWebhookEvents(payload)
  }

  private client(credentials: Credentials): BoldsignClient {
    return new BoldsignClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      page: params.page ?? 1,
      pageSize: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    if (params['status']) out.status = String(params['status'])
    if (params.search) out.searchKey = String(params.search)
    return out
  }

  private async documentProperties(
    credentials: Credentials,
    documentId: string,
  ): Promise<DocumentPropertiesResponse> {
    return this.client(credentials).get<DocumentPropertiesResponse>(
      '/v1/document/properties',
      { documentId },
    )
  }

  // ── Envelopes (documents) ─────────────────────────────────────────────────

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const res = await this.client(credentials).get<DocumentListResponse>(
      '/v1/document/list',
      this.listParams(params),
    )
    return (res.result ?? []).map(transformEnvelope)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const raw = await this.documentProperties(credentials, id)
    return transformEnvelope(raw)
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Envelope> {
    await this.client(credentials).post(
      '/v1/document/revoke',
      { message: data?.reason ?? 'Revoked by API' },
      { documentId: id },
    )
    return this.getEnvelope(credentials, id)
  }

  // ── Signers (signerDetails on the document) ───────────────────────────────

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    // GET /v1/document/properties takes only `documentId` and returns every
    // signer, so the caller's page is cut from the whole array here.
    const raw = await this.documentProperties(credentials, envelopeId)
    return pageLocally(
      (raw.signerDetails ?? []).map((s) => transformSigner(s, envelopeId)),
      params,
    )
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    const [envelopeId] = id.includes(':') ? id.split(':') : [id]
    if (!envelopeId) {
      throw new Error('BoldSign getSigner expects an id of shape "<documentId>:<signerEmail>"')
    }
    const all = await this.listSigners(credentials, envelopeId, {})
    const found = all.find((s) => s.externalId === id)
    if (!found) throw new Error(`BoldSign signer ${id} not found on document ${envelopeId}`)
    return found
  }

  // ── Documents (files manifest, metadata only — content REFUSED) ───────────

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    // The whole `files[]` array comes in one reply. Page after mapping so the
    // index-derived ids stay stable across pages.
    const raw = await this.documentProperties(credentials, envelopeId)
    return pageLocally(
      (raw.files ?? []).map((f, i) => transformDocument(f, envelopeId, i)),
      params,
    )
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const [envelopeId, orderStr] = id.split(':')
    if (!envelopeId || orderStr === undefined) {
      throw new Error('BoldSign getDocument expects an id of shape "<documentId>:<order>"')
    }
    const all = await this.listDocuments(credentials, envelopeId, {})
    const found = all[Number(orderStr)]
    if (!found) throw new Error(`BoldSign document ${id} not found`)
    return found
  }

  // ── Audit-trail entries (documentHistory) ─────────────────────────────────

  async listAuditTrailEntries(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    // The whole `documentHistory[]` comes in one reply; index it, then page it.
    const raw = await this.documentProperties(credentials, envelopeId)
    return pageLocally(
      (raw.documentHistory ?? []).map((h, i) => transformAuditTrailEntry(h, envelopeId, i)),
      params,
    )
  }

  async getAuditTrailEntry(credentials: Credentials, id: string): Promise<AuditTrailEntry> {
    const [envelopeId, indexStr] = id.split(':')
    if (!envelopeId || indexStr === undefined) {
      throw new Error('BoldSign audit-trail id expects shape "<documentId>:<index>"')
    }
    const all = await this.listAuditTrailEntries(credentials, envelopeId, {})
    const found = all[Number(indexStr)]
    if (!found) throw new Error(`BoldSign audit entry ${id} not found`)
    return found
  }

  // ── Templates ─────────────────────────────────────────────────────────────

  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    const res = await this.client(credentials).get<TemplateListResponse>(
      '/v1/template/list',
      this.listParams(params),
    )
    return (res.result ?? []).map(transformTemplate)
  }

  async getTemplate(credentials: Credentials, id: string): Promise<Template> {
    const raw = await this.client(credentials).get<RawBoldsignTemplate>(
      '/v1/template/properties',
      { templateId: id },
    )
    return transformTemplate(raw)
  }
}
