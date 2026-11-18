/**
 * Zoho Sign adapter.
 *
 * Maps Zoho Sign `requests` → canonical `Envelope`, actions+recipients →
 * `Signer`, the request's `document_ids[]` → `Document` (metadata only),
 * and `/templates` → `Template`. Audit-trail entries are refused: Zoho Sign
 * documents no audit-log endpoint (see AUDIT_TRAIL_UNSUPPORTED).
 */

import {
  connectionScope,
  cursorPagerKey,
  pageByRows,
  pageLocally,
  pageOffset,
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
  exchangeCode as zohoSignExchange,
  refreshCredentials as zohoSignRefresh,
} from './auth'
import { ZohoSignClient } from './client'
import { API_BASE_URL, DEFAULT_PAGE_SIZE, DEFAULT_SCOPES } from './constants'
import { verifyZohoSignWebhook, parseZohoSignWebhookEvents } from './webhook'

import {
  transformEnvelope,
  type RawZohoSignRequest,
  type RawZohoSignAction,
  type RawZohoSignRecipient,
} from './transform/envelope'
import { transformSigner, type RawZohoSignSigner } from './transform/signer'
import {
  transformDocument,
  type RawZohoSignDocumentEntry,
} from './transform/document'
import { transformTemplate, type RawZohoSignTemplate } from './transform/template'

export interface ZohoSignAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

/**
 * The `page_context` Zoho Sign returns beside a list: "has_more_rows",
 * "start_index", "total_count", "row_count" (response samples on
 * https://www.zoho.com/sign/api/document-managment/get-document-list.html and
 * https://www.zoho.com/sign/api/template-managment/get-template-list.html).
 */
interface ZohoSignPageContext {
  has_more_rows?: boolean
  start_index?: number
  total_count?: number
  row_count?: number
}

interface RequestsListResponse {
  requests?: RawZohoSignRequest[]
  page_context?: ZohoSignPageContext
}

interface RequestEnvelope {
  requests?: RawZohoSignRequest
  request?: RawZohoSignRequest
}

interface TemplatesListResponse {
  templates?: RawZohoSignTemplate[]
  page_context?: ZohoSignPageContext
}

/**
 * GET /templates documents `row_count` as "No of rows to be retrieved
 * [10,25,50,100]", so a caller's limit cannot be sent as is.
 */
const TEMPLATE_ROW_COUNTS = [10, 25, 50, 100] as const

/** The smallest documented template row_count that covers `limit` (100 past it). */
function templateRowCount(limit: number): number {
  return TEMPLATE_ROW_COUNTS.find((n) => n >= limit) ?? 100
}

/**
 * Zoho Sign pages both lists by a JSON `data` query parameter, not by
 * page/per_page: `data={"page_context":{"row_count":…,"start_index":…,
 * "sort_column":…,"sort_order":…}}`, where start_index is the 1-based index of
 * the first row. row_count, start_index, sort_column and sort_order are all
 * marked required on both list pages. created_time DESC is what both response
 * samples echo back.
 */
function pageContextData(rowCount: number, startIndex: number): string {
  return JSON.stringify({
    page_context: {
      row_count: rowCount,
      start_index: startIndex,
      sort_column: 'created_time',
      sort_order: 'DESC',
    },
  })
}

/**
 * Zoho Sign's first-party OpenAPI
 * (https://api.swaggerhub.com/apis/zohosign/zohosign_api/1.0.0) lists these
 * /requests/{Request_Id} sub-paths only: submit, pdf, documents/{Document_Id}/pdf,
 * completioncertificate, fielddata, recall, remind and delete. None is an
 * audit log, and the API menu has no audit entry either. The one audit
 * artifact is a PDF: "Retrieves the completion certificate pdf content."
 * (https://www.zoho.com/sign/api/document-managment/download-completion-certificate.html).
 */
const AUDIT_TRAIL_UNSUPPORTED =
  'Zoho Sign cannot list audit-trail entries: its API documents no audit-log endpoint; ' +
  'GET /requests/{Request_Id}/completioncertificate "Retrieves the completion certificate pdf content."'

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

interface TemplateEnvelope {
  templates?: RawZohoSignTemplate
  template?: RawZohoSignTemplate
}

function unwrapRequest(res: RequestEnvelope): RawZohoSignRequest | undefined {
  return res.requests ?? res.request
}

function flattenSigners(
  actions: RawZohoSignAction[] | undefined,
): Array<{ raw: RawZohoSignSigner }> {
  const out: Array<{ raw: RawZohoSignSigner }> = []
  for (const a of actions ?? []) {
    if (a.recipients && a.recipients.length > 0) {
      for (const r of a.recipients) {
        out.push({ raw: { ...a, ...r } as RawZohoSignSigner })
      }
    } else {
      // No nested recipients — the action itself is the signer.
      out.push({ raw: a as unknown as RawZohoSignSigner })
    }
  }
  return out
}

export class ZohoSignAdapter implements DocsignAdapter {
  readonly platform = 'zoho-sign'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: ZohoSignAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return zohoSignExchange(code, redirectUri, this.clientId, this.clientSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return zohoSignRefresh(credentials, this.clientId, this.clientSecret)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyZohoSignWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseZohoSignWebhookEvents(payload)
  }

  private client(credentials: Credentials): ZohoSignClient {
    return new ZohoSignClient(credentials)
  }

  /** The non-paging filters both lists send, unchanged from before. */
  private listFilters(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    if (params['status']) out.status = String(params['status'])
    return out
  }

