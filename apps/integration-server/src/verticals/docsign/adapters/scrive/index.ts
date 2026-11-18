/**
 * Scrive adapter (Swedish, Nordic-wide eIDAS QES via BankID rails).
 */
import { pageLocally, pageOffset, reportUpstreamPage } from '@opensteward/shared'
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
  exchangeCode as scriveExchange,
  refreshCredentials as scriveRefresh,
} from './auth'
import { ScriveClient } from './client'
import { DEFAULT_PAGE_SIZE, DEFAULT_SCOPES } from './constants'
import { verifyScriveWebhook, parseScriveWebhookEvents } from './webhook'

import { transformEnvelope, type RawScriveDocument } from './transform/envelope'
import { transformSigner } from './transform/signer'
import { documentFiles, transformDocument } from './transform/document'
import { transformAuditTrailEntry, type RawScriveHistory } from './transform/audit-trail-entry'
import { transformTemplate } from './transform/template'

export interface ScriveAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

/**
 * GET /documents/list 200: "A JSON object containing the total number of
 * matching documents, and an array of documents. The total_matching value is
 * capped at 1,000 + offset." (https://apidocs.scrive.com/, "List documents";
 * the key names are those of the "Example of a Folder Listing":
 * { "total_matching": 2, "documents": [ <Document JSON> ] }).
 */
interface DocumentsListResponse {
  total_matching?: number
  documents?: RawScriveDocument[]
}

/** The documented "List Filter" objects this adapter sends. */
type ListFilter =
  | { filter_by: 'is_template' }
  | { filter_by: 'is_not_template' }
  | { filter_by: 'status'; statuses: readonly string[] }

/**
 * Every value of the documented "Document Status" enum. The list call's
 * `filter` parameter says: "Note that documents with "awaiting_start" status
 * won't be listed, unless they are explicitly specified by status filter."
 * Naming every status keeps bulk-send documents that are waiting to start in
 * listEnvelopes without excluding anything else.
 */
const ALL_DOCUMENT_STATUSES = [
  'preparation',
  'awaiting_start',
  'pending',
  'closed',
  'canceled',
  'timedout',
  'rejected',
  'document_error',
] as const

/**
 * Upstream requests one caller page may take when the server caps `max`
 * below the caller's limit ("Server may cap to a lower value").
 */
const MAX_REQUESTS_PER_PAGE = 50

/** "The total_matching value is capped at 1,000 + offset." */
const TOTAL_MATCHING_CAP = 1_000

export class ScriveAdapter implements DocsignAdapter {
  readonly platform = 'scrive'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: ScriveAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return scriveExchange(code, redirectUri, this.clientId, this.clientSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return scriveRefresh(credentials, this.clientId, this.clientSecret)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyScriveWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseScriveWebhookEvents(payload)
  }

  private client(credentials: Credentials): ScriveClient {
    return new ScriveClient(credentials)
  }

