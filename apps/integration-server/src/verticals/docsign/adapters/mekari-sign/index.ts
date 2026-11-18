/**
 * Mekari Sign adapter.
 *
 * Mekari Sign is served through the Mekari API gateway under
 * `/v2/esign/v1`, authenticated with Mekari's HMAC api-key scheme
 * (Client ID + Client Secret). It models signing flows as "documents":
 * each document bundles one file plus an ordered list of signers.
 *
 * Canonical mapping:
 *   document            → Envelope          (GET /documents, /documents/{id})
 *   document.signers[]  → Signer            (embedded on the document)
 *   document file       → Document          (single file, metadata only)
 *   synthesised events  → AuditTrailEntry   (from document + signer timestamps)
 *
 * Not supported by the eSignature API and therefore left off (auto-501):
 *   templates, signer-by-id endpoint, webhook signature verification.
 */

// ── Resource coverage ──────────────────────────────────────────────
// Available:   envelope, signer, document, audit-trail-entry
// Unavailable: template — The Mekari Sign eSignature API exposes no template
//              endpoints. The official SDK (esign-api-php) and public API
//              reference cover documents, signing, stamping, and auto-sign
//              only — no /templates route exists.

import type { Credentials, QueryParams } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { AuditTrailEntry } from '../../schema/audit-trail-entry'

