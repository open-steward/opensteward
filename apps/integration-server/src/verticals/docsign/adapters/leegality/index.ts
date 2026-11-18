/**
 * Leegality adapter — Indian eSign + eStamp document-execution gateway.
 *
 * Maps the Leegality `sign/request` document → canonical `Envelope`,
 * `requests[]` (invitees) → `Signer`, and `files[]` → `Document`
 * (metadata only).
 *
 * Authentication: static Auth Token in the `X-Auth-Token` header. There is
 * no OAuth flow — call `credentialFields()` + `exchangeCredentials()`
 * (Connect Link flow). The customer picks production/sandbox and may
 * supply the Private Salt used for webhook MAC verification.
 *
 * Resources Leegality's REST surface supports here: envelopes, signers,
 * documents. Audit-trail entries and templates are intentionally NOT
 * implemented — Leegality exposes the audit trail only as a base64 PDF
 * blob (content, which is refused) and has no listable template REST
 * endpoint. The router returns 501 for those.
 *
 * Refused fields:
 *   - Document content / base64 PDF (`file`)
 *   - Audit-trail PDF blob (`auditTrail`)
 *   - Signature images, eSign certificate / verification payloads
 *
 * Docs: https://knowledge.leegality.com/document-execution/api/authentication
 */

// ── Resource coverage ──────────────────────────────────────────────────────────
// Available:   envelope, signer, document
// Unavailable: audit-trail-entry — audit trail is a PDF blob only (GET /v3.3/document/fetchDocument?documentDownloadType=AUDIT_TRAIL); no structured JSON event endpoint exists
// Unavailable: template — no documented REST endpoint for listing/fetching templates; UI-only feature

import { pageLocally, reportUpstreamPage } from '@opensteward/shared'
import type { Credentials, QueryParams, CredentialField } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { WebhookEvent } from '../../schema/webhook'

import {
  buildAuthUrl,
  exchangeApiKey,
  exchangeCode as leegalityExchange,
  leegalityCredentialFields,
  refreshCredentials as leegalityRefresh,
} from './auth'
import { LeegalityClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { verifyLeegalityWebhook, parseLeegalityWebhookEvents } from './webhook'

import { transformEnvelope, type RawLeegalityDocument } from './transform/envelope'
import { transformSigner } from './transform/signer'
import { transformDocument } from './transform/document'

export interface LeegalityAdapterConfig {
  redirectUri?: string
}

/**
 * GET /sign/request?documentId= → DetailsApiResponse. Documented as
 * "GET /v3.2/sign/request — Check transaction status"
 * (https://knowledge.leegality.com/document-execution/api/check-transaction-status):
 * `documentId` is its only parameter, and it returns the whole `requests[]`
 * (invitees) and `files[]` of the document, unpaged.
 */
interface DetailsApiResponse {
  status?: number
  messages?: Array<{ code?: string; message?: string }>
  data?: RawLeegalityDocument
}

/** GET /v3.0/sign/request/list → ListApiResponse. */
interface ListApiResponse {
  status?: number
  messages?: Array<{ code?: string; message?: string }>
  data?: {
    total?: number
    documents?: RawLeegalityDocument[]
  }
}

export class LeegalityAdapter implements DocsignAdapter {
  readonly platform = 'leegality'
  readonly version = '0.1.0'
  /** Honours `params.search`; see AdapterCapabilities. Declared so the
   *  router can refuse the parameter on adapters that would drop it.
   *  `maxPageSize` is the list endpoint's documented `max` ceiling of 40
   *  (list-documents: "Maximum: `40`. Values above 40 are silently reset to
   *  20."); the signer and document lists page locally, so it caps no list
   *  short of the caller's page. */
  readonly capabilities = { search: true, maxPageSize: MAX_PAGE_SIZE }

  constructor(_config: LeegalityAdapterConfig = {}) {
    // Leegality uses static Auth Token credentials; no OAuth client config.
  }

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    return buildAuthUrl()
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return leegalityExchange(code, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return leegalityRefresh(credentials)
  }

  credentialFields(): CredentialField[] {
    return leegalityCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return exchangeApiKey(fields)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyLeegalityWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseLeegalityWebhookEvents(payload)
  }

  private client(credentials: Credentials): LeegalityClient {
    return new LeegalityClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const max = Math.min(Number(params.limit ?? DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE)
    // Leegality serves at most 40 a page. Reported so the router judges a
    // full page against 40, not the caller's larger limit (which read it as
    // the last page).
    reportUpstreamPage(params, { pageSize: max })
    const page = Math.max(Number(params.page ?? 1), 1)
    const out: Record<string, unknown> = {
      max,
      offset: (page - 1) * max,
    }
    if (params.search) out.q = String(params.search)
    if (params['status']) out.status = String(params['status'])
    return out
  }

  private async fetchDocument(
    credentials: Credentials,
    documentId: string,
  ): Promise<RawLeegalityDocument> {
    const res = await this.client(credentials).get<DetailsApiResponse>('/sign/request', {
      documentId,
    })
    return res.data ?? { documentId }
  }

  // ── Envelopes ─────────────────────────────────────────────────────────────

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const res = await this.client(credentials).get<ListApiResponse>(
      '/sign/request/list',
      this.listParams(params),
    )
    const docs = res.data?.documents ?? []
    return docs.map(transformEnvelope)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    return transformEnvelope(await this.fetchDocument(credentials, id))
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Envelope> {
    // Leegality voids a document by deleting the sign request.
    await this.client(credentials).delete('/sign/request', { documentId: id })
    return { ...(await this.getEnvelope(credentials, id)), status: 'voided' }
  }

  // ── Signers (invitees) ─────────────────────────────────────────────────────

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    const doc = await this.fetchDocument(credentials, envelopeId)
    const invitees = Array.isArray(doc.requests) ? doc.requests : []
    // The details read returns every invitee and takes no paging parameter,
    // so page the whole list here. Transform first: the index is the
    // invitee's position in the document, not on the caller's page.
    return pageLocally(
      invitees.map((inv, i) => transformSigner(inv, envelopeId, i)),
      params,
    )
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    const sep = id.lastIndexOf(':')
    if (sep <= 0) {
      throw new Error('Leegality getSigner expects an id of shape "<envelopeId>:<inviteeRef>"')
    }
    const envelopeId = id.slice(0, sep)
    const all = await this.listSigners(credentials, envelopeId, {})
    const found = all.find((s) => s.externalId === id) ?? all[Number(id.slice(sep + 1))]
    if (!found) throw new Error(`Signer ${id} not found on envelope ${envelopeId}`)
    return found
  }

  // ── Documents (metadata only — content + audit-trail blob REFUSED) ─────────

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    const doc = await this.fetchDocument(credentials, envelopeId)
    const files = Array.isArray(doc.files) ? doc.files : []
    // The details read returns every file and takes no paging parameter, so
    // page the whole list here.
    const all =
      files.length === 0
        ? // Fall back to a single document representing the envelope.
          [transformDocument(doc.name ?? envelopeId, envelopeId, 0)]
        : files.map((fileName, i) => transformDocument(fileName, envelopeId, i))
    return pageLocally(all, params)
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const sep = id.lastIndexOf(':')
    const envelopeId = sep > 0 ? id.slice(0, sep) : id
    const all = await this.listDocuments(credentials, envelopeId, {})
    const found = all.find((d) => d.externalId === id) ?? all[0]
    if (!found) throw new Error(`Document ${id} not found on envelope ${envelopeId}`)
    return found
  }
}
