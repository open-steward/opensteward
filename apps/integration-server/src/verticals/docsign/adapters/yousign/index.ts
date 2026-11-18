/**
 * Yousign adapter (API v3).
 *
 * EU-native, eIDAS-qualified. Maps Yousign `signature_requests` → canonical
 * `Envelope`, signers → `Signer`, documents → `Document`, audit-trail
 * entries → `AuditTrailEntry`, templates → `Template`.
 */

import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  pageLocally,
  reportUpstreamPage,
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
  exchangeCode as yousignExchange,
  refreshCredentials as yousignRefresh,
} from './auth'
import { YousignClient, yousignBaseUrl } from './client'
import { DEFAULT_PAGE_SIZE, DEFAULT_SCOPES, MAX_PAGE_SIZE } from './constants'
import { verifyYousignWebhook, parseYousignWebhookEvents } from './webhook'

import { transformEnvelope, type RawYousignSignatureRequest } from './transform/envelope'
import { transformSigner, type RawYousignSigner } from './transform/signer'
import { transformDocument, type RawYousignDocument } from './transform/document'

export interface YousignAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

interface ListResponse<T> {
  data?: T[]
  meta?: {
    /** "Token to get the next page of results. If `null`, there are no more pages." */
    next_cursor?: string | null
    pagination?: { cursor?: { next?: string; prev?: string } }
  }
}

/** A bare-array reply, or an error naming the endpoint: never a silent []. */
function requireArray<T>(res: unknown, endpoint: string): T[] {
  if (!Array.isArray(res)) {
    throw new Error(`Yousign ${endpoint} did not answer the documented JSON array`)
  }
  return res as T[]
}

export class YousignAdapter implements DocsignAdapter {
  readonly platform = 'yousign'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: YousignAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return yousignExchange(code, redirectUri, this.clientId, this.clientSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return yousignRefresh(credentials, this.clientId, this.clientSecret)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyYousignWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseYousignWebhookEvents(payload)
  }

  private client(credentials: Credentials): YousignClient {
    return new YousignClient(credentials)
  }

  // ── Envelopes (signature_requests) ────────────────────────────────────────

  /**
   * `GET /signature_requests` pages by cursor: `after` takes the previous
   * response's `meta.next_cursor`, which is null on the last page, and
   * `limit` is at most 100
   * (https://developers.youtrust.com/reference/get-signature_requests-1).
   * A caller `cursor` is the walk's start point.
   */
  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const requested = Math.floor(Number(params.limit ?? DEFAULT_PAGE_SIZE))
    const limit = Math.min(requested >= 1 ? requested : DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const start = params['cursor'] ? String(params['cursor']) : undefined
    const client = this.client(credentials)
    const key = cursorPagerKey(
      connectionScope(yousignBaseUrl(credentials), credentials),
      '/signature_requests',
      { limit, start },
    )
    const result = await pageByCursor<RawYousignSignatureRequest>(
      key,
      params.page,
      async (cursor) => {
        const after = cursor ?? start
        const res = await client.get<ListResponse<RawYousignSignatureRequest>>(
          '/signature_requests',
          after ? { limit, after } : { limit },
        )
        return { items: res.data ?? [], next: res.meta?.next_cursor ?? undefined }
      },
    )
    reportUpstreamPage(params, { hasMore: result.hasMore, pageSize: limit })
    return result.items.map(transformEnvelope)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const raw = await this.client(credentials).get<RawYousignSignatureRequest>(
      `/signature_requests/${id}`,
    )
    return transformEnvelope(raw)
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Envelope> {
    await this.client(credentials).post(`/signature_requests/${id}/cancel`, {
      reason: data?.reason ?? 'Voided by API',
    })
    return this.getEnvelope(credentials, id)
  }

  // ── Signers ───────────────────────────────────────────────────────────────

  /**
   * List Signature Request's Signers
   * (https://developers.youtrust.com/reference/get-signature_requests-signaturerequestid-signers-1.md)
   * takes only the `signatureRequestId` path parameter and answers a bare
   * array, `{"items":{"$ref":"#/components/schemas/Signer"},"type":"array"}`,
   * with no paging parameters, so the whole array is read and paged locally.
   */
  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    const res = await this.client(credentials).get<unknown>(
      `/signature_requests/${encodeURIComponent(envelopeId)}/signers`,
    )
    const rows = requireArray<RawYousignSigner>(res, "List Signature Request's Signers")
    return pageLocally(rows, params).map((s) => transformSigner(s, envelopeId))
  }

