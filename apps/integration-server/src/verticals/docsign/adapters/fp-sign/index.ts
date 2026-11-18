/**
 * FP Sign adapter (FP Sign REST API v1_2).
 *
 * FP Sign (FP Digital Business) is a German qualified trust-service
 * e-signature platform. Maps FP Sign `workflows` → canonical `Envelope`,
 * workflow `jobs` → `Signer`, workflow `documents` → `Document` (metadata
 * only — base64 content is dropped at the transform boundary),
 * `/intents/workflowtemplates` → `Template`, and `TraceLogEntry` records
 * from `GET /trace-logs` → `AuditTrailEntry`.
 *
 * Auth: Bearer token from `POST /login` plus a `Tenant` header. No
 * interactive OAuth flow, so `getAuthUrl()` throws and credentials are
 * collected via the Connect Link `credentialFields()` form.
 *
 * Pagination: FP Sign list endpoints take no paging parameter and return
 * every id in the collection; detail endpoints take a comma-joined id list.
 * Each list method pages the whole id list locally (`pageLocally`) and
 * hydrates only the caller's page of ids. `GET /trace-logs` returns a flat array
 * directly (no id-fan-out pattern) and has no per-workflow filter, so
 * `listAuditTrailEntries` fetches all tenant trace logs and filters
 * client-side by matching `target` to the requested envelope id.
 *
 * Webhooks are not implemented: the public API documents no signed inbound
 * webhook delivery.
 *
 * ── Resource coverage ──────────────────────────────────────────────────────
 * All 5 canonical docsign resources are available via the FP Sign API.
 */
import {
  pageLocally,
  type Credentials,
  type CredentialField,
  type QueryParams,
} from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { AuditTrailEntry } from '../../schema/audit-trail-entry'
import type { Template } from '../../schema/template'

import {
  FP_SIGN_CREDENTIAL_FIELDS,
  exchangeFpSignCredentials,
  refreshFpSignCredentials,
} from './auth'
import { FpSignClient } from './client'

import { transformEnvelope, type RawFpSignWorkflow } from './transform/envelope'
import { transformSigner, type RawFpSignJob } from './transform/signer'
import { transformDocument, type RawFpSignDocument } from './transform/document'
import { transformTemplate, type RawFpSignTemplate } from './transform/template'
import {
  transformAuditTrailEntry,
  type RawFpSignTraceLogEntry,
} from './transform/audit-trail-entry'

export interface FpSignAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

export class FpSignAdapter implements DocsignAdapter {
  readonly platform = 'fp-sign'
  readonly version = '0.1.0'

  // FP Sign uses username/password → Bearer auth, so the OAuth config fields
  // are accepted for factory-shape parity but unused.
  constructor(_config: FpSignAdapterConfig) {
    void _config
  }

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    throw new Error(
      'fp-sign uses Bearer-token auth from POST /login; use credentialFields() instead',
    )
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error(
      'fp-sign uses Bearer-token auth from POST /login; use exchangeCredentials() instead',
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshFpSignCredentials(credentials)
  }

  credentialFields(): CredentialField[] {
    return FP_SIGN_CREDENTIAL_FIELDS
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return exchangeFpSignCredentials(fields)
  }

  private client(credentials: Credentials): FpSignClient {
    return new FpSignClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    if (params['email']) out.email = String(params['email'])
    if (params['status']) out.status = String(params['status'])
    return out
  }

  // ── Envelopes (workflows) ─────────────────────────────────────────────────

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const client = this.client(credentials)
    const ids = pageLocally(await client.ids('/workflows', this.listParams(params)), params)
    const workflows = await client.hydrate<RawFpSignWorkflow>(ids, (i) => `/workflows/${i}`)
    return workflows.map(transformEnvelope)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const client = this.client(credentials)
    const workflows = await client.get<RawFpSignWorkflow[]>(`/workflows/${id}`)
    const raw = workflows[0]
    if (!raw) throw new Error(`FP Sign workflow ${id} not found`)
    const envelope = transformEnvelope(raw)
    // Hydrate the cross-referenced ids from the dedicated sub-resource lists.
    const [jobIds, documentIds] = await Promise.all([
      client.get<Array<number | string>>(`/workflows/${id}/jobs`).catch(() => []),
      client.get<Array<number | string>>(`/workflows/${id}/attachments`).catch(() => []),
    ])
    envelope.signerIds = (Array.isArray(jobIds) ? jobIds : []).map((j) => String(j))
    envelope.documentIds = (Array.isArray(documentIds) ? documentIds : []).map((d) => String(d))
    return envelope
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Envelope> {
    await this.client(credentials).post(`/workflows/${id}/intents/cancel`)
    return this.getEnvelope(credentials, id)
  }

