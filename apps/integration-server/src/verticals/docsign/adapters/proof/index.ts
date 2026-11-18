/**
 * Proof (proof.com) adapter.
 *
 * Maps Proof `transactions` → canonical `Envelope`, the transaction's inline
 * `signers` → `Signer`, the inline `documents` manifest → `Document`
 * (metadata only — content REFUSED), and the transaction lifecycle +
 * `notarization_records` → synthesised `AuditTrailEntry`. Proof's notarized
 * meeting record IS the compliance evidence, so the audit trail is surfaced
 * as a first-class queryable resource.
 *
 * Templates are available via `GET /v1/templates` (Business plan accounts
 * only). The endpoint returns `{ total_count, templates: [{ id, name,
 * permalink, created_at, updated_at }] }`. There is no single-template GET
 * endpoint documented, so `getTemplate` fetches the full list and finds by id.
 *
 * Auth is a single API key (`ApiKey` header) collected via the Connect Link
 * form; the OAuth-shaped BaseAdapter methods are inert stubs.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * All 5 canonical docsign resources are implemented for this adapter.
 */

import { pageLocally, simpleApiKey } from '@opensteward/shared'
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
  exchangeCode as proofExchange,
  refreshCredentials as proofRefresh,
} from './auth'
import { ProofClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { verifyProofWebhook, parseProofWebhookEvents } from './webhook'

import {
  transformEnvelope,
  type RawProofTransaction,
} from './transform/envelope'
import { transformSigner } from './transform/signer'
import { transformDocument } from './transform/document'
import {
  transformAuditTrailEntry,
  type SyntheticProofAuditEvent,
} from './transform/audit-trail-entry'
import {
  transformTemplate,
  type RawProofTemplate,
  type ProofTemplateListResponse,
} from './transform/template'

const SIMPLE_API_KEY_FORM = simpleApiKey({
  label: 'Proof API key',
  helpText:
    'Settings → API keys in your Proof dashboard (app.proof.com). ' +
    'For sandbox (Fairfax), use a key from app.fairfax.proof.com — ' +
    'sandbox keys are prefixed prf_test_ or prf_cli_test_ and route automatically to api.fairfax.proof.com.',
})

interface TransactionListResponse {
  data?: RawProofTransaction[]
  count?: number
  total_count?: number
}

export class ProofAdapter implements DocsignAdapter {
  readonly platform = 'proof'
  readonly version = '0.1.0'

  // Connect Link support — single API-key form (Proof uses the `ApiKey` header).
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return proofExchange(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return proofRefresh(credentials)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyProofWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseProofWebhookEvents(payload)
  }

  private client(credentials: Credentials): ProofClient {
    return new ProofClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const out: Record<string, unknown> = {
      limit,
      offset: typeof params.page === 'number' ? (params.page - 1) * limit : 0,
    }
    if (params.updatedAfter instanceof Date) {
      out.last_updated_date_start = params.updatedAfter.toISOString()
    } else if (params['updated_after']) {
      out.last_updated_date_start = String(params['updated_after'])
    }
    if (params['status']) out.transaction_status = String(params['status'])
    return out
  }

  // ── Envelopes (transactions) ──────────────────────────────────────────────

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const res = await this.client(credentials).get<TransactionListResponse>(
      '/transactions',
      this.listParams(params),
    )
    return (res.data ?? []).map(transformEnvelope)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const raw = await this.client(credentials).get<RawProofTransaction>(`/transactions/${id}`)
    return transformEnvelope(raw)
  }

  // ── Signers (inline on the transaction) ───────────────────────────────────

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    // GET /v1/transactions/{id} has no paging parameter and returns the
    // whole signers[] array inline, so the caller's page is cut here.
    const raw = await this.client(credentials).get<RawProofTransaction>(`/transactions/${envelopeId}`)
    return pageLocally(
      (raw.signers ?? []).map((s) => transformSigner(s, envelopeId)),
      params,
    )
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    const [envelopeId, signerId] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId || !signerId) {
      throw new Error('getSigner expects an id of shape "<transactionId>:<signerId>"')
    }
    const all = await this.listSigners(credentials, envelopeId, {})
    const found = all.find((s) => s.externalId === signerId)
    if (!found) throw new Error(`Signer ${signerId} not found on transaction ${envelopeId}`)
    return found
  }

  // ── Documents (metadata only — content REFUSED) ───────────────────────────

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    // One unpaged GET /v1/transactions/{id} reply holds every document.
    const raw = await this.client(credentials).get<RawProofTransaction>(`/transactions/${envelopeId}`)
    return pageLocally(
      (raw.documents ?? []).map((d, i) => transformDocument(d, envelopeId, i)),
      params,
    )
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const [envelopeId, documentId] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId || !documentId) {
      throw new Error('getDocument expects an id of shape "<transactionId>:<documentId>"')
    }
    const all = await this.listDocuments(credentials, envelopeId, {})
    const found = all.find((d) => d.externalId === documentId)
    if (!found) throw new Error(`Document ${documentId} not found on transaction ${envelopeId}`)
    return found
  }

  // ── Audit-trail entries — synthesised from lifecycle + notarization records ─

  async listAuditTrailEntries(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    const tx = await this.client(credentials).get<RawProofTransaction>(`/transactions/${envelopeId}`)
    const events: SyntheticProofAuditEvent[] = []

    if (tx.date_created) {
      events.push({
        envelopeId,
        occurredAt: tx.date_created,
        type: 'created',
        key: 'created',
        description: 'Transaction created',
      })
    }
    if (tx.activation_time) {
      events.push({
        envelopeId,
        occurredAt: tx.activation_time,
        type: 'sent',
        key: 'activated',
        description: 'Transaction activated and sent to signer',
      })
    }

    for (const [i, rec] of (tx.notarization_records ?? []).entries()) {
      if (rec.meeting_start) {
        events.push({
          envelopeId,
          occurredAt: rec.meeting_start,
          type: 'authenticated',
          key: `notarization-${rec.id ?? i}-start`,
          description: 'Notarization meeting started',
          actorName: rec.notary_name,
        })
      }
      if (rec.meeting_end) {
        events.push({
          envelopeId,
          occurredAt: rec.meeting_end,
          type: 'signed',
          key: `notarization-${rec.id ?? i}-end`,
          description: 'Notarization meeting completed',
          actorName: rec.notary_name,
        })
      }
    }

    const status = (tx.status ?? '').toLowerCase()
    const detailed = (tx.detailed_status ?? '').toLowerCase()
    if (status.startsWith('completed') || detailed.startsWith('complete')) {
      events.push({
        envelopeId,
        occurredAt: tx.date_updated ?? tx.date_created ?? '',
        type: 'completed',
        key: 'completed',
        description: 'Transaction completed',
      })
    } else if (status === 'expired' || detailed === 'expired') {
      events.push({
        envelopeId,
        occurredAt: tx.expiration_time ?? tx.date_updated ?? '',
        type: 'expired',
        key: 'expired',
        description: 'Transaction expired',
      })
    }

    events.sort(
      (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
    )
    // Ids carry the index in the whole sorted trail, so page after mapping.
    return pageLocally(
      events.map((e, i) => transformAuditTrailEntry(e, i)),
      params,
    )
  }

  async getAuditTrailEntry(credentials: Credentials, id: string): Promise<AuditTrailEntry> {
    const [envelopeId, indexStr] = id.split(':')
    if (!envelopeId || !indexStr) {
      throw new Error('getAuditTrailEntry expects an id of shape "<transactionId>:<index>"')
    }
    const all = await this.listAuditTrailEntries(credentials, envelopeId, {})
    const found = all[Number(indexStr)]
    if (!found) throw new Error(`Audit entry ${id} not found`)
    return found
  }

  // ── Templates (Business plan only — GET /v1/templates) ────────────────────
  // Docs: https://dev.proof.com/reference/getalltemplates
  // Response: { total_count: number, templates: [{ id, name, permalink, created_at, updated_at }] }
  // There is no single-template GET endpoint documented; getTemplate fetches
  // the full list and finds by id.

  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const offset = typeof params.page === 'number' ? (params.page - 1) * limit : 0
    const res = await this.client(credentials).get<ProofTemplateListResponse>('/templates', {
      limit,
      offset,
    })
    return (res.templates ?? []).map(transformTemplate)
  }

  async getTemplate(credentials: Credentials, id: string): Promise<Template> {
    // Fetch all templates (up to MAX_PAGE_SIZE) and find by id or permalink.
    const res = await this.client(credentials).get<ProofTemplateListResponse>('/templates', {
      limit: MAX_PAGE_SIZE,
      offset: 0,
    })
    const all: RawProofTemplate[] = res.templates ?? []
    const raw = all.find((t) => t.id === id || t.permalink === id)
    if (!raw) throw new Error(`Template ${id} not found`)
    return transformTemplate(raw)
  }
}