  /**
   * Get a Signer (https://developers.youtrust.com/reference/get-signers-signersid-1.md)
   * is `GET /signature_requests/{signatureRequestId}/signers/{signerId}`: it
   * needs the signature request id, which this method is not given.
   */
  async getSigner(_credentials: Credentials, _id: string): Promise<Signer> {
    throw Object.assign(
      new Error(
        'Yousign cannot read a signer by id alone: Get a Signer is GET /signature_requests/{signatureRequestId}/signers/{signerId}',
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }

  // ── Documents ────────────────────────────────────────────────────────────

  /**
   * List Signature Request's Documents
   * (https://developers.youtrust.com/reference/get-signature_requests-signaturerequestid-documents-1.md)
   * takes the `signatureRequestId` path parameter and an optional `nature`
   * filter, and answers a bare array of `Document` with no paging parameters,
   * so the whole array is read and paged locally. `order` is the document's
   * position in that array, not in the page.
   */
  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    const res = await this.client(credentials).get<unknown>(
      `/signature_requests/${encodeURIComponent(envelopeId)}/documents`,
    )
    const rows = requireArray<RawYousignDocument>(res, "List Signature Request's Documents")
    const ordered = rows.map((raw, order) => ({ raw, order }))
    return pageLocally(ordered, params).map(({ raw, order }) =>
      transformDocument(raw, envelopeId, order),
    )
  }

  /**
   * Get a Document
   * (https://developers.youtrust.com/reference/get-signature_requests-signaturerequestid-documents-documentid-1.md)
   * is `GET /signature_requests/{signatureRequestId}/documents/{documentId}`:
   * it needs the signature request id, which this method is not given.
   */
  async getDocument(_credentials: Credentials, _id: string): Promise<Document> {
    throw Object.assign(
      new Error(
        'Yousign cannot read a document by id alone: Get a Document is GET /signature_requests/{signatureRequestId}/documents/{documentId}',
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }

  // ── Audit-trail entries ──────────────────────────────────────────────────

  /**
   * Yousign documents no JSON list of audit-trail events for a Signature
   * Request. The Audit Trail resource
   * (https://developers.youtrust.com/reference/audit-trail.md) has three
   * endpoints: a PDF download of all audit trails, a per-signer PDF download,
   * and Get Signer Audit Trail, which "Retrieves the JSON version of the Audit
   * Trail attached to a given Signer. Only possible when Signer status is
   * `signed`" and returns one document, not a list of events.
   */
  async listAuditTrailEntries(
    _credentials: Credentials,
    _envelopeId: string,
    _params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    throw Object.assign(
      new Error(
        'Yousign cannot list audit trail entries: the API has no JSON audit-trail list for a Signature Request, only "Download Signature Request Audit Trails" (PDF) and "Get Signer Audit Trail", which is "Only possible when Signer status is `signed`"',
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }

  async getAuditTrailEntry(_credentials: Credentials, _id: string): Promise<AuditTrailEntry> {
    throw Object.assign(
      new Error(
        'Yousign cannot read an audit trail entry: the API documents no audit-trail event resource, only per-signer audit-trail documents',
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }

  // ── Templates ────────────────────────────────────────────────────────────

  /**
   * List Templates is `GET /templates`
   * (https://developers.youtrust.com/reference/get-templates-1.md), but its
   * `Template` documents only `id`, `name`, `description`, `status`,
   * `created_at` and `workspace_id`, while a template "is at least composed
   * of: Documents" (https://developers.youtrust.com/docs/template.md). The
   * canonical Template's required `signerRoles` and `documentCount` therefore
   * have no documented source, and no Get Template endpoint is documented either.
   */
  async listTemplates(_credentials: Credentials, _params: QueryParams): Promise<Template[]> {
    throw Object.assign(
      new Error(
        'Yousign cannot list templates: GET /templates documents only id, name, description, status, created_at and workspace_id, so the required signer roles and document count (a template "is at least composed of: Documents") have no documented source',
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }

  async getTemplate(_credentials: Credentials, _id: string): Promise<Template> {
    throw Object.assign(
      new Error(
        'Yousign cannot read a template: the API documents only "List Templates" (GET /templates), no Get Template endpoint',
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }
}
