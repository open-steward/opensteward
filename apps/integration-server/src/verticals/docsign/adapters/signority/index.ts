/**
 * Signority adapter.
 *
 * Wires Signority's HTTP-Basic (API key) REST API to the canonical docsign
 * schema. A Signority "document" maps to the canonical Envelope; its nested
 * `invitations` → Signers, `files` → Documents (metadata only), and
 * `histories` → AuditTrailEntries. Reusable templates (documentType 6/7/8)
 * map to Templates.
 *
 * Signority delivers results via a per-document `postBackURL` push rather
 * than signed webhooks, so no webhook verification/parsing is implemented
 * (those methods auto-501). There is no documented void/cancel endpoint, so
 * voidEnvelope is left unimplemented as well.
 *
 * Docs: https://www.signority.com/api-doc/
 */

import { simpleApiKey } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { AuditTrailEntry } from '../../schema/audit-trail-entry'
import type { Template } from '../../schema/template'

import {
  buildAuthUrl,
  exchangeCode as signorityExchange,
  refreshCredentials as signorityRefresh,
} from './auth'
import { SignorityClient } from './client'
import { DEFAULT_PAGE_SIZE, TEMPLATE_DOCUMENT_TYPES } from './constants'

import {
  transformEnvelope,
  type RawSignorityDocument,
} from './transform/envelope'
import { transformSigner } from './transform/signer'
import { transformDocument, type RawSignorityFile } from './transform/document'
import {
  transformAuditTrailEntry,
  type RawSignorityHistory,
} from './transform/audit-trail-entry'
import { transformTemplate } from './transform/template'

const SIMPLE_API_KEY_FORM = simpleApiKey({
  label: 'Signority API key',
  helpText: 'Found under My Account → Profile Settings → Integration.',
})

interface DocumentListResponse {
  documentCount?: number
  documents?: RawSignorityDocument[]
  success?: boolean
}

interface DocumentResponse {
  document?: RawSignorityDocument
  success?: boolean
}

export interface SignorityAdapterConfig {
  clientId?: string
  clientSecret?: string
  redirectUri?: string
  scopes?: string[]
}

export class SignorityAdapter implements DocsignAdapter {
  // Connect Link support — single API-key form (Signority uses HTTP Basic
  // with the API key as the username; no OAuth).
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'signority'
  readonly version = '0.1.0'

  constructor(_config: SignorityAdapterConfig = {}) {}

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return signorityExchange(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return signorityRefresh(credentials)
  }

  private client(credentials: Credentials): SignorityClient {
    return new SignorityClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      pageIndex: params.page ?? 1,
      pageSize: params.limit ?? DEFAULT_PAGE_SIZE,
    }
  }

  private async fetchDocument(
    credentials: Credentials,
    id: string,
  ): Promise<RawSignorityDocument> {
    const res = await this.client(credentials).get<DocumentResponse>(`/v1/documents/${id}`)
    if (!res.document) throw new Error(`Signority document ${id} not found`)
    return res.document
  }

  // ── Envelopes (documents) ──────────────────────────────────────────────────

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const res = await this.client(credentials).get<DocumentListResponse>(
      '/v2/documents/search2',
      this.listParams(params),
    )
    return (res.documents ?? [])
      .filter((d) => !isTemplate(d))
      .map(transformEnvelope)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    return transformEnvelope(await this.fetchDocument(credentials, id))
  }

  // ── Signers (invitations) ──────────────────────────────────────────────────

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    _params: QueryParams,
  ): Promise<Signer[]> {
    const doc = await this.fetchDocument(credentials, envelopeId)
    return (doc.invitations ?? []).map((inv) => transformSigner(inv, envelopeId))
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    const [envelopeId, invitationId] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId || !invitationId) {
      throw new Error('getSigner expects an id of shape "<envelopeId>:<invitationId>"')
    }
    const all = await this.listSigners(credentials, envelopeId, {})
    const found = all.find((s) => s.externalId === invitationId)
    if (!found) throw new Error(`Signer ${invitationId} not found on document ${envelopeId}`)
    return found
  }

  // ── Documents (files manifest — metadata only, no content) ─────────────────

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    _params: QueryParams,
  ): Promise<Document[]> {
    const doc = await this.fetchDocument(credentials, envelopeId)
    return (doc.files ?? []).map((f, i) =>
      transformDocument(f as RawSignorityFile, envelopeId, i),
    )
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const [envelopeId, fileId] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId || !fileId) {
      throw new Error('getDocument expects an id of shape "<envelopeId>:<fileId>"')
    }
    const all = await this.listDocuments(credentials, envelopeId, {})
    const found = all.find((d) => d.externalId === fileId)
    if (!found) throw new Error(`Document ${fileId} not found on document ${envelopeId}`)
    return found
  }

  // ── Audit-trail entries (histories) ────────────────────────────────────────

  async listAuditTrailEntries(
    credentials: Credentials,
    envelopeId: string,
    _params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    const doc = await this.fetchDocument(credentials, envelopeId)
    const histories = (doc.histories as RawSignorityHistory[] | undefined) ?? []
    return histories.map((h, i) => transformAuditTrailEntry(h, envelopeId, i))
  }

  async getAuditTrailEntry(credentials: Credentials, id: string): Promise<AuditTrailEntry> {
    const [envelopeId, indexStr] = id.split(':')
    if (!envelopeId || indexStr === undefined) {
      throw new Error('getAuditTrailEntry expects an id of shape "<envelopeId>:<index>"')
    }
    const all = await this.listAuditTrailEntries(credentials, envelopeId, {})
    const found = all[Number(indexStr)]
    if (!found) throw new Error(`Audit entry ${id} not found`)
    return found
  }

  // ── Templates (documentType 6/7/8) ─────────────────────────────────────────

  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    const res = await this.client(credentials).get<DocumentListResponse>(
      '/v2/documents/search2',
      this.listParams(params),
    )
    return (res.documents ?? []).filter(isTemplate).map(transformTemplate)
  }

  async getTemplate(credentials: Credentials, id: string): Promise<Template> {
    return transformTemplate(await this.fetchDocument(credentials, id))
  }
}

function isTemplate(doc: RawSignorityDocument): boolean {
  const type = typeof doc.documentType === 'string' ? Number(doc.documentType) : doc.documentType
  return type !== undefined && TEMPLATE_DOCUMENT_TYPES.includes(type)
}
