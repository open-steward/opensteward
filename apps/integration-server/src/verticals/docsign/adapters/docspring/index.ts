/**
 * DocSpring adapter. PDF-template filling with e-signatures collected through
 * data requests. HTTP Basic auth over an API token id and secret.
 *
 * Reference: https://docspring.com/api-docs/v1/swagger.json (the OpenAPI
 * schema linked from https://docspring.com/docs/api-guide/openapi-schema/).
 */
import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  pageLocally,
  pageOffset,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { AuditTrailEntry } from '../../schema/audit-trail-entry'
import type { Template } from '../../schema/template'
import type { WebhookEvent } from '../../schema/webhook'

import {
  credentialFields as docspringCredentialFields,
  exchangeCredentials as docspringExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { DocSpringClient } from './client'
import { API_BASE_URL, TEMPLATES_MAX_PER_PAGE } from './constants'
import { verifyDocSpringWebhook, parseDocSpringWebhookEvents } from './webhook'

import { transformEnvelope, type RawDocSpringSubmission } from './transform/envelope'
import { transformSigner, type RawDocSpringDataRequest } from './transform/signer'
import { transformTemplate, type RawDocSpringTemplate } from './transform/template'
import { requireStr } from './transform/shared'

export interface DocSpringAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

/** `list_submissions_response` (https://docspring.com/api-docs/v1/swagger.json). */
interface ListSubmissionsResponse {
  submissions: RawDocSpringSubmission[]
  limit: number
  next_cursor: string | null
}

export class DocSpringAdapter implements DocsignAdapter {
  readonly platform = 'docspring'
  readonly version = '0.1.0'

  constructor(_config: DocSpringAdapterConfig) {}

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('docspring uses static API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  credentialFields(): CredentialField[] {
    return docspringCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return docspringExchangeCredentials(fields)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyDocSpringWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseDocSpringWebhookEvents(payload)
  }

  private client(credentials: Credentials): DocSpringClient {
    return new DocSpringClient(credentials)
  }

  private submission(credentials: Credentials, id: string): Promise<RawDocSpringSubmission> {
    return this.client(credentials).get<RawDocSpringSubmission>(
      `/submissions/${encodeURIComponent(id)}`,
    )
  }

  // ── Envelopes (submissions) ──────────────────────────────────────────────

  /**
   * `GET /submissions` — "Returns a paginated list of all PDF submissions
   * across all templates in your account. ... Supports cursor-based
   * pagination" (https://docspring.com/api-docs/v1/swagger.json, operation
   * listSubmissions). Query: `cursor`, `limit`; response
   * `{ submissions, limit, next_cursor }` with `next_cursor` "x-nullable".
   * No maximum `limit` is documented, so the caller's limit is sent as is.
   *
   * The walk ends at a null `next_cursor`, or at a page shorter than the
   * response's own `limit`.
   */
  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const limit = positiveInt(params.limit)
    const client = this.client(credentials)
    const key = cursorPagerKey(connectionScope(API_BASE_URL, credentials), '/submissions', {
      limit,
    })
    // The response's own `limit` is the page size the platform served; when it is
    // below the one sent, the page is judged at that size.
    let served: number | undefined
    const result = await pageByCursor<RawDocSpringSubmission>(key, params.page, async (cursor) => {
      const query: Record<string, unknown> = {}
      if (limit !== undefined) query['limit'] = limit
      if (cursor !== undefined) query['cursor'] = cursor
      const res = await client.get<ListSubmissionsResponse>('/submissions', query)
      if (!Array.isArray(res.submissions)) {
        throw new Error('docspring GET /submissions returned no submissions array')
      }
      served = typeof res.limit === 'number' ? res.limit : undefined
      const short = served !== undefined && res.submissions.length < served
      return {
        items: res.submissions,
        next: short || res.next_cursor == null ? undefined : res.next_cursor,
      }
    })
    if (limit !== undefined && served !== undefined && served >= 1 && served < limit) {
      reportUpstreamPage(params, { pageSize: served })
    }
    reportUpstreamPage(params, { hasMore: result.hasMore })
    return result.items.map(transformEnvelope)
  }

  /** `GET /submissions/{submission_id}` — "Check the status of a PDF". */
  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    return transformEnvelope(await this.submission(credentials, id))
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Envelope> {
    await this.client(credentials).post(`/transactions/${id}/cancel`, {
      reason: data?.reason ?? 'Voided by API',
    })
    return this.getEnvelope(credentials, id)
  }

  // ── Signers (data requests) ──────────────────────────────────────────────

  /**
   * A submission's data requests are embedded in `GET /submissions/{submission_id}`
   * (`data_requests`), which takes no paging parameters, so they are paged locally.
   */
  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    const raw = await this.submission(credentials, envelopeId)
    const rows = (raw.data_requests ?? []).map((d) => transformSigner(d, envelopeId))
    return pageLocally(rows, params)
  }

  /** `GET /data_requests/{data_request_id}` — "Look up a submission data request". */
  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    const raw = await this.client(credentials).get<RawDocSpringDataRequest>(
      `/data_requests/${encodeURIComponent(id)}`,
    )
    return transformSigner(raw, requireStr(raw.submission_id, `data request ${id} submission_id`))
  }

  // ── Documents ────────────────────────────────────────────────────────────

  async listDocuments(
    _credentials: Credentials,
    _envelopeId: string,
    _params: QueryParams,
  ): Promise<Document[]> {
    throw notSupported(
      'DocSpring cannot list documents: a submission is a single generated PDF ' +
        '("Check the status of a PDF", GET /submissions/{submission_id}) and the API ' +
        'documents no document resource or document id',
    )
  }

  async getDocument(_credentials: Credentials, _id: string): Promise<Document> {
    throw notSupported(
      'DocSpring cannot read a document by id: the API documents no document resource or document id',
    )
  }

  // ── Audit trail ──────────────────────────────────────────────────────────

  async listAuditTrailEntries(
    _credentials: Credentials,
    _envelopeId: string,
    _params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    throw notSupported(
      'DocSpring cannot list audit trail entries: the audit trail is only exposed as a PDF ' +
        '(the submission\'s "audit_trail_download_url"); the API has no audit event endpoint',
    )
  }

  async getAuditTrailEntry(_credentials: Credentials, _id: string): Promise<AuditTrailEntry> {
    throw notSupported(
      'DocSpring cannot read an audit trail entry: the audit trail is only exposed as a PDF ' +
        '(the submission\'s "audit_trail_download_url")',
    )
  }

  // ── Templates ────────────────────────────────────────────────────────────

  /**
   * `GET /templates` pages by `page` ("minimum": 1, "Default: 1") and
   * `per_page` ("minimum": 1, "maximum": 50, "Default: 50"), and returns a
   * bare array (`"title": "list_templates", "type": "array"`)
   * (https://docspring.com/api-docs/v1/swagger.json). With no total or next
   * link, a page shorter than `per_page` is the end.
   */
  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    const perPage = Math.min(
      positiveInt(params.limit) ?? TEMPLATES_MAX_PER_PAGE,
      TEMPLATES_MAX_PER_PAGE,
    )
    const page = pageOffset(params, perPage) / perPage + 1
    const rows = await this.client(credentials).get<RawDocSpringTemplate[]>('/templates', {
      page,
      per_page: perPage,
    })
    // The size is reported before the body is checked: it is what was asked for.
    reportUpstreamPage(params, { pageSize: perPage })
    if (!Array.isArray(rows)) throw new Error('docspring GET /templates did not return an array')
    reportUpstreamPage(params, { hasMore: rows.length >= perPage })
    return rows.map(transformTemplate)
  }

  /** `GET /templates/{template_id}` — "Check the status of an uploaded template". */
  async getTemplate(credentials: Credentials, id: string): Promise<Template> {
    const raw = await this.client(credentials).get<RawDocSpringTemplate>(
      `/templates/${encodeURIComponent(id)}`,
    )
    return transformTemplate(raw)
  }
}

function positiveInt(v: unknown): number | undefined {
  const n = Math.floor(Number(v))
  return Number.isFinite(n) && n >= 1 ? n : undefined
}

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}
