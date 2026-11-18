/**
 * Autenti adapter (Polish e-sign).
 *
 * Autenti Document Process API v2 at https://api.autenti.com/api/v2, OAuth2
 * authorization code grant. Reference: developers.autenti.com, served from
 * Stoplight project cHJqOjQxMTI4
 * (https://stoplight.io/api/v1/projects/cHJqOjQxMTI4/table-of-contents).
 */
import {
  connectionScope,
  cursorPagerKey,
  pageByRows,
  pageLocally,
  type CursorPage,
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
  exchangeCode as autentiExchange,
  refreshCredentials as autentiRefresh,
} from './auth'
import { AutentiClient, idSegment } from './client'
import { DEFAULT_PAGE_SIZE, DEFAULT_SCOPES, MAX_PAGE_SIZE } from './constants'
import { verifyAutentiWebhook, parseAutentiWebhookEvents } from './webhook'

import { transformEnvelope, type RawAutentiDocumentProcess } from './transform/envelope'
import { transformSigner } from './transform/signer'
import { transformDocument, type RawAutentiFile } from './transform/document'
import { transformAuditTrailEntry, type RawAutentiEvent } from './transform/audit-trail-entry'
import { SENDER_ROLE, type RawAutentiProcessParty } from './transform/party'

export interface AutentiAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

/**
 * The two `status` filter values that together make up the default
 * EVERYTHING list, neither of which caps the offset. The Pagination article
 * (https://stoplight.io/api/v1/projects/cHJqOjQxMTI4/nodes/30f41d2b8b50d):
 * "Filter value `EVERYTHING` and `ACCESSIBLE` return documents both in `DRAFT`
 * and `DOCUMENT_PROCESS` status, thus are subject to the limitation", the
 * table rows " DRAFT | unlimited | 128 |" / " DOCUMENT_PROCESS | unlimited |
 * 128 |" / " EVERYTHING | 256 | 128 |", and "`DOCUMENT_PROCESS` is a symbolic
 * parameter value to represent documents in either `PROCESSING`, `COMPLETED`
 * and `WITHDRAWN` status (i.e. those documents which were sent, and not
 * drafts)".
 */
const STATUS_CHAIN = ['DRAFT', 'DOCUMENT_PROCESS'] as const
type StatusFilter = (typeof STATUS_CHAIN)[number]

interface ListCursor {
  status: StatusFilter
  offset: number
}

/** The documented list responses are JSON arrays; anything else is an upstream fault, not an empty list. */
function asArray<T>(body: unknown, path: string): T[] {
  if (!Array.isArray(body)) throw new Error(`Autenti ${path} did not return a JSON array`)
  return body as T[]
}

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

export class AutentiAdapter implements DocsignAdapter {
  readonly platform = 'autenti'
  readonly version = '0.2.0'
  /**
   * The document list's documented ceiling ("The maximum page size is 128
   * documents."), so the router and the sync worker ask for pages of at most
   * 128 and judge a short page against the size actually asked for.
   */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: AutentiAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return autentiExchange(code, redirectUri, this.clientId, this.clientSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return autentiRefresh(credentials, this.clientId, this.clientSecret)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyAutentiWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseAutentiWebhookEvents(payload)
  }

  private client(credentials: Credentials): AutentiClient {
    return new AutentiClient(credentials)
  }

  /**
   * `GET /document-processes` (node 6086c650d5497, "Get list of document
   * processes"), paged by `offset` and `limit`. The Pagination article:
   * "`offset`| 0 | 0 | the number of documents to be skipped at the beginning
   * of the list (1 means to skip one document, starting the list from the
   * second document)". It returns no total and no next link, so a page
   * shorter than the limit asked for is the end of a status chain; the limit
   * is kept at or under the documented maximum of 128 so that a silently
   * reduced page is never mistaken for the end.
   *
   * The default EVERYTHING list caps `offset` at 256, so the walk runs the
   * DRAFT list and then the DOCUMENT_PROCESS list, neither of which is
   * capped. `pageByRows` cuts the caller's exact rows out of that stream and
   * reports `hasMore` from the end of the second chain. The key is per
   * connection and per upstream page size.
   */
  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const client = this.client(credentials)
    const asked =
      typeof params.limit === 'number' && params.limit >= 1
        ? Math.floor(params.limit)
        : DEFAULT_PAGE_SIZE
    const size = Math.min(asked, MAX_PAGE_SIZE)
    const key = cursorPagerKey(connectionScope('autenti', credentials), 'document-processes', {
      upstreamLimit: size,
    })
    const result = await pageByRows<Envelope, ListCursor>(
      key,
      params,
      async (cursor): Promise<CursorPage<Envelope, ListCursor>> => {
        const at = cursor ?? { status: STATUS_CHAIN[0], offset: 0 }
        const list = asArray<RawAutentiDocumentProcess>(
          await client.get<unknown>('/document-processes', {
            status: at.status,
            offset: at.offset,
            limit: size,
          }),
          '/document-processes',
        )
        let next: ListCursor | undefined
        if (list.length >= size) next = { status: at.status, offset: at.offset + list.length }
        else if (at.status === 'DRAFT') next = { status: 'DOCUMENT_PROCESS', offset: 0 }
        return { items: list.map(transformEnvelope), next }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return result.items
  }

  /** `GET /document-processes/{document-process-id}` (node 09e06bc0afb95). */
  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const raw = await this.client(credentials).get<RawAutentiDocumentProcess>(
      `/document-processes/${idSegment(id)}`,
    )
    return transformEnvelope(raw)
  }

