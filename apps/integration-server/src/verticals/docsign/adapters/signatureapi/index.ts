/**
 * SignatureAPI adapter.
 *
 * Maps SignatureAPI envelopes → canonical `Envelope`, the envelope's embedded
 * `recipients[]` → `Signer`, its embedded `documents[]` → `Document` (metadata
 * only — content REFUSED), and `GET /envelopes/{id}/events` rows →
 * `AuditTrailEntry` (no single-event read is documented, so
 * `getAuditTrailEntry` refuses with 501).
 *
 * Recipients and documents are NOT separately addressable resources — they
 * live inside the envelope payload — so `getSigner`/`getDocument` accept a
 * composite `<envelopeId>:<id>` id and resolve against the parent envelope.
 *
 * SignatureAPI has no reusable-template REST resource, so `listTemplates`/
 * `getTemplate` are intentionally not implemented (the router auto-501s them).
 *
 * ── Resource coverage ──────────────────────────────────────────────────────
 * Unavailable: template — SignatureAPI templates are DOCX files referenced by
 *   URL at envelope-creation time; there is no /templates REST endpoint and
 *   no listable/gettable template object in the API.
 *
 * Auth is a static API key (`X-API-Key: <key>`) collected via the Connect
 * Link form; there is no OAuth flow, so `getAuthUrl`/`exchangeCode` throw.
 *
 * Docs: https://signatureapi.com/docs/api/welcome
 */

import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  pageLocally,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { Credentials, QueryParams, CredentialField } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { AuditTrailEntry } from '../../schema/audit-trail-entry'
import type { WebhookEvent } from '../../schema/webhook'

import { FORM } from './auth'
import { SignatureapiClient, type SignatureapiList } from './client'
import { LIST_MAX_LIMIT } from './constants'
import {
  verifySignatureapiWebhook,
  parseSignatureapiWebhookEvents,
} from './webhook'

import {
  transformEnvelope,
  type RawSignatureapiEnvelope,
} from './transform/envelope'
import { transformSigner } from './transform/signer'
import { transformDocument } from './transform/document'
import {
  transformAuditTrailEntry,
  type RawSignatureapiEvent,
} from './transform/audit-trail-entry'

