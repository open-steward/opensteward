/**
 * Signaturely adapter — US e-signature platform (api.signaturely.com/api/v1).
 *
 * Maps Signaturely "documents" → canonical `Envelope`, a document's signers →
 * `Signer`, the document activity log → `AuditTrailEntry`, and reusable
 * documents → `Template`.
 *
 * Auth is a single long-lived API key supplied in the
 * `Authorization: Api-Key <key>` header. The Connect Link flow collects it via
 * the shared `simpleApiKey` template; there is no OAuth and no refresh.
 *
 * Signaturely does not expose:
 *   - a single document-by-id read endpoint (only the paginated list), so
 *     `getEnvelope` is intentionally not implemented (router → 501);
 *   - per-file document metadata as an addressable collection (files are
 *     nested under a document's `parts`), so the canonical Document surface is
 *     not implemented either — and the schema refuses file content regardless;
 *   - a single template-by-id read endpoint, so `getTemplate` resolves against
 *     the template list.
 *
 * Signaturely webhooks (`document_sent`, `document_completed`) carry no
 * signing header, so the adapter parses events but does not implement
 * `verifyWebhook`.
 */

import { pageLocally, simpleApiKey } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { AuditTrailEntry } from '../../schema/audit-trail-entry'
import type { Template } from '../../schema/template'
import type { WebhookEvent, WebhookAction } from '../../schema/webhook'

import {
  buildAuthUrl,
  exchangeCode as signaturelyExchange,
  refreshCredentials as signaturelyRefresh,
} from './auth'
import { SignaturelyClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformEnvelope, type RawSignaturelyDocument } from './transform/envelope'
import { transformSigner, type RawSignaturelySigner } from './transform/signer'
import {
  transformAuditTrailEntry,
  type RawSignaturelyActivity,
} from './transform/audit-trail-entry'
import { transformTemplate, type RawSignaturelyTemplate } from './transform/template'
import { transformDocument } from './transform/document'

const SIMPLE_API_KEY_FORM = simpleApiKey({
  label: 'API key',
  placeholder: 'sk_live_xxxxxxxxxxxxxxxxxxxxxxxx',
  helpText:
    'Generate a key under Settings → API in your Signaturely account. It is sent on every request as the "Api-Key" Authorization header.',
})

/** Paginated list wrapper used by the document + template list endpoints. */
interface PagedResponse<T> {
  data?: T[]
  currentPage?: number
  totalPages?: number
  totalItems?: number
  itemsPerPage?: number
  itemCount?: number
}

/** Signaturely webhook deliveries we know how to classify. */
const WEBHOOK_ACTION_MAP: Record<string, WebhookAction> = {
  document_sent: 'sent',
  document_completed: 'completed',
}

export class SignaturelyAdapter implements DocsignAdapter {
  readonly platform = 'signaturely'
  readonly version = '0.1.0'
  /** Honours `params.search`; see AdapterCapabilities. Declared so the
   *  router can refuse the parameter on adapters that would drop it. */
  readonly capabilities = { search: true }

