/**
 * Signable adapter — UK e-signature platform (api.signable.co.uk/v1).
 *
 * Maps Signable envelopes → canonical `Envelope`, the envelope's
 * `envelope_parties` → `Signer`, `envelope_documents` (metadata only) →
 * `Document`, `envelope_history` → `AuditTrailEntry`, and templates →
 * `Template`.
 *
 * Auth is a single long-lived API key supplied via HTTP Basic (key as the
 * username, literal `x` as the password). The Connect Link flow collects it
 * via the shared `simpleApiKey` template; there is no OAuth and no refresh.
 *
 * Signable does not HMAC-sign its webhook deliveries (they are
 * form-urlencoded POSTs with no signature header), so the adapter does not
 * implement `verifyWebhook` / `parseWebhookEvents`.
 *
 * The signers, documents and audit-trail surfaces are all served from the
 * single `GET /envelopes/{fingerprint}` detail call — Signable nests those
 * inside the envelope rather than exposing them as standalone collections.
 */

import { pageLocally, pageOffset, reportUpstreamPage, simpleApiKey } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { AuditTrailEntry } from '../../schema/audit-trail-entry'
import type { Template } from '../../schema/template'

import {
  buildAuthUrl,
  exchangeCode as signableExchange,
  refreshCredentials as signableRefresh,
} from './auth'
import { SignableClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformEnvelope, type RawSignableEnvelope } from './transform/envelope'
import { transformSigner } from './transform/signer'
import { transformDocument } from './transform/document'
import {
  transformAuditTrailEntry,
  type RawSignableHistoryEvent,
} from './transform/audit-trail-entry'
import { transformTemplate, type RawSignableTemplate } from './transform/template'

const SIMPLE_API_KEY_FORM = simpleApiKey({
  label: 'API key',
  placeholder: 'sk_live_xxxxxxxxxxxxxxxxxxxxxxxx',
  helpText:
    'Generate a key under Company Settings → API & Webhooks in your Signable account. Use a test key for sandbox-style testing.',
})

interface EnvelopeListResponse {
  http?: number
  offset?: number
  limit?: number
  total_envelopes?: string
  envelopes?: RawSignableEnvelope[]
}

interface EnvelopeDetailResponse extends RawSignableEnvelope {
  envelope_history?: RawSignableHistoryEvent[]
}

interface TemplatesListResponse {
  http?: number
  offset?: number
  limit?: number
  total_templates?: string
  templates?: RawSignableTemplate[]
}

export class SignableAdapter implements DocsignAdapter {
  readonly platform = 'signable'
  readonly version = '0.1.0'
  /** Honours `params.search`; see AdapterCapabilities. Declared so the
   *  router can refuse the parameter on adapters that would drop it. */
  readonly capabilities = { search: true, maxPageSize: MAX_PAGE_SIZE }