export interface SignatureapiAdapterConfig {
  clientId: string
  /** Treated as the API key when supplied via instance config rather than the form. */
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

export class SignatureapiAdapter implements DocsignAdapter {
  readonly platform = 'signatureapi'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: SignatureapiAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? []
  }

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    throw new Error('signatureapi uses static API key auth; use credentialFields() instead')
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('signatureapi uses static API key auth; use exchangeCredentials() instead')
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
    return verifySignatureapiWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseSignatureapiWebhookEvents(payload)
  }

  private client(credentials: Credentials): SignatureapiClient {
    return new SignatureapiClient(credentials)
  }

  // ── Envelopes ─────────────────────────────────────────────────────────────

  /**
   * One caller page of envelopes. `GET /envelopes` takes `limit` ("up to 20.
   * The default is 20.") and answers with `links.next`, an opaque absolute
   * URL for the next page that is `null` on the last one
   * (https://signatureapi.com/docs/api/pagination). One upstream page is one
   * caller page, so page N is reached by following `links.next` N-1 times.
   */
  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const client = this.client(credentials)
    const limit = Math.min(Math.max(1, Math.floor(params.limit ?? LIST_MAX_LIMIT)), LIST_MAX_LIMIT)
    // `ListEnvelopes` documents only `status`, `topic` and `limit`; the next
    // page is reached solely through the opaque `links.next` URL ("Treat these
    // URLs as a opaque strings. Do not try to parse or construct it."), so no
    // caller cursor is forwarded.
    const first: Record<string, unknown> = { limit }
    const key = cursorPagerKey(connectionScope('signatureapi', credentials), '/envelopes', {
      limit,
    })
    const result = await pageByCursor<RawSignatureapiEnvelope, string>(
      key,
      params.page,
      async (next) => {
        const res = next
          ? await client.getAbsolute<SignatureapiList<RawSignatureapiEnvelope>>(next)
          : await client.get<SignatureapiList<RawSignatureapiEnvelope>>('/envelopes', first)
        return { items: res.data ?? [], next: res.links?.next ?? null }
      },
    )
    reportUpstreamPage(params, { hasMore: result.hasMore, pageSize: limit })
    return result.items.map(transformEnvelope)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const raw = await this.client(credentials).get<RawSignatureapiEnvelope>(`/envelopes/${id}`)
    return transformEnvelope(raw)
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Envelope> {
    await this.client(credentials).post(`/envelopes/${id}/cancel`)
    return this.getEnvelope(credentials, id)
  }

  // ── Signers (recipients embedded on the envelope) ─────────────────────────

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    // Recipients are embedded whole in `GET /envelopes/{id}`, which has no
    // paging parameters, so every row is in hand: page locally.
    const raw = await this.client(credentials).get<RawSignatureapiEnvelope>(
      `/envelopes/${envelopeId}`,
    )
    return pageLocally(
      (raw.recipients ?? []).map((r) => transformSigner(r, envelopeId)),
      params,
    )
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    const [envelopeId, recipientId] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId || !recipientId) {
      throw new Error('signatureapi getSigner expects an id of shape "<envelopeId>:<recipientId>"')
    }
    const all = await this.listSigners(credentials, envelopeId, {})
    const found = all.find((s) => s.externalId === recipientId)
    if (!found) throw new Error(`signatureapi recipient ${recipientId} not found on envelope ${envelopeId}`)
    return found
  }

  // ── Documents (embedded on the envelope, metadata only — content REFUSED) ──

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    // Documents are embedded whole in `GET /envelopes/{id}`, which has no
    // paging parameters, so every row is in hand: page locally.
    const raw = await this.client(credentials).get<RawSignatureapiEnvelope>(
      `/envelopes/${envelopeId}`,
    )
    return pageLocally(
      (raw.documents ?? []).map((d, i) => transformDocument(d, envelopeId, i)),
      params,
    )
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const [envelopeId, documentId] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId || !documentId) {
      throw new Error('signatureapi getDocument expects an id of shape "<envelopeId>:<documentId>"')
    }
    const all = await this.listDocuments(credentials, envelopeId, {})
    const found = all.find((d) => d.externalId === documentId)
    if (!found) throw new Error(`signatureapi document ${documentId} not found on envelope ${envelopeId}`)
    return found
  }

  // ── Audit-trail entries (`GET /envelopes/{envelopeId}/events`) ────────────

  /**
   * One caller page of an envelope's events. `ListEnvelopeEvents`
   * (https://spec.signatureapi.com/openapi.yaml): "Returns a list of events for
   * a specific envelope. Events are sorted by timestamp, with the most recent
   * appearing first." It takes `type` and `limit` (1..20, default 20) and
   * "is paginated. Use the `links.next` and `links.previous` URLs to navigate
   * between pages." `links.next` "Returns `null` when you are on the last
   * page", so page N follows `links.next` N-1 times.
   */
  async listAuditTrailEntries(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    const client = this.client(credentials)
    const limit = Math.min(Math.max(1, Math.floor(params.limit ?? LIST_MAX_LIMIT)), LIST_MAX_LIMIT)
    const path = `/envelopes/${encodeURIComponent(envelopeId)}/events`
    const key = cursorPagerKey(connectionScope('signatureapi', credentials), path, { limit })
    const result = await pageByCursor<RawSignatureapiEvent, string>(
      key,
      params.page,
      async (next) => {
        const res = next
          ? await client.getAbsolute<SignatureapiList<RawSignatureapiEvent>>(next)
          : await client.get<SignatureapiList<RawSignatureapiEvent>>(path, { limit })
        return { items: res.data ?? [], next: res.links?.next ?? null }
      },
    )
    reportUpstreamPage(params, { hasMore: result.hasMore, pageSize: limit })
    return result.items.map((e) => transformAuditTrailEntry(e, envelopeId))
  }

  /**
   * The spec documents no single-event read: its only event paths are
   * `GET /events`, `GET /envelopes/{envelopeId}/events` and
   * `GET /recipients/{recipientId}/events`, all lists.
   */
  async getAuditTrailEntry(_credentials: Credentials, _id: string): Promise<AuditTrailEntry> {
    throw Object.assign(
      new Error(
        'SignatureAPI cannot get an audit-trail entry by id: its API documents no GET /events/{eventId}, only the list endpoints GET /events, GET /envelopes/{envelopeId}/events and GET /recipients/{recipientId}/events',
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }
}