  // ── Signers (workflow jobs) ───────────────────────────────────────────────

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    const client = this.client(credentials)
    const ids = pageLocally(await client.ids(`/workflows/${envelopeId}/jobs`), params)
    const jobs = await client.hydrate<RawFpSignJob>(
      ids,
      (i) => `/workflows/${envelopeId}/jobs/${i}`,
    )
    return jobs.map((j) => transformSigner(j, envelopeId))
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    const [envelopeId, jobId] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId || !jobId) {
      throw new Error('fp-sign getSigner expects an id of shape "<envelopeId>:<jobId>"')
    }
    const jobs = await this.client(credentials).get<RawFpSignJob[]>(
      `/workflows/${envelopeId}/jobs/${jobId}`,
    )
    const raw = jobs[0]
    if (!raw) throw new Error(`FP Sign job ${jobId} not found on workflow ${envelopeId}`)
    return transformSigner(raw, envelopeId)
  }

  // ── Documents (metadata only — content REFUSED) ──────────────────────────

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    const client = this.client(credentials)
    const all = await client.ids(`/workflows/${envelopeId}/attachments`)
    // Page (id, position) pairs so `order` stays absolute across pages.
    const page = pageLocally(
      all.map((id, order) => ({ id, order })),
      params,
    )
    const docs = await client.hydrate<RawFpSignDocument>(
      page.map((p) => p.id),
      (i) => `/workflows/${envelopeId}/attachments/${i}`,
    )
    const first = page[0]?.order ?? 0
    return docs.map((d, i) => transformDocument(d, envelopeId, first + i))
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const [envelopeId, documentId] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId || !documentId) {
      throw new Error('fp-sign getDocument expects an id of shape "<envelopeId>:<documentId>"')
    }
    const docs = await this.client(credentials).get<RawFpSignDocument[]>(
      `/workflows/${envelopeId}/attachments/${documentId}`,
    )
    const raw = docs[0]
    if (!raw) throw new Error(`FP Sign document ${documentId} not found on workflow ${envelopeId}`)
    return transformDocument(raw, envelopeId, 0)
  }

  // ── Audit-trail entries (trace logs) ─────────────────────────────────────
  //
  // FP Sign's `GET /trace-logs` returns all tenant-scoped TraceLogEntry
  // records (domain, dateCreated, message, initiator, target). There is no
  // per-workflow filter parameter, so we fetch the full list and filter
  // client-side by matching `target` to the requested envelopeId. The
  // workflow-scoped endpoint (`GET /workflows/{id}/logs/audit`) returns a PDF
  // and is therefore unusable for structured entries.

  async listAuditTrailEntries(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    const entries = await this.client(credentials).get<RawFpSignTraceLogEntry[]>('/trace-logs')
    const all = Array.isArray(entries) ? entries : []
    // Filter to entries whose `target` references this envelope.
    const filtered = all.filter(
      (e) => e.target !== undefined && String(e.target).includes(String(envelopeId)),
    )
    // Ids carry the position in the whole filtered list, so map before paging.
    return pageLocally(
      filtered.map((e, i) => transformAuditTrailEntry(e, envelopeId, i)),
      params,
    )
  }

  async getAuditTrailEntry(credentials: Credentials, id: string): Promise<AuditTrailEntry> {
    // id is synthesised as "audit:<envelopeId>:<occurredAt>:<index>" — split
    // to recover envelopeId and re-fetch the filtered list.
    const parts = id.split(':')
    // Format: audit : <envelopeId> : <isoDate> : <index>
    // envelopeId is at index 1; index is the last segment.
    const envelopeId = parts[1] ?? ''
    const idx = Number(parts[parts.length - 1])
    const entries = await this.listAuditTrailEntries(credentials, envelopeId, {})
    const entry = Number.isFinite(idx) ? entries[idx] : entries.find((e) => e.id === id)
    if (!entry) throw new Error(`FP Sign audit trail entry ${id} not found`)
    return entry
  }

  // ── Templates ────────────────────────────────────────────────────────────

  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    const res = await this.client(credentials).get<RawFpSignTemplate[]>(
      '/intents/workflowtemplates',
    )
    return pageLocally((Array.isArray(res) ? res : []).map(transformTemplate), params)
  }

  async getTemplate(credentials: Credentials, id: string): Promise<Template> {
    const res = await this.client(credentials).get<RawFpSignTemplate[]>(
      '/intents/workflowtemplates',
    )
    const found = (Array.isArray(res) ? res : []).find((t) => String(t.id) === id)
    if (!found) throw new Error(`FP Sign template ${id} not found`)
    return transformTemplate(found)
  }
}
