/**
 * eversign adapter.
 *
 * Maps eversign `document` (the envelope-equivalent) → canonical
 * `Envelope`, `signers[]` → `Signer`, `files[]` → `Document` (metadata
 * only), `/document/{hash}/audit_log` → `AuditTrailEntry`, and `/template`
 * → `Template`.
 *
 * Auth is api-key-only via the `access_key` query parameter; the Connect
 * Link hosted form collects `apiKey` plus an optional `businessId`.
 */

import { customForm, pageLocally } from '@opensteward/shared'
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
  exchangeCode as eversignExchange,
  refreshCredentials as eversignRefresh,
} from './auth'
import { EversignClient } from './client'
import { DEFAULT_LIST_TYPE, DEFAULT_PAGE_SIZE, DEFAULT_SCOPES } from './constants'
import { verifyEversignWebhook, parseEversignWebhookEvents } from './webhook'

import { transformEnvelope, type RawEversignDocument } from './transform/envelope'
import { transformSigner, type RawEversignSigner } from './transform/signer'
import { transformDocument, type RawEversignFile } from './transform/document'
import {
  transformAuditTrailEntry,
  type RawEversignAuditLogEntry,
} from './transform/audit-trail-entry'
import { transformTemplate, type RawEversignTemplate } from './transform/template'

export interface EversignAdapterConfig {
  clientId: string
  /** Treated as the API key — eversign is api-key auth. */
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

const FORM_FIELDS: CredentialField[] = [
  {
    name: 'apiKey',
    label: 'eversign API key',
    type: 'password',
    placeholder: 'eversign_live_...',
    helpText: 'Find this in eversign → API → Access Keys.',
    required: true,
  },
  {
    name: 'businessId',
    label: 'Business ID (optional)',
    type: 'text',
    placeholder: '123456',
    helpText: 'Only required for multi-business accounts.',
    required: false,
  },
]

const EVERSIGN_FORM = customForm({
  fields: FORM_FIELDS,
  exchange: async (fields) => {
    const apiKey = (fields['apiKey'] ?? '').trim()
    if (!apiKey) throw new Error('eversign API key is required.')
    const businessId = (fields['businessId'] ?? '').trim()
    return {
      accessToken: apiKey,
      extra: businessId ? { businessId } : {},
    }
  },
})

export class EversignAdapter implements DocsignAdapter {
  readonly platform = 'eversign'
  readonly version = '0.1.0'

  // Connect Link — API key + optional businessId.
  credentialFields = EVERSIGN_FORM.credentialFields
  exchangeCredentials = EVERSIGN_FORM.exchangeCredentials

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: EversignAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return eversignExchange(code, redirectUri, this.clientId, this.clientSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return eversignRefresh(credentials, this.clientId, this.clientSecret)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyEversignWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseEversignWebhookEvents(payload)
  }

  private client(credentials: Credentials): EversignClient {
    return new EversignClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      type: params['status']
        ? String(params['status'])
        : ((params['type'] as string | undefined) ?? DEFAULT_LIST_TYPE),
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    if (params.page) out.page = params.page
    if (params['cursor']) out.cursor = String(params['cursor'])
    return out
  }

  // ── Envelopes (eversign /document) ────────────────────────────────────────

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const res = await this.client(credentials).get<RawEversignDocument[]>(
      '/document',
      this.listParams(params),
    )
    return (Array.isArray(res) ? res : []).map(transformEnvelope)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const raw = await this.client(credentials).get<RawEversignDocument>('/document', {
      document_hash: id,
    })
    return transformEnvelope(raw)
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Envelope> {
    // Cancel Document (https://eversign.com/api/documentation/methods): "an
    // HTTP DELETE call to the API's document endpoint and appending both the
    // document_hash GET parameter … and the cancel GET parameter and setting
    // it to 1". Without cancel=1 the same DELETE is Delete Document. eversign
    // takes no cancellation reason, so `_data.reason` is not sent.
    //
    // The documented success response is `{ "success": true }`, and "Errors
    // always carry \"success\": false, an error code, a type object and an
    // info string." eversign sends that error body with HTTP 200, so axios
    // does not throw and the body has to be checked here.
    const res = await this.client(credentials).delete<{
      success?: unknown
      error?: { info?: unknown }
    } | null>('/document', { document_hash: id, cancel: 1 })
    if (res?.success !== true) {
      const info = res?.error?.info
      throw new Error(
        `eversign cancel of document ${id} failed: ${typeof info === 'string' ? info : 'response did not carry success: true'}`,
      )
    }
    return this.getEnvelope(credentials, id)
  }