  // Write method, out of scope for the list rebuild: POST /documents/{id}/cancel
  // is not in the documented API (withdrawal is an action, "Document
  // withdrawal action", node zazwrdyiny0ku). Left unchanged.
  async voidEnvelope(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Envelope> {
    await this.client(credentials).post(`/documents/${id}/cancel`, {
      reason: data?.reason ?? 'Voided by API',
    })
    return this.getEnvelope(credentials, id)
  }

  /**
   * `GET /document-processes/{document-process-id}/parties` (node
   * 2dcb902bb22f3, "Get details of document process participants"). It takes
   * only the path id. It is read as a stream, which is unbounded, so the whole
   * list arrives (a paginated JSON array would stop at the default 64 or the
   * maximum 128; see `AutentiClient.getStream`), and the caller's page is
   * cut here. The SENDER party is the envelope's sender, not a recipient, and
   * is left out.
   */
  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    const path = `/document-processes/${idSegment(envelopeId)}/parties`
    const rows = (await this.client(credentials).getStream(path)) as RawAutentiProcessParty[]
    const signers = rows
      .filter((p) => p.role !== SENDER_ROLE)
      .map((p) => transformSigner(p, envelopeId))
    return pageLocally(signers, params)
  }

  async getSigner(_credentials: Credentials, id: string): Promise<Signer> {
    throw new Error(`Autenti signers are document-scoped; call listSigners(envelopeId). id=${id}`)
  }

  /**
   * `GET /document-processes/{document-process-id}/files` (node 5e7fcb0dff25e,
   * "Get details of files related to given document process"). Path id only;
   * read whole as a stream (see `AutentiClient.getStream`), paged here.
   */
  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    const path = `/document-processes/${idSegment(envelopeId)}/files`
    const rows = (await this.client(credentials).getStream(path)) as RawAutentiFile[]
    const docs = rows.map((f, i) => transformDocument(f, envelopeId, i))
    return pageLocally(docs, params)
  }

  async getDocument(_credentials: Credentials, id: string): Promise<Document> {
    throw new Error(
      `Autenti documents are envelope-scoped; call listDocuments(envelopeId). id=${id}`,
    )
  }

  /**
   * `GET /document-processes/{document-process-id}/actions` (node
   * 945d5931f2fcb): "Allows to retrieve list of events (action results) that
   * were registered on given document". Path id only; read whole as a stream
   * (see `AutentiClient.getStream`), paged here.
   */
  async listAuditTrailEntries(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    const path = `/document-processes/${idSegment(envelopeId)}/actions`
    const rows = (await this.client(credentials).getStream(path)) as RawAutentiEvent[]
    const entries = rows.map((e) => transformAuditTrailEntry(e, envelopeId))
    return pageLocally(entries, params)
  }

  async getAuditTrailEntry(_credentials: Credentials, _id: string): Promise<AuditTrailEntry> {
    throw notSupported(
      'Autenti cannot read one audit-trail entry: events are only listed per document, ' +
        'by "GET /document-processes/{document-process-id}/actions", and there is no event lookup by id',
    )
  }

  async listTemplates(_credentials: Credentials, _params: QueryParams): Promise<Template[]> {
    throw notSupported(
      'Autenti cannot list templates: the Autenti Document Process API documents no template ' +
        'operation (its operations are under /document-processes, /applications/callbacks, /clients and /tags)',
    )
  }

  async getTemplate(_credentials: Credentials, _id: string): Promise<Template> {
    throw notSupported(
      'Autenti cannot read templates: the Autenti Document Process API documents no template ' +
        'operation (its operations are under /document-processes, /applications/callbacks, /clients and /tags)',
    )
  }
}