  /** One pager scope per connection, on the host the connection talks to. */
  private scope(credentials: Credentials): string {
    const domain = String(credentials.extra?.['apiDomain'] ?? '').trim()
    return connectionScope(`zoho-sign:${domain || API_BASE_URL}`, credentials)
  }

  // ── Envelopes (requests) ──────────────────────────────────────────────────

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    // GET /requests takes row_count as "Integers [1,2,...,n]", so one upstream
    // page is one caller page: row_count = limit, start_index = offset + 1.
    const size = params.limit ?? DEFAULT_PAGE_SIZE
    const res = await this.client(credentials).get<RequestsListResponse>('/requests', {
      ...this.listFilters(params),
      data: pageContextData(size, pageOffset(params, size) + 1),
    })
    const ctx = res.page_context
    reportUpstreamPage(params, {
      ...(typeof ctx?.has_more_rows === 'boolean' ? { hasMore: ctx.has_more_rows } : {}),
      ...(typeof ctx?.total_count === 'number' ? { totalCount: ctx.total_count } : {}),
    })
    return (res.requests ?? []).map(transformEnvelope)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const res = await this.client(credentials).get<RequestEnvelope>(`/requests/${id}`)
    const raw = unwrapRequest(res)
    if (!raw) throw new Error(`Zoho Sign request ${id} not found`)
    return transformEnvelope(raw)
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Envelope> {
    await this.client(credentials).post(`/requests/${id}/recall`)
    return this.getEnvelope(credentials, id)
  }

  // ── Signers (actions + recipients) ────────────────────────────────────────

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    // GET /requests/{id} returns every action in one reply, so the caller's
    // page is cut from the whole flattened list here.
    const res = await this.client(credentials).get<RequestEnvelope>(
      `/requests/${envelopeId}`,
    )
    const raw = unwrapRequest(res)
    if (!raw) throw new Error(`Zoho Sign request ${envelopeId} not found`)
    return pageLocally(
      flattenSigners(raw.actions).map(({ raw: r }) => transformSigner(r, envelopeId)),
      params,
    )
    void ([] as RawZohoSignRecipient[]) // type retention
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    const [envelopeId, recipientId] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId || !recipientId) {
      throw new Error('Zoho Sign getSigner expects id of shape "<requestId>:<actionId|recipientId>"')
    }
    const all = await this.listSigners(credentials, envelopeId, {})
    const found = all.find((s) => s.externalId === recipientId)
    if (!found) throw new Error(`Zoho Sign signer ${recipientId} not found on request ${envelopeId}`)
    return found
  }

  // ── Documents (metadata only — content REFUSED) ──────────────────────────

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    // The whole document_ids[] comes in one reply. Page after mapping so the
    // index-derived ids stay stable across pages.
    const res = await this.client(credentials).get<RequestEnvelope>(
      `/requests/${envelopeId}`,
    )
    const raw = unwrapRequest(res)
    if (!raw) throw new Error(`Zoho Sign request ${envelopeId} not found`)
    return pageLocally(
      (raw.document_ids ?? []).map((d: RawZohoSignDocumentEntry, i: number) =>
        transformDocument(d, envelopeId, i),
      ),
      params,
    )
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const [envelopeId, documentId] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId || !documentId) {
      throw new Error('Zoho Sign getDocument expects id of shape "<requestId>:<documentId>"')
    }
    const all = await this.listDocuments(credentials, envelopeId, {})
    const found = all.find((d) => d.externalId === documentId)
    if (!found) throw new Error(`Zoho Sign document ${documentId} not found on request ${envelopeId}`)
    return found
  }

  // ── Audit-trail entries ──────────────────────────────────────────────────

  // Refused before any request: no documented audit-log endpoint exists.
  async listAuditTrailEntries(
    _credentials: Credentials,
    _envelopeId: string,
    _params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    throw notSupported(AUDIT_TRAIL_UNSUPPORTED)
  }

  async getAuditTrailEntry(_credentials: Credentials, _id: string): Promise<AuditTrailEntry> {
    throw notSupported(AUDIT_TRAIL_UNSUPPORTED)
  }

  // ── Templates ────────────────────────────────────────────────────────────

  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    // row_count is one of 10/25/50/100, so upstream pages are the smallest of
    // those covering the caller's limit and the caller's rows are cut from
    // them. The cursor is the 1-based start_index of the next upstream page.
    const filters = this.listFilters(params)
    const rowCount = templateRowCount(params.limit ?? DEFAULT_PAGE_SIZE)
    const client = this.client(credentials)
    const key = cursorPagerKey(this.scope(credentials), '/templates', {
      ...filters,
      row_count: rowCount,
    })
    const { items } = await pageByRows<Template, number>(
      key,
      params,
      async (cursor) => {
        const start = cursor ?? 1
        const res = await client.get<TemplatesListResponse>('/templates', {
          ...filters,
          data: pageContextData(rowCount, start),
        })
        const rows = res.templates ?? []
        const more = res.page_context?.has_more_rows ?? rows.length >= rowCount
        return {
          items: rows.map(transformTemplate),
          next: more && rows.length > 0 ? start + rows.length : undefined,
        }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items
  }

  async getTemplate(credentials: Credentials, id: string): Promise<Template> {
    const res = await this.client(credentials).get<TemplateEnvelope>(`/templates/${id}`)
    const raw = res.templates ?? res.template
    if (!raw) throw new Error(`Zoho Sign template ${id} not found`)
    return transformTemplate(raw)
  }
}