import {
  MEKARI_SIGN_FORM,
  buildAuthUrl,
  exchangeCode as mekariSignExchange,
  refreshCredentials as mekariSignRefresh,
} from './auth'
import { MekariSignClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import {
  transformEnvelope,
  type RawMekariSignDocument,
} from './transform/envelope'
import { transformSigner } from './transform/signer'
import { transformDocument } from './transform/document'
import {
  transformAuditTrailEntry,
  type SyntheticAuditEvent,
} from './transform/audit-trail-entry'

export interface MekariSignAdapterConfig {
  clientId?: string
  clientSecret?: string
}

interface DocumentListResponse {
  data?: RawMekariSignDocument[]
  documents?: RawMekariSignDocument[]
  pagination?: { page?: number; limit?: number; total?: number }
}

interface DocumentDetailResponse {
  data?: RawMekariSignDocument
  document?: RawMekariSignDocument
}

function unwrapList(res: DocumentListResponse): RawMekariSignDocument[] {
  return res.data ?? res.documents ?? []
}

function unwrapDetail(res: DocumentDetailResponse, id: string): RawMekariSignDocument {
  const doc = res.data ?? res.document
  if (!doc) throw new Error(`Mekari Sign document ${id} not found`)
  return doc
}

export class MekariSignAdapter implements DocsignAdapter {
  readonly platform = 'mekari-sign'
  readonly version = '0.1.0'

  // Connect Link support — Client ID + Client Secret form (HMAC api_key).
  credentialFields = MEKARI_SIGN_FORM.credentialFields
  exchangeCredentials = MEKARI_SIGN_FORM.exchangeCredentials

  constructor(_config: MekariSignAdapterConfig = {}) {}

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return mekariSignExchange(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return mekariSignRefresh(credentials)
  }

  private client(credentials: Credentials): MekariSignClient {
    return new MekariSignClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      page: params.page ?? 1,
      limit: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    }
    if (params['category']) out.category = String(params['category'])
    if (params['signing_status']) out.signing_status = String(params['signing_status'])
    else if (params['status']) out.signing_status = String(params['status'])
    if (params['stamping_status']) out.stamping_status = String(params['stamping_status'])
    return out
  }

  // ── Envelopes (documents) ──────────────────────────────────────────────────

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const res = await this.client(credentials).get<DocumentListResponse>(
      '/documents',
      this.listParams(params),
    )
    return unwrapList(res).map(transformEnvelope)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const res = await this.client(credentials).get<DocumentDetailResponse>(`/documents/${id}`)
    return transformEnvelope(unwrapDetail(res, id))
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Envelope> {
    await this.client(credentials).post(`/documents/${id}/void`, {
      reason: data?.reason ?? 'Voided by API',
    })
    return this.getEnvelope(credentials, id)
  }

  // ── Signers (embedded on the document) ─────────────────────────────────────

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    _params: QueryParams,
  ): Promise<Signer[]> {
    const res = await this.client(credentials).get<DocumentDetailResponse>(
      `/documents/${envelopeId}`,
    )
    const doc = unwrapDetail(res, envelopeId)
    return (doc.signers ?? []).map((s, i) => transformSigner(s, envelopeId, i))
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    const [envelopeId, signerId] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId || !signerId) {
      throw new Error('getSigner expects an id of shape "<envelopeId>:<signerId>"')
    }
    const all = await this.listSigners(credentials, envelopeId, {})
    const found = all.find((s) => s.externalId === signerId)
    if (!found) throw new Error(`Signer ${signerId} not found on document ${envelopeId}`)
    return found
  }

  // ── Documents (single file per document — metadata only, no content) ───────

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    _params: QueryParams,
  ): Promise<Document[]> {
    const res = await this.client(credentials).get<DocumentDetailResponse>(
      `/documents/${envelopeId}`,
    )
    return [transformDocument(unwrapDetail(res, envelopeId))]
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const res = await this.client(credentials).get<DocumentDetailResponse>(`/documents/${id}`)
    return transformDocument(unwrapDetail(res, id))
  }

  // ── Audit-trail entries — synthesised from document + signer timestamps ────

  async listAuditTrailEntries(
    credentials: Credentials,
    envelopeId: string,
    _params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    const res = await this.client(credentials).get<DocumentDetailResponse>(
      `/documents/${envelopeId}`,
    )
    const doc = unwrapDetail(res, envelopeId)
    const events: SyntheticAuditEvent[] = []

    if (doc.created_at) {
      events.push({ envelopeId, occurredAt: doc.created_at, type: 'created', description: 'Document created' })
    }
    if (doc.sent_at) {
      events.push({ envelopeId, occurredAt: doc.sent_at, type: 'sent', description: 'Document sent for signature' })
    }
    for (const s of doc.signers ?? []) {
      const actor = { actorId: s.id ?? s.email, actorEmail: s.email, actorName: s.name ?? s.full_name }
      if (s.viewed_at) {
        events.push({ envelopeId, occurredAt: s.viewed_at, type: 'viewed', description: 'Signer viewed the document', ...actor })
      }
      if (s.signed_at) {
        events.push({ envelopeId, occurredAt: s.signed_at, type: 'signed', description: 'Signer signed the document', ...actor })
      }
      if (s.declined_at) {
        events.push({ envelopeId, occurredAt: s.declined_at, type: 'declined', description: s.decline_reason ?? 'Signer declined the document', ...actor })
      }
    }
    if (doc.completed_at) {
      events.push({ envelopeId, occurredAt: doc.completed_at, type: 'completed', description: 'Document completed' })
    }
    if (doc.voided_at) {
      events.push({ envelopeId, occurredAt: doc.voided_at, type: 'voided', description: 'Document voided' })
    }

    events.sort((a, b) => {
      const ta = a.occurredAt ? Date.parse(a.occurredAt) : 0
      const tb = b.occurredAt ? Date.parse(b.occurredAt) : 0
      return ta - tb
    })
    return events.map((e, i) => transformAuditTrailEntry(e, i))
  }

  async getAuditTrailEntry(credentials: Credentials, id: string): Promise<AuditTrailEntry> {
    const [envelopeId, indexStr] = id.split(':')
    if (!envelopeId || !indexStr) {
      throw new Error('getAuditTrailEntry expects an id of shape "<envelopeId>:<index>"')
    }
    const all = await this.listAuditTrailEntries(credentials, envelopeId, {})
    const found = all[Number(indexStr)]
    if (!found) throw new Error(`Audit entry ${id} not found`)
    return found
  }
}
