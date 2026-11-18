/**
 * Box Sign adapter.
 *
 * Maps Box Sign `sign_requests` → canonical `Envelope`, `signers[]` →
 * `Signer`, `source_files[]` → `Document` (metadata only), per-signer
 * timestamp tuples → synthesised `AuditTrailEntry` (Box has no separate
 * audit endpoint), and `sign_templates` → `Template`.
 *
 * Box Sign rides Box's OAuth — same client id/secret as Box Files.
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

import {
  buildAuthUrl,
  exchangeCode as boxExchange,
  refreshCredentials as boxRefresh,
} from './auth'
import { BoxSignClient } from './client'
import { DEFAULT_PAGE_SIZE, DEFAULT_SCOPES } from './constants'
import {
  verifyBoxSignWebhook,
  parseBoxSignWebhookEvents,
} from './webhook'

import {
  transformEnvelope,
  type RawBoxSignRequest,
  type RawBoxSignSigner as RawSignerWithinRequest,
  type RawBoxSignSourceFile as RawSourceFileInRequest,
} from './transform/envelope'
import {
  transformSigner,
  type RawBoxSignSigner,
} from './transform/signer'
import {
  transformDocument,
  type RawBoxSignSourceFile,
} from './transform/document'
import {
  transformAuditTrailEntry,
  type SyntheticBoxSignAuditEvent,
} from './transform/audit-trail-entry'
import {
  transformTemplate,
  type RawBoxSignTemplate,
} from './transform/template'

export interface BoxSignAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

interface SignRequestsListResponse {
  entries?: RawBoxSignRequest[]
  limit?: number
  next_marker?: string
  prev_marker?: string
}

interface SignTemplatesListResponse {
  entries?: RawBoxSignTemplate[]
  limit?: number
  next_marker?: string
  prev_marker?: string
}

export class BoxSignAdapter implements DocsignAdapter {
  readonly platform = 'box-sign'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: BoxSignAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return boxExchange(code, redirectUri, this.clientId, this.clientSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return boxRefresh(credentials, this.clientId, this.clientSecret)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyBoxSignWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseBoxSignWebhookEvents(payload)
  }

  private client(credentials: Credentials): BoxSignClient {
    return new BoxSignClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    if (params['cursor']) out.marker = String(params['cursor'])
    if (params.page && params.page > 1) {
      out.offset = (params.page - 1) * (params.limit ?? DEFAULT_PAGE_SIZE)
    }
    if (params['senderEmails']) out.senders = String(params['senderEmails'])
    return out
  }

  // ── Envelopes (sign_requests) ────────────────────────────────────────────

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const res = await this.client(credentials).get<SignRequestsListResponse>(
      '/sign_requests',
      this.listParams(params),
    )
    return (res.entries ?? []).map(transformEnvelope)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const raw = await this.client(credentials).get<RawBoxSignRequest>(
      `/sign_requests/${id}`,
    )
    return transformEnvelope(raw)
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Envelope> {
    await this.client(credentials).post(`/sign_requests/${id}/cancel`)
    return this.getEnvelope(credentials, id)
  }

  // ── Signers ──────────────────────────────────────────────────────────────

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    // GET /sign_requests/{sign_request_id} takes only the path id and returns
    // the whole signers[] array, so the caller's page is cut from it here.
    const raw = await this.client(credentials).get<RawBoxSignRequest>(
      `/sign_requests/${envelopeId}`,
    )
    return pageLocally(
      (raw.signers ?? []).map((s: RawSignerWithinRequest) =>
        transformSigner(s as RawBoxSignSigner, envelopeId),
      ),
      params,
    )
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    const [envelopeId, signerId] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId || !signerId) {
      throw new Error('Box Sign getSigner expects id of shape "<signRequestId>:<signerId>"')
    }
    const all = await this.listSigners(credentials, envelopeId, {})
    const found = all.find((s) => s.externalId === signerId)
    if (!found) throw new Error(`Box Sign signer ${signerId} not found on sign_request ${envelopeId}`)
    return found
  }

  // ── Documents (source_files[]) — metadata only ───────────────────────────

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    // The whole source_files[] array comes in one reply. Page after mapping so
    // the index-derived ids stay stable across pages.
    const raw = await this.client(credentials).get<RawBoxSignRequest>(
      `/sign_requests/${envelopeId}`,
    )
    return pageLocally(
      (raw.source_files ?? []).map((f: RawSourceFileInRequest, i: number) =>
        transformDocument(f as RawBoxSignSourceFile, envelopeId, i),
      ),
      params,
    )
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const [envelopeId, documentId] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId || !documentId) {
      throw new Error('Box Sign getDocument expects id of shape "<signRequestId>:<sourceFileId>"')
    }
    const all = await this.listDocuments(credentials, envelopeId, {})
    const found = all.find((d) => d.externalId === documentId)
    if (!found) throw new Error(`Box Sign document ${documentId} not found on sign_request ${envelopeId}`)
    return found
  }

  // ── Audit-trail entries — synthesised from signer timestamps ─────────────

  async listAuditTrailEntries(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    const raw = await this.client(credentials).get<RawBoxSignRequest>(
      `/sign_requests/${envelopeId}`,
    )
    const events: SyntheticBoxSignAuditEvent[] = []
    if (raw.created_at) {
      events.push({
        envelopeId,
        occurredAtIso: raw.created_at,
        type: 'created',
        description: 'Sign request created',
      })
    }
    for (const s of raw.signers ?? []) {
      const sigId = s.id != null ? String(s.id) : undefined
      const email = typeof s.email === 'string' ? s.email : undefined
      const name = typeof s.name === 'string' ? s.name : undefined
      if (s.email_sent_at) {
        events.push({
          envelopeId,
          occurredAtIso: s.email_sent_at,
          type: 'sent',
          description: 'Signer email sent',
          signerId: sigId,
          signerEmail: email,
          signerName: name,
        })
      }
      if (s.viewed_at) {
        events.push({
          envelopeId,
          occurredAtIso: s.viewed_at,
          type: 'viewed',
          description: 'Signer viewed the document',
          signerId: sigId,
          signerEmail: email,
          signerName: name,
        })
      }
      if (s.signer_decision?.type === 'signed' && s.signer_decision.finalized_at) {
        events.push({
          envelopeId,
          occurredAtIso: s.signer_decision.finalized_at,
          type: 'signed',
          description: 'Signer signed',
          signerId: sigId,
          signerEmail: email,
          signerName: name,
        })
      }
      if (s.signer_decision?.type === 'declined' && s.signer_decision.finalized_at) {
        events.push({
          envelopeId,
          occurredAtIso: s.signer_decision.finalized_at,
          type: 'declined',
          description: s.signer_decision.additional_info ?? 'Signer declined',
          signerId: sigId,
          signerEmail: email,
          signerName: name,
        })
      }
    }
    if (raw.is_signature_collected && raw.is_signature_collected_at) {
      events.push({
        envelopeId,
        occurredAtIso: raw.is_signature_collected_at,
        type: 'completed',
        description: 'All signatures collected',
      })
    }
    events.sort((a, b) => Date.parse(a.occurredAtIso) - Date.parse(b.occurredAtIso))
    // Synthesised from one sign-request reply: index the whole list, then page it.
    return pageLocally(
      events.map((e, i) => transformAuditTrailEntry(e, i)),
      params,
    )
  }

  async getAuditTrailEntry(credentials: Credentials, id: string): Promise<AuditTrailEntry> {
    const [envelopeId, indexStr] = id.split(':')
    if (!envelopeId || !indexStr) {
      throw new Error('Box Sign audit-trail id expects shape "<signRequestId>:<index>"')
    }
    const all = await this.listAuditTrailEntries(credentials, envelopeId, {})
    const found = all[Number(indexStr)]
    if (!found) throw new Error(`Box Sign audit entry ${id} not found`)
    return found
  }

  // ── Templates ────────────────────────────────────────────────────────────

  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    const res = await this.client(credentials).get<SignTemplatesListResponse>(
      '/sign_templates',
      this.listParams(params),
    )
    return (res.entries ?? []).map(transformTemplate)
  }

  async getTemplate(credentials: Credentials, id: string): Promise<Template> {
    const raw = await this.client(credentials).get<RawBoxSignTemplate>(
      `/sign_templates/${id}`,
    )
    return transformTemplate(raw)
  }
}
