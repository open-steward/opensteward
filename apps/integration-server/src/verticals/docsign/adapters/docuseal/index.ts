/**
 * DocuSeal adapter — open-source e-signature platform.
 *
 * Maps DocuSeal `submissions` → canonical `Envelope`, `submitters` → `Signer`,
 * a submission's `documents[]` manifest → `Document` (filename only — download
 * URLs are content and are refused), `submission_events[]` → `AuditTrailEntry`,
 * and `templates` → `Template`.
 *
 * Auth is a static API key in the `X-Auth-Token` header (no OAuth); credential
 * entry uses the Connect Link single-API-key form. DocuSeal archives (deletes)
 * submissions rather than voiding them, so `voidEnvelope` is intentionally not
 * implemented and the router returns 501 for it.
 *
 * Docs: https://www.docuseal.com/docs/api
 */

import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  pageLocally,
  reportUpstreamPage,
  simpleApiKey,
} from '@opensteward/shared'
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
  exchangeCode as docusealExchange,
  refreshCredentials as docusealRefresh,
  resolveBaseUrl,
} from './auth'
import { DocusealClient, type DocusealListResponse } from './client'
import { API_BASE_URL, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { verifyDocusealWebhook, parseDocusealWebhookEvents } from './webhook'

import { transformEnvelope, type RawDocusealSubmission } from './transform/envelope'
import { transformSigner, type RawDocusealSubmitter } from './transform/signer'
import { transformDocument, type RawDocusealDocument } from './transform/document'
import {
  transformAuditTrailEntry,
  type RawDocusealSubmissionEvent,
  type AuditActor,
} from './transform/audit-trail-entry'
import { transformTemplate, type RawDocusealTemplate } from './transform/template'

const SIMPLE_API_KEY_FORM = simpleApiKey({
  label: 'DocuSeal API key',
  helpText: 'Find this in the DocuSeal console under Settings → API.',
})

interface SubmissionDocumentsResponse {
  id?: number
  documents?: RawDocusealDocument[]
}

export class DocusealAdapter implements DocsignAdapter {
  readonly platform = 'docuseal'
  readonly version = '0.1.0'
  /** Honours `params.search`; see AdapterCapabilities. Declared so the
   *  router can refuse the parameter on adapters that would drop it. */
  readonly capabilities = { search: true, maxPageSize: MAX_PAGE_SIZE }

  // Connect Link support — single API-key form (X-Auth-Token).
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  getAuthUrl(): string {
    return buildAuthUrl()
  }

  async exchangeCode(): Promise<Credentials> {
    return docusealExchange()
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return docusealRefresh(credentials)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyDocusealWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseDocusealWebhookEvents(payload)
  }

  private client(credentials: Credentials): DocusealClient {
    return new DocusealClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      limit: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    }
    if (params['after'] != null) out.after = params['after']
    if (params['before'] != null) out.before = params['before']
    if (params['template_id'] != null) out.template_id = params['template_id']
    if (params['status'] != null) out.status = String(params['status'])
    if (params['q'] != null) out.q = String(params['q'])
    else if (params.search) out.q = params.search
    return out
  }

  /**
   * One caller page of an id-cursor list (`/submissions`, `/templates`).
   *
   * DocuSeal pages by `after`: "Pass ID value from the `pagination.next`
   * response to load the next batch" (docs/api/list-all-submissions.md,
   * list-all-templates.md). `pagination.next` is the last row's id on every
   * non-empty page, so it never signals the end by itself: a page shorter than
   * the `limit` sent is the last one. A caller-supplied `after` is where page 1
   * starts.
   */
  private async listByCursor<R extends { id: number }>(
    credentials: Credentials,
    path: '/submissions' | '/templates',
    params: QueryParams,
  ): Promise<R[]> {
    const client = this.client(credentials)
    const base = this.listParams(params)
    const { after: startAfter, ...query } = base
    const limit = query.limit as number
    const key = cursorPagerKey(
      connectionScope(resolveBaseUrl(credentials, API_BASE_URL), credentials),
      path,
      { ...query, start_after: startAfter },
    )
    const result = await pageByCursor<R, unknown>(key, params.page, async (cursor) => {
      const after = cursor ?? startAfter
      const res = await client.get<DocusealListResponse<R>>(
        path,
        after != null ? { ...query, after } : query,
      )
      const rows = res.data ?? []
      const next = res.pagination?.next
      return { items: rows, next: rows.length >= limit && next != null ? next : undefined }
    })
    reportUpstreamPage(params, { hasMore: result.hasMore })
    return result.items
  }

  // ── Envelopes (submissions) ────────────────────────────────────────────────

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const rows = await this.listByCursor<RawDocusealSubmission>(credentials, '/submissions', params)
    return rows.map(transformEnvelope)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const raw = await this.client(credentials).get<RawDocusealSubmission>(`/submissions/${id}`)
    return transformEnvelope(raw)
  }

  // ── Signers (submitters) ────────────────────────────────────────────────────

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    // GET /submissions/{id} takes only the id and returns every submitter, so
    // the caller's page is cut from the whole list here.
    const raw = await this.client(credentials).get<RawDocusealSubmission>(`/submissions/${envelopeId}`)
    return pageLocally(
      (raw.submitters ?? []).map((s) => transformSigner(s, envelopeId)),
      params,
    )
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    const raw = await this.client(credentials).get<RawDocusealSubmitter>(`/submitters/${id}`)
    return transformSigner(raw, raw.submission_id ?? id)
  }

  // ── Documents (metadata only — download URLs REFUSED) ───────────────────────

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    // GET /submissions/{id}/documents takes only the id (and `merge`) and
    // returns every document. Page after mapping so index-derived ids stay
    // stable across pages.
    const res = await this.client(credentials).get<SubmissionDocumentsResponse>(
      `/submissions/${envelopeId}/documents`,
    )
    return pageLocally(
      (res.documents ?? []).map((raw, i) => transformDocument(raw, envelopeId, i)),
      params,
    )
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const [envelopeId, orderStr] = id.split(':')
    if (!envelopeId || orderStr === undefined) {
      throw new Error('getDocument expects an id of shape "<submissionId>:<order>"')
    }
    const all = await this.listDocuments(credentials, envelopeId, {})
    const found = all[Number(orderStr)]
    if (!found) throw new Error(`Document ${id} not found`)
    return found
  }

  // ── Audit-trail entries (submission_events) ─────────────────────────────────

  private async auditEntries(
    credentials: Credentials,
    envelopeId: string,
  ): Promise<AuditTrailEntry[]> {
    const raw = await this.client(credentials).get<RawDocusealSubmission>(`/submissions/${envelopeId}`)
    const actorsBySubmitter = new Map<number, AuditActor>()
    for (const s of raw.submitters ?? []) {
      actorsBySubmitter.set(s.id, {
        email: s.email ?? undefined,
        name: s.name ?? undefined,
      })
    }
    const events: RawDocusealSubmissionEvent[] = raw.submission_events ?? []
    return events.map((e, i) =>
      transformAuditTrailEntry(
        e,
        envelopeId,
        i,
        e.submitter_id != null ? (actorsBySubmitter.get(e.submitter_id) ?? {}) : {},
      ),
    )
  }

  async listAuditTrailEntries(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    // One submission carries its whole submission_events[]; index it whole, then page.
    return pageLocally(await this.auditEntries(credentials, envelopeId), params)
  }

  async getAuditTrailEntry(credentials: Credentials, id: string): Promise<AuditTrailEntry> {
    const [envelopeId, indexStr] = id.split(':')
    if (!envelopeId || indexStr === undefined) {
      throw new Error('getAuditTrailEntry expects an id of shape "<submissionId>:<index>"')
    }
    const all = await this.auditEntries(credentials, envelopeId)
    const found = all.find((e) => e.id === id) ?? all[Number(indexStr)]
    if (!found) throw new Error(`Audit entry ${id} not found`)
    return found
  }

  // ── Templates ───────────────────────────────────────────────────────────────

  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    const rows = await this.listByCursor<RawDocusealTemplate>(credentials, '/templates', params)
    return rows.map(transformTemplate)
  }

  async getTemplate(credentials: Credentials, id: string): Promise<Template> {
    const raw = await this.client(credentials).get<RawDocusealTemplate>(`/templates/${id}`)
    return transformTemplate(raw)
  }
}