  // Connect Link support — single API-key form (Signaturely has no OAuth).
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  getAuthUrl(state: string): string {
    return buildAuthUrl('', '', [], state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return signaturelyExchange(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return signaturelyRefresh(credentials)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    // Signaturely posts `{ event | type, data | document }`. We accept either
    // shape and surface the document id as the envelope/resource id.
    const type = String(payload['event'] ?? payload['type'] ?? '')
    const data =
      (payload['data'] as Record<string, unknown> | undefined) ??
      (payload['document'] as Record<string, unknown> | undefined) ??
      payload
    const documentId = String(data['id'] ?? data['documentId'] ?? payload['documentId'] ?? '')
    const action = WEBHOOK_ACTION_MAP[type] ?? 'unknown'
    return [
      {
        id: `signaturely:${type}:${documentId}`,
        platform: 'signaturely',
        type,
        resourceType: 'envelopes',
        action,
        resourceId: documentId,
        envelopeId: documentId || undefined,
        payload,
      },
    ]
  }

  private client(credentials: Credentials): SignaturelyClient {
    return new SignaturelyClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      page: typeof params.page === 'number' ? params.page : 1,
      limit: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    }
    if (params['status']) out['status[]'] = String(params['status'])
    if (params.search) out.searchTerm = String(params.search)
    else if (params['searchTerm']) out.searchTerm = String(params['searchTerm'])
    return out
  }

  // ── Envelopes (Signaturely "documents") ─────────────────────────────────────

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const res = await this.client(credentials).get<PagedResponse<RawSignaturelyDocument>>(
      '/documents',
      this.listParams(params),
    )
    return (res.data ?? []).map(transformEnvelope)
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Envelope> {
    // PATCH /documents/{id}/revert cancels an active signature request and
    // returns the updated document object.
    const raw = await this.client(credentials).patch<RawSignaturelyDocument>(
      `/documents/${id}/revert`,
    )
    return transformEnvelope(raw)
  }

  // ── Documents (derived from envelope parts) ────────────────────────────────
  // Signaturely has no standalone per-file endpoint. Files are nested under a
  // document's `parts` array, so we fetch the envelope list and flatten parts.

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    // A single-document read endpoint does not exist, so the envelope is
    // resolved against `GET /documents`, walked with its required `page` +
    // `limit` until the envelope turns up or `totalPages` is reached: an
    // envelope past the first upstream page is not "no files". Its `parts`
    // are the whole collection, and the caller's page is cut from them here.
    const client = this.client(credentials)
    let doc: RawSignaturelyDocument | undefined
    // Whether the walk reached the documented end of the list (an empty page
    // or `page >= totalPages`), so that "not found" really means no parts.
    let reachedEnd = false
    for (let page = 1; ; page++) {
      const res = await client.get<PagedResponse<RawSignaturelyDocument>>('/documents', {
        page,
        limit: MAX_PAGE_SIZE,
      })
      const rows = res.data ?? []
      doc = rows.find((d) => d.id === envelopeId)
      if (doc) break
      if (rows.length === 0) {
        reachedEnd = true
        break
      }
      if (typeof res.totalPages !== 'number') break
      if (page >= res.totalPages) {
        reachedEnd = true
        break
      }
    }
    // Without a known end, a missing envelope is not "known empty": report
    // nothing rather than let pageLocally claim a complete, empty collection.
    if (!doc && !reachedEnd) return []
    return pageLocally(
      (doc?.parts ?? []).map((part, i) => transformDocument(part, envelopeId, i)),
      params,
    )
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    // id shape: "<envelopeId>:<partId>" or "<envelopeId>:<index>".
    const [envelopeId, partRef] = id.includes(':') ? id.split(':') : [id, '0']
    const all = await this.listDocuments(credentials, envelopeId ?? id, {})
    const found =
      all.find((d) => d.externalId === partRef) ??
      all.find((d) => d.externalId === id) ??
      all[Number(partRef)]
    if (!found) throw new Error(`Document ${id} not found on envelope ${envelopeId}`)
    return found
  }

  // ── Signers (GET /documents/{documentId}/signers) ──────────────────────────

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    // The endpoint takes only the documentId path parameter and returns every
    // signer in `{ data }`; the caller's page is cut from that here.
    const res = await this.client(credentials).get<PagedResponse<RawSignaturelySigner>>(
      `/documents/${envelopeId}/signers`,
    )
    return pageLocally(
      (res.data ?? []).map((s) => transformSigner(s, envelopeId)),
      params,
    )
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    // Signaturely has no signer-by-id endpoint; address via "<envelopeId>:<signerId>".
    const [envelopeId, signerId] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId || !signerId) {
      throw new Error('getSigner expects an id of shape "<documentId>:<signerId>"')
    }
    const all = await this.listSigners(credentials, envelopeId, {})
    const found = all.find((s) => s.externalId === signerId)
    if (!found) throw new Error(`Signer ${signerId} not found on document ${envelopeId}`)
    return found
  }

  // ── Audit-trail entries (GET /documents/{id}/activities) ────────────────────

  async listAuditTrailEntries(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    // "Get document activity" (https://docs.signaturely.com/) takes only the
    // `id` path parameter and answers a bare array of every activity, so the
    // whole list is transformed (ids index the full list) and the caller's
    // page is cut from it here.
    const res = await this.client(credentials).get<unknown>(
      `/documents/${encodeURIComponent(envelopeId)}/activities`,
    )
    if (!Array.isArray(res)) {
      throw new Error('Signaturely activities response is not the documented array')
    }
    return pageLocally(
      (res as RawSignaturelyActivity[]).map((e, i) => transformAuditTrailEntry(e, envelopeId, i)),
      params,
    )
  }

  async getAuditTrailEntry(credentials: Credentials, id: string): Promise<AuditTrailEntry> {
    const [envelopeId, indexStr] = id.split(':')
    if (!envelopeId || indexStr === undefined) {
      throw new Error('getAuditTrailEntry expects an id of shape "<documentId>:<index>"')
    }
    const all = await this.listAuditTrailEntries(credentials, envelopeId, {})
    const found = all[Number(indexStr)]
    if (!found) throw new Error(`Audit entry ${id} not found`)
    return found
  }

  // ── Templates (GET /documents/api/templates) ────────────────────────────────

  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    const res = await this.client(credentials).get<PagedResponse<RawSignaturelyTemplate>>(
      '/documents/api/templates',
      {
        page: typeof params.page === 'number' ? params.page : 1,
        limit: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      },
    )
    return (res.data ?? []).map(transformTemplate)
  }

  async getTemplate(credentials: Credentials, id: string): Promise<Template> {
    // No template-by-id endpoint; resolve against the template list.
    const all = await this.listTemplates(credentials, { limit: MAX_PAGE_SIZE })
    const found = all.find((t) => t.externalId === id)
    if (!found) throw new Error(`Template ${id} not found`)
    return found
  }
}