  // Connect Link support — single API-key form (Signable has no OAuth).
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  getAuthUrl(state: string): string {
    return buildAuthUrl('', '', [], state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return signableExchange(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return signableRefresh(credentials)
  }

  private client(credentials: Credentials): SignableClient {
    return new SignableClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    // Signable pages by `offset` + `limit`, and a limit over 50 is served as
    // 10, so the size is clamped to 50 and the offset strides by the size
    // actually sent. Reported so a direct call past 50 is judged at 50.
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    reportUpstreamPage(params, { pageSize: limit })
    const out: Record<string, unknown> = {
      offset: pageOffset(params, limit),
      limit,
    }
    if (params['status']) out.status = String(params['status'])
    if (params.search) out.q = String(params.search)
    else if (params['q']) out.q = String(params['q'])
    return out
  }

  /** `total_<resource>` is the documented match count (a string); it makes hasMore exact. */
  private reportTotal(
    params: QueryParams,
    sent: Record<string, unknown>,
    served: number,
    total: string | undefined,
  ): void {
    const count = total === undefined ? NaN : Number(total)
    if (!Number.isInteger(count) || count < 0) return
    reportUpstreamPage(params, {
      totalCount: count,
      hasMore: (sent.offset as number) + served < count,
    })
  }

  // ── Envelopes ───────────────────────────────────────────────────────────────

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const query = this.listParams(params)
    const res = await this.client(credentials).get<EnvelopeListResponse>('/envelopes', query)
    const rows = res.envelopes ?? []
    this.reportTotal(params, query, rows.length, res.total_envelopes)
    return rows.map(transformEnvelope)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const raw = await this.client(credentials).get<EnvelopeDetailResponse>(`/envelopes/${id}`)
    return transformEnvelope(raw)
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Envelope> {
    // Signable cancels a sent envelope via PUT /envelopes/{fingerprint}/cancel.
    await this.client(credentials).put(`/envelopes/${id}/cancel`)
    return this.getEnvelope(credentials, id)
  }

  // ── Signers (envelope_parties on the envelope detail) ───────────────────────

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    // The detail call takes no paging parameter and nests every party.
    const raw = await this.client(credentials).get<EnvelopeDetailResponse>(
      `/envelopes/${envelopeId}`,
    )
    const all = (raw.envelope_parties ?? []).map((p, i) => transformSigner(p, envelopeId, i))
    return pageLocally(all, params)
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    // Signable has no party-by-id endpoint; address via "<envelopeId>:<partyId>".
    const [envelopeId, partyId] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId || !partyId) {
      throw new Error('getSigner expects an id of shape "<envelopeFingerprint>:<partyId>"')
    }
    const all = await this.listSigners(credentials, envelopeId, {})
    const found = all.find((s) => s.externalId === partyId)
    if (!found) throw new Error(`Party ${partyId} not found on envelope ${envelopeId}`)
    return found
  }

  // ── Documents (envelope_documents — metadata only, content REFUSED) ─────────

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    // The detail call takes no paging parameter and nests every document.
    const raw = await this.client(credentials).get<EnvelopeDetailResponse>(
      `/envelopes/${envelopeId}`,
    )
    const all = (raw.envelope_documents ?? []).map((d, i) => transformDocument(d, envelopeId, i))
    return pageLocally(all, params)
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    // Address via "<envelopeId>:<documentFingerprint>".
    const [envelopeId, documentFingerprint] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId || !documentFingerprint) {
      throw new Error('getDocument expects an id of shape "<envelopeFingerprint>:<documentFingerprint>"')
    }
    const all = await this.listDocuments(credentials, envelopeId, {})
    const found = all.find((d) => d.externalId === documentFingerprint)
    if (!found) throw new Error(`Document ${documentFingerprint} not found on envelope ${envelopeId}`)
    return found
  }

  // ── Audit-trail entries (envelope_history) ──────────────────────────────────

  async listAuditTrailEntries(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    // The detail call takes no paging parameter and nests the whole history.
    const raw = await this.client(credentials).get<EnvelopeDetailResponse>(
      `/envelopes/${envelopeId}`,
    )
    const all = (raw.envelope_history ?? []).map((e, i) =>
      transformAuditTrailEntry(e, envelopeId, i),
    )
    return pageLocally(all, params)
  }

  async getAuditTrailEntry(credentials: Credentials, id: string): Promise<AuditTrailEntry> {
    const [envelopeId, indexStr] = id.split(':')
    if (!envelopeId || indexStr === undefined) {
      throw new Error('getAuditTrailEntry expects an id of shape "<envelopeFingerprint>:<index>"')
    }
    const all = await this.listAuditTrailEntries(credentials, envelopeId, {})
    const found = all[Number(indexStr)]
    if (!found) throw new Error(`Audit entry ${id} not found`)
    return found
  }

  // ── Templates ───────────────────────────────────────────────────────────────

  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    const query = this.listParams(params)
    const res = await this.client(credentials).get<TemplatesListResponse>('/templates', query)
    const rows = res.templates ?? []
    this.reportTotal(params, query, rows.length, res.total_templates)
    return rows.map(transformTemplate)
  }

  async getTemplate(credentials: Credentials, id: string): Promise<Template> {
    const raw = await this.client(credentials).get<RawSignableTemplate>(`/templates/${id}`)
    return transformTemplate(raw)
  }
}