  /**
   * One caller page of GET /documents/list (https://apidocs.scrive.com/,
   * "List documents"): "offset ... Starting offset for documents to return",
   * "max ... Maximum number of documents to return. Server may cap to a lower
   * value.", "filter ... Must be of type List Filter" (a JSON string).
   *
   * The caller's page N at limit L is offset (N-1)×L, max L. When the server
   * caps `max`, the offset advances by the rows actually returned until the
   * page is full or the list ends. `hasMore` comes from `total_matching`,
   * which is "capped at 1,000 + offset" — so it still says whether a row
   * exists past the page.
   */
  private async pageDocuments(
    credentials: Credentials,
    params: QueryParams,
    filter: ListFilter[],
  ): Promise<RawScriveDocument[]> {
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const start = pageOffset(params, limit)
    const client = this.client(credentials)
    const out: RawScriveDocument[] = []
    let offset = start
    let more: boolean | undefined
    for (let i = 0; i < MAX_REQUESTS_PER_PAGE && out.length < limit; i++) {
      const res = await client.get<DocumentsListResponse>('/documents/list', {
        offset,
        max: limit - out.length,
        filter: JSON.stringify(filter),
      })
      if (typeof res.total_matching !== 'number') {
        throw new Error('scrive /documents/list returned no total_matching')
      }
      // "if the total_matching value is equal to 1,000 + offset, further API
      // calls will be needed, with a higher offset, to make sure that the end
      // of the list of documents has been reached."
      const capped = res.total_matching === offset + TOTAL_MATCHING_CAP
      const rows = res.documents ?? []
      out.push(...rows)
      offset += rows.length
      // An empty page ends the walk whatever the count says: asking again at
      // the same offset would return the same nothing.
      more = rows.length > 0 && (capped || offset < res.total_matching)
      if (!more) break
    }
    if (more !== undefined) reportUpstreamPage(params, { hasMore: more })
    return out
  }

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    // Templates are documents too; "Only non-templates" keeps them out.
    const rows = await this.pageDocuments(credentials, params, [
      { filter_by: 'is_not_template' },
      { filter_by: 'status', statuses: ALL_DOCUMENT_STATUSES },
    ])
    return rows.map(transformEnvelope)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    return transformEnvelope(await this.getRawDocument(credentials, id))
  }

  /** GET /documents/{document_id}/get: "Get the JSON metadata for a given document_id." */
  private async getRawDocument(credentials: Credentials, id: string): Promise<RawScriveDocument> {
    return this.client(credentials).get<RawScriveDocument>(
      `/documents/${encodeURIComponent(id)}/get`,
    )
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Envelope> {
    await this.client(credentials).post(`/documents/${id}/cancel`)
    return this.getEnvelope(credentials, id)
  }

  /** Every party of the document ("parties" on the Document JSON), served locally. */
  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    const raw = await this.getRawDocument(credentials, envelopeId)
    const signers = (raw.parties ?? []).map((p) => transformSigner(p, envelopeId, raw.status))
    return pageLocally(signers, params)
  }

  async getSigner(_credentials: Credentials, id: string): Promise<Signer> {
    throw new Error(
      `Scrive does not expose a global signer endpoint. Use listSigners(envelopeId). id=${id}`,
    )
  }

  /** The document's main file, sealed file and author attachments, served locally. */
  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    const raw = await this.getRawDocument(credentials, envelopeId)
    const docs = documentFiles(raw).map((f, i) => transformDocument(f, envelopeId, i))
    return pageLocally(docs, params)
  }

  async getDocument(_credentials: Credentials, id: string): Promise<Document> {
    throw new Error(
      `Scrive documents are envelope-scoped; call listDocuments(envelopeId). id=${id}`,
    )
  }

  /**
   * GET /documents/{document_id}/history (https://apidocs.scrive.com/, "Get
   * the Document History"): "The list of history items for this document.
   * Will be in reverse-chronological order and an array of History Items."
   * Reversed here so an entry's index, and so its id, never changes as
   * events are added.
   */
  private async allAuditTrailEntries(
    credentials: Credentials,
    envelopeId: string,
  ): Promise<AuditTrailEntry[]> {
    const res = await this.client(credentials).get<RawScriveHistory>(
      `/documents/${encodeURIComponent(envelopeId)}/history`,
    )
    return [...(res.events ?? [])]
      .reverse()
      .map((raw, i) => transformAuditTrailEntry(raw, envelopeId, i))
  }

  async listAuditTrailEntries(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    return pageLocally(await this.allAuditTrailEntries(credentials, envelopeId), params)
  }

  async getAuditTrailEntry(credentials: Credentials, id: string): Promise<AuditTrailEntry> {
    const [envelopeId, indexStr] = id.split(':')
    if (!envelopeId || !indexStr) {
      throw new Error('scrive audit-trail id expects shape "<envelopeId>:<index>"')
    }
    const all = await this.allAuditTrailEntries(credentials, envelopeId)
    const found = all[Number(indexStr)]
    if (!found) throw new Error(`audit entry ${id} not found`)
    return found
  }

  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    try {
      const rows = await this.pageDocuments(credentials, params, [{ filter_by: 'is_template' }])
      return rows.map(transformTemplate)
    } catch (err) {
      // 404 is a real answer here: several of these platforms simply do not
      // expose a template endpoint, and an empty list is the correct result.
      // Anything else (auth rejected, upstream 5xx) must propagate: listTemplates
      // is a LISTABLE_RESOURCES method, so the sync worker reads a returned array
      // as truth and would record a green "synced 0 templates" for a dead platform.
      if ((err as { response?: { status?: number } }).response?.status === 404) return []
      throw err
    }
  }

  async getTemplate(credentials: Credentials, id: string): Promise<Template> {
    return transformTemplate(await this.getRawDocument(credentials, id))
  }
}