  // ── Signers ───────────────────────────────────────────────────────────────

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    // eversign exposes signers inline on the document detail. We fetch the
    // envelope and project the signers array. Get Document takes no paging
    // parameter and returns the whole data set, so page it locally.
    const raw = await this.client(credentials).get<RawEversignDocument>('/document', {
      document_hash: envelopeId,
    })
    const signers = (raw.signers ?? []) as RawEversignSigner[]
    return pageLocally(
      signers.map((s) => transformSigner(s, envelopeId)),
      params,
    )
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    const [envelopeId, signerId] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId || !signerId) {
      throw new Error('eversign signer id expects shape "<documentHash>:<signerId>"')
    }
    const all = await this.listSigners(credentials, envelopeId, {})
    const found = all.find((s) => s.externalId === signerId)
    if (!found) throw new Error(`Signer ${signerId} not found on document ${envelopeId}`)
    return found
  }

  // ── Documents (files manifest, metadata only) ─────────────────────────────

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    // Files arrive whole on Get Document (no paging parameter): page locally.
    const raw = await this.client(credentials).get<RawEversignDocument>('/document', {
      document_hash: envelopeId,
    })
    const files = (raw.files ?? []) as RawEversignFile[]
    return pageLocally(
      files.map((f, i) => transformDocument(f, envelopeId, i)),
      params,
    )
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const [envelopeId, documentId] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId || !documentId) {
      throw new Error('eversign document id expects shape "<documentHash>:<fileId>"')
    }
    const all = await this.listDocuments(credentials, envelopeId, {})
    const found = all.find((d) => d.externalId === documentId)
    if (!found) throw new Error(`Document ${documentId} not found on envelope ${envelopeId}`)
    return found
  }

  // ── Audit-trail entries (/document/{hash}/audit_log) ─────────────────────

  async listAuditTrailEntries(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    // "A request to the following URL should result with a list of events for
    // a document: https://api.eversign.com/document/{document_hash}/audit_log"
    // (https://eversign.com/api/documentation/methods). It takes no paging
    // parameter and returns "the entire history of the document's actions as
    // an array of objects", so page it locally.
    const res = await this.client(credentials).get<unknown>(
      `/document/${encodeURIComponent(envelopeId)}/audit_log`,
    )
    if (!Array.isArray(res)) {
      // "Errors always carry \"success\": false, an error code, a type object
      // and an info string."
      const info = (res as { error?: { info?: unknown } } | null)?.error?.info
      throw new Error(
        `eversign audit log for ${envelopeId} failed: ${typeof info === 'string' ? info : 'response was not an array'}`,
      )
    }
    return pageLocally(
      (res as RawEversignAuditLogEntry[]).map((raw) => transformAuditTrailEntry(raw, envelopeId)),
      params,
    )
  }

  async getAuditTrailEntry(credentials: Credentials, id: string): Promise<AuditTrailEntry> {
    const sep = id.lastIndexOf(':')
    const envelopeId = sep > 0 ? id.slice(0, sep) : ''
    const entryId = sep > 0 ? id.slice(sep + 1) : ''
    if (!envelopeId || !entryId) {
      throw new Error('eversign audit-trail id expects shape "<documentHash>:<entry_id>"')
    }
    const all = await this.listAuditTrailEntries(credentials, envelopeId, {})
    const found = all.find((e) => e.externalId === entryId)
    if (!found) throw new Error(`Audit entry ${id} not found`)
    return found
  }

  // ── Templates (/template) ────────────────────────────────────────────────

  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    const res = await this.client(credentials).get<RawEversignTemplate[]>(
      '/template',
      this.listParams(params),
    )
    return (Array.isArray(res) ? res : []).map(transformTemplate)
  }

  async getTemplate(credentials: Credentials, id: string): Promise<Template> {
    const raw = await this.client(credentials).get<RawEversignTemplate>('/template', {
      template_id: id,
    })
    return transformTemplate(raw)
  }
}
