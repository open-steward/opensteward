/**
 * Dropbox Sign (formerly HelloSign) adapter.
 *
 * Maps Dropbox Sign `signature_requests` → canonical `Envelope`, `signatures`
 * → `Signer`, synthesised per-signer timeline events → `AuditTrailEntry`,
 * and `templates` → `Template`. Documents are refused (501 NOT_SUPPORTED):
 * the files endpoint returns only PDF/ZIP bytes.
 */

import {
  connectionScope,
  cursorPagerKey,
  pageByRows,
  pageLocally,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { Credentials, CursorPage, QueryParams } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { AuditTrailEntry } from '../../schema/audit-trail-entry'
import type { Template } from '../../schema/template'
import type { WebhookEvent } from '../../schema/webhook'

import {
  buildAuthUrl,
  exchangeCode as dropboxSignExchange,
  refreshCredentials as dropboxSignRefresh,
} from './auth'
import { DropboxSignClient } from './client'
import { DEFAULT_PAGE_SIZE, DEFAULT_SCOPES, MAX_PAGE_SIZE } from './constants'
import { verifyDropboxSignWebhook, parseDropboxSignWebhookEvents } from './webhook'

import {
  transformEnvelope,
  type RawDropboxSignSignatureRequest,
} from './transform/envelope'
import { transformSigner } from './transform/signer'
import {
  transformAuditTrailEntry,
  type SyntheticAuditEvent,
} from './transform/audit-trail-entry'
import { transformTemplate, type RawDropboxSignTemplate } from './transform/template'

export interface DropboxSignAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

interface ListInfo {
  page?: number
  num_pages?: number
  num_results?: number
  page_size?: number
}

interface ListSigReqResponse {
  signature_requests?: RawDropboxSignSignatureRequest[]
  list_info?: ListInfo
}

interface ListTemplatesResponse {
  templates?: RawDropboxSignTemplate[]
  list_info?: ListInfo
}

/**
 * Dropbox Sign's only per-request files operation is "Download Files",
 * `GET /signature_request/files/{signature_request_id}`: "Obtain a copy of
 * the current documents specified by the `signature_request_id` parameter.
 * Returns a PDF or ZIP file." Its `file_type` is "`pdf` for a single merged
 * document or `zip` for a collection of individual documents"
 * (https://developers.hellosign.com/api/reference/operation/signatureRequestFiles/).
 * No documented operation names or enumerates a request's documents, and the
 * canonical Document refuses content, so documents are refused before any
 * request. (The old call sent an undocumented `file_type=json`.)
 */
function documentsNotSupported(what: string): Error {
  return Object.assign(
    new Error(
      `Dropbox Sign cannot ${what}: its files endpoint "Returns a PDF or ZIP file." and no documented operation lists a signature request's documents`,
    ),
    { statusCode: 501, code: 'NOT_SUPPORTED' },
  )
}

export class DropboxSignAdapter implements DocsignAdapter {
  readonly platform = 'dropbox-sign'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: DropboxSignAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return dropboxSignExchange(code, this.clientId, this.clientSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return dropboxSignRefresh(credentials, this.clientSecret)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyDropboxSignWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseDropboxSignWebhookEvents(payload)
  }

  private client(credentials: Credentials): DropboxSignClient {
    return new DropboxSignClient(credentials)
  }

  /**
   * One caller page of a `page` + `page_size` list (`/signature_request/list`,
   * `/template/list`).
   *
   * Dropbox Sign's `page_size` "Must be between `1` and `100`", and
   * `list_info.num_pages` is the "Total number of pages available."
   * (https://developers.hellosign.com/api/reference/operation/signatureRequestList/).
   * A caller limit of 100 or less is one upstream page: `page` and `page_size`
   * pass straight through and `list_info` decides `hasMore`. A larger limit
   * (the sync worker asks for 500 when no max is declared) cannot be sent
   * upstream, so `pageByRows` fills it from 100-row upstream pages instead.
   * The key is per connection (the token response names no account) plus the
   * `query` filter and the fixed upstream page size.
   */
  private async pageList<Res extends { list_info?: ListInfo }, Raw, R>(
    credentials: Credentials,
    params: QueryParams,
    path: string,
    pick: (res: Res) => Raw[],
    map: (raw: Raw) => R,
  ): Promise<R[]> {
    const client = this.client(credentials)
    const filters: Record<string, unknown> = params['query']
      ? { query: String(params['query']) }
      : {}
    const hasMoreOf = (info: ListInfo | undefined, page: number): boolean | undefined =>
      typeof info?.num_pages === 'number' ? page < info.num_pages : undefined
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    if (limit <= MAX_PAGE_SIZE) {
      const page = params.page ?? 1
      const res = await client.get<Res>(path, { page, page_size: limit, ...filters })
      const hasMore = hasMoreOf(res.list_info, page)
      if (hasMore !== undefined) reportUpstreamPage(params, { hasMore })
      return pick(res).map(map)
    }
    const key = cursorPagerKey(connectionScope('dropbox-sign', credentials), path, {
      ...filters,
      page_size: MAX_PAGE_SIZE,
    })
    const result = await pageByRows<R, number>(
      key,
      params,
      async (cursor): Promise<CursorPage<R, number>> => {
        const page = cursor ?? 1
        const res = await client.get<Res>(path, { page, page_size: MAX_PAGE_SIZE, ...filters })
        const rows = pick(res)
        const more = hasMoreOf(res.list_info, page) ?? rows.length >= MAX_PAGE_SIZE
        return { items: rows.map(map), next: more && rows.length > 0 ? page + 1 : undefined }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return result.items
  }

  // ── Envelopes (signature_requests) ────────────────────────────────────────

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    return this.pageList(
      credentials,
      params,
      '/signature_request/list',
      (res: ListSigReqResponse) => res.signature_requests ?? [],
      transformEnvelope,
    )
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const res = await this.client(credentials).get<{ signature_request?: RawDropboxSignSignatureRequest }>(
      `/signature_request/${id}`,
    )
    if (!res.signature_request) throw new Error(`signature_request ${id} not found`)
    return transformEnvelope(res.signature_request)
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Envelope> {
    await this.client(credentials).post(`/signature_request/cancel/${id}`)
    return this.getEnvelope(credentials, id)
  }

  // ── Signers (signatures on a request) ─────────────────────────────────────

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    const res = await this.client(credentials).get<{
      signature_request?: RawDropboxSignSignatureRequest
    }>(`/signature_request/${envelopeId}`)
    const request = res.signature_request
    if (!request) throw new Error(`signature_request ${envelopeId} not found`)
    // One GET returns every signature on the request: page it locally.
    return pageLocally(
      (request.signatures ?? []).map((s) => transformSigner(s, request)),
      params,
    )
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    // Dropbox Sign signature_id is globally unique but not addressable. The
    // adapter expects the caller to surface envelope context via list calls.
    throw new Error(
      'Dropbox Sign does not expose a signer-by-id endpoint. Use listSigners(envelopeId) and filter.',
    )
    // unreachable
    void id
    void credentials
  }

  // ── Documents: refused ────────────────────────────────────────────────

  async listDocuments(
    _credentials: Credentials,
    _envelopeId: string,
    _params: QueryParams,
  ): Promise<Document[]> {
    throw documentsNotSupported('list documents')
  }

  async getDocument(_credentials: Credentials, _id: string): Promise<Document> {
    throw documentsNotSupported('read a document')
  }

  // ── Audit-trail entries — synthesised from per-signer timestamps ─────────

  async listAuditTrailEntries(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    const res = await this.client(credentials).get<{
      signature_request?: RawDropboxSignSignatureRequest
    }>(`/signature_request/${envelopeId}`)
    const request = res.signature_request
    if (!request) throw new Error(`signature_request ${envelopeId} not found`)
    const events: SyntheticAuditEvent[] = []
    if (request.created_at) {
      events.push({
        envelopeId,
        occurredUnix: request.created_at,
        type: 'created',
        description: 'Signature request created',
      })
    }
    for (const sig of request.signatures ?? []) {
      if (sig.last_viewed_at) {
        events.push({
          envelopeId,
          occurredUnix: sig.last_viewed_at,
          type: 'viewed',
          signerEmail: sig.signer_email_address,
          signerName: sig.signer_name,
          signatureId: sig.signature_id,
          description: 'Signer viewed the document',
        })
      }
      if (sig.last_reminded_at) {
        events.push({
          envelopeId,
          occurredUnix: sig.last_reminded_at,
          type: 'auto_reminded',
          signerEmail: sig.signer_email_address,
          signerName: sig.signer_name,
          signatureId: sig.signature_id,
          description: 'Reminder sent to signer',
        })
      }
      if (sig.signed_at) {
        events.push({
          envelopeId,
          occurredUnix: sig.signed_at,
          type: 'signed',
          signerEmail: sig.signer_email_address,
          signerName: sig.signer_name,
          signatureId: sig.signature_id,
          description: 'Signer signed',
        })
      }
    }
    if (request.is_complete && request.created_at) {
      events.push({
        envelopeId,
        occurredUnix: request.created_at,
        type: 'completed',
        description: 'Signature request completed',
      })
    }
    events.sort((a, b) => a.occurredUnix - b.occurredUnix)
    // Synthesised from one whole signature_request: page it locally.
    return pageLocally(
      events.map((e, i) => transformAuditTrailEntry(e, i)),
      params,
    )
  }

  async getAuditTrailEntry(credentials: Credentials, id: string): Promise<AuditTrailEntry> {
    const [envelopeId, indexStr] = id.split(':')
    if (!envelopeId || !indexStr) {
      throw new Error('Dropbox Sign audit-trail id expects shape "<envelopeId>:<index>"')
    }
    const all = await this.listAuditTrailEntries(credentials, envelopeId, {})
    const found = all[Number(indexStr)]
    if (!found) throw new Error(`Audit entry ${id} not found`)
    return found
  }

  // ── Templates ────────────────────────────────────────────────────────────

  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    return this.pageList(
      credentials,
      params,
      '/template/list',
      (res: ListTemplatesResponse) => res.templates ?? [],
      transformTemplate,
    )
  }

  async getTemplate(credentials: Credentials, id: string): Promise<Template> {
    const res = await this.client(credentials).get<{ template?: RawDropboxSignTemplate }>(
      `/template/${id}`,
    )
    if (!res.template) throw new Error(`template ${id} not found`)
    return transformTemplate(res.template)
  }
}
