/**
 * DocuSign adapter — reference implementation for the docsign vertical.
 *
 * Wires DocuSign Authorization-Code Grant OAuth, the per-account REST API,
 * and DocuSign Connect's HMAC-signed webhooks to the canonical docsign
 * schema. Covers envelopes, signers, documents (metadata only), audit-
 * trail entries, and templates.
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import { pageLocally, pageOffset, reportUpstreamPage } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { AuditTrailEntry } from '../../schema/audit-trail-entry'
import type { Template } from '../../schema/template'
import type { WebhookEvent } from '../../schema/webhook'

import {
  buildAuthUrl,
  exchangeCode as docusignExchange,
  refreshCredentials as docusignRefresh,
} from './auth'
import { DocuSignClient } from './client'
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_SCOPES,
  ENVELOPES_FROM_DATE_FLOOR,
  MAX_PAGE_SIZE,
} from './constants'
import { verifyDocuSignWebhook, parseDocuSignWebhookEvents } from './webhook'

import {
  transformEnvelope,
  type RawDocuSignEnvelope,
} from './transform/envelope'
import { transformSigner, type RawDocuSignSigner } from './transform/signer'
import { transformDocument, type RawDocuSignDocument } from './transform/document'
import {
  transformAuditTrailEntry,
  type RawDocuSignAuditEvent,
} from './transform/audit-trail-entry'
import { transformTemplate, type RawDocuSignTemplate } from './transform/template'

export interface DocuSignAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

/**
 * The paging fields both offset lists return (envelopesInformation,
 * envelopeTemplateResults). The spec types every count and position as a
 * string. `nextUri` "is `null` if this is the last set of results for the
 * search."
 */
interface OffsetSetResponse {
  nextUri?: string | null
  totalSetSize?: string | number
  resultSetSize?: string
  endPosition?: string
}

interface EnvelopeListResponse extends OffsetSetResponse {
  envelopes?: RawDocuSignEnvelope[]
}

interface RecipientsResponse {
  signers?: RawDocuSignSigner[]
  carbonCopies?: RawDocuSignSigner[]
  inPersonSigners?: RawDocuSignSigner[]
  witnesses?: RawDocuSignSigner[]
  editors?: RawDocuSignSigner[]
  certifiedDeliveries?: RawDocuSignSigner[]
  agents?: RawDocuSignSigner[]
  intermediaries?: RawDocuSignSigner[]
}

interface DocumentsResponse {
  envelopeDocuments?: RawDocuSignDocument[]
}

interface AuditEventsResponse {
  auditEvents?: RawDocuSignAuditEvent[]
}

interface TemplatesResponse extends OffsetSetResponse {
  envelopeTemplates?: RawDocuSignTemplate[]
}

/** The `count` and zero-based `start_position` one offset request sends. */
interface OffsetWindow {
  count: number
  start: number
}

/** `totalSetSize` as a row count, or `undefined` when it is not one. */
function setSize(raw: string | number | undefined): number | undefined {
  if (typeof raw === 'number') return Number.isSafeInteger(raw) && raw >= 0 ? raw : undefined
  if (typeof raw === 'string' && /^\d+$/.test(raw.trim())) return Number(raw.trim())
  return undefined
}

/**
 * Whether a set says rows exist past `served`, the index after the last row
 * read: its `nextUri` is non-empty, or it served `rows` and they stop short
 * of its total. See `reportSetEnd`.
 */
function setHasMore(res: OffsetSetResponse, served: number, rows: number): boolean {
  const total = setSize(res.totalSetSize)
  return Boolean(res.nextUri) || (rows > 0 && total !== undefined && served < total)
}

export class DocuSignAdapter implements DocsignAdapter {
  readonly platform = 'docusign'
  readonly version = '0.1.0'
  /**
   * Envelopes serve at most 1000 a request ("The maximum value is 1000.");
   * templates document no maximum; the other three lists are whole fetches
   * sliced by `pageLocally`. See MAX_PAGE_SIZE.
   */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: DocuSignAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return docusignExchange(code, redirectUri, this.clientId, this.clientSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return docusignRefresh(credentials, this.clientId, this.clientSecret)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyDocuSignWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseDocuSignWebhookEvents(payload)
  }

  private client(credentials: Credentials): DocuSignClient {
    return new DocuSignClient(credentials)
  }

  /**
   * One caller page of an offset list: `count` rows from the zero-based
   * `start_position` ("The zero-based index of the result from which to start
   * returning results. Use with `count` to limit the number of results.").
   *
   * `maxCount` is the endpoint's documented ceiling, when it has one. A limit
   * above it is sent as the ceiling, positioned by the ceiling so no row is
   * skipped between pages, and reported as `pageSize` so a full page of 1000
   * against a limit of 2500 is not read as the last one.
   */
  private offsetWindow(params: QueryParams, maxCount?: number): OffsetWindow {
    const asked = params.limit ?? DEFAULT_PAGE_SIZE
    const count = maxCount === undefined ? asked : Math.min(asked, maxCount)
    if (count < asked) reportUpstreamPage(params, { pageSize: count })
    return { count, start: pageOffset(params, count) }
  }

  /** The caller's `updated_after`, as DocuSign's date parameters take it. */
  private updatedSince(params: QueryParams): string | undefined {
    if (params['updated_after']) return String(params['updated_after'])
    if (params.updatedAfter instanceof Date) return params.updatedAfter.toISOString()
    return undefined
  }

  /**
   * DocuSign's own end signal: `nextUri` "is `null` if this is the last set of
   * results", and `totalSetSize` counts every matching row. Reported so the
   * router's `meta.hasMore` and the sync worker stop exactly at the end,
   * including when the total is an exact multiple of the page size.
   *
   * The two are read so they cannot disagree. The sync worker stops on
   * `hasMore` alone; the router ranks `totalCount` above it and reads it as
   * `page × pageSize < total`, i.e. `start + count < total`.
   * - More rows exist when `nextUri` is non-empty, or when the rows served so
   *   far fall short of the total. A last set whose `nextUri` is absent or ""
   *   rather than null therefore still ends the read, and a set that drops
   *   `nextUri` early does not truncate it. An empty set never claims more, so
   *   a total that overstates the rows cannot keep the sync paging.
   * - The total is reported only when it is at least the rows already served
   *   and the router's reading of it matches `hasMore`. Otherwise it is not
   *   the whole set's size, and the router falls back to `hasMore` as well.
   */
  private reportSetEnd(
    params: QueryParams,
    res: OffsetSetResponse,
    sent: OffsetWindow,
    rows: number,
  ): void {
    const total = setSize(res.totalSetSize)
    const served = sent.start + rows
    const hasMore = setHasMore(res, served, rows)
    const routerSaysMore = total !== undefined && sent.start + sent.count < total
    const totalAgrees = total !== undefined && total >= served && routerSaysMore === hasMore
    reportUpstreamPage(params, { hasMore, ...(totalAgrees ? { totalCount: total } : {}) })
  }

  /**
   * The rows of one caller page: `sent.count` of them from `sent.start`, read
   * from as many sets as that takes.
   *
   * The next caller page starts at `start + count` whatever this one got, so a
   * set cut short while it still reports more would skip every row between its
   * end and `count`. Nothing documents a short set in the middle of a read, and
   * nothing rules one out: GET /envelopes takes a `query_budget`, "The time in
   * seconds that the query should run before returning data." So such a set is
   * continued at the index after its last row (`start_position`: "The
   * zero-based index of the result from which to start returning results.")
   * for the rows still missing, until the page is full, a set reports no more
   * (`setHasMore`), or a set comes back empty. A full set, and the last one,
   * is one request as before. Every further request adds at least one row, so
   * the loop ends within `count` requests. If DocuSign's index ever counted
   * rows it did not return, reading on from the rows returned repeats a row
   * rather than skipping one.
   *
   * Still undetectable: a set cut short that also reports the end (no
   * `nextUri`, and no total above the rows served).
   */
  private async readPage<T>(
    params: QueryParams,
    sent: OffsetWindow,
    fetchSet: (count: number, start: number) => Promise<{ set: OffsetSetResponse; rows: T[] }>,
  ): Promise<T[]> {
    const rows: T[] = []
    for (;;) {
      const want = sent.count - rows.length
      const { set, rows: got } = await fetchSet(want, sent.start + rows.length)
      // Kept whole even past `want`: cutting a set that also reports the end
      // would lose its extra rows, where keeping them only repeats them on the
      // next page.
      rows.push(...got)
      const full = rows.length >= sent.count
      if (full || got.length === 0 || !setHasMore(set, sent.start + rows.length, got.length)) {
        this.reportSetEnd(params, set, sent, rows.length)
        return rows
      }
    }
  }

  // ── Envelopes ─────────────────────────────────────────────────────────────

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const filters: Record<string, unknown> = {
      // Required ("must include one or more of ... from_date, envelope_ids,
      // transaction_ids"), and without it "envelopes from more than two years
      // ago will not be returned". A full read sends a floor older than any
      // envelope. See ENVELOPES_FROM_DATE_FLOOR.
      //
      // No `to_date`. The reference gives it a default ("The default is the
      // current date and time.") and leaves it out of that required list, and
      // DocuSign's how-to for this call sends only `from_date`. The "Searching
      // for envelopes" concept page disagrees ("to_date and from_date are
      // required parameters"); the reference is followed unless a live 400
      // shows otherwise.
      from_date: this.updatedSince(params) ?? ENVELOPES_FROM_DATE_FLOOR,
      // Offset paging serves each row once only over an order that does not
      // move while the pages are read, and the spec documents no default. By
      // creation date, oldest first, an envelope that changes between two
      // requests keeps its position, and a new one lands after every existing
      // row. (`order_by`: "`created`"; `order`: "ascending (`asc`)".)
      //
      // The set itself only grows while it is read. `from_date` matches status
      // changes ("If `Changed` is specified, then envelopes that changed status
      // during the period are returned. The default value is `Changed`."), and
      // with no `to_date` that period runs to the time of each request. An
      // envelope that joins mid-read ahead of the offset repeats a row on the
      // next page; none can leave, so none is skipped. That holds only without
      // `status`, below.
      order_by: 'created',
      order: 'asc',
      include: 'recipients,documents,custom_fields',
    }
    // A direct caller's filter: "A comma-separated list of current envelope
    // statuses to be included in the response." An envelope whose status
    // changes mid-read can leave that set, moving every row after it back one
    // place, so one row is skipped. Neither the router nor the sync worker
    // sends it (parseListQuery passes only page, limit, updated_after and
    // search), so only a direct caller that asks for it takes that risk.
    if (params['status']) filters.status = String(params['status'])
    const client = this.client(credentials)
    const envelopes = await this.readPage(
      params,
      this.offsetWindow(params, MAX_PAGE_SIZE),
      async (count, start) => {
        const set = await client.get<EnvelopeListResponse>('/envelopes', {
          count,
          start_position: start,
          ...filters,
        })
        return { set, rows: set.envelopes ?? [] }
      },
    )
    return envelopes.map(transformEnvelope)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const raw = await this.client(credentials).get<RawDocuSignEnvelope>(
      `/envelopes/${id}`,
      { include: 'recipients,documents,custom_fields' },
    )
    return transformEnvelope(raw)
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Envelope> {
    await this.client(credentials).put(`/envelopes/${id}`, {
      status: 'voided',
      voidedReason: data?.reason ?? 'Voided by API',
    })
    return this.getEnvelope(credentials, id)
  }

  // ── Signers ───────────────────────────────────────────────────────────────

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    // Recipients_GetRecipients takes no paging parameter: it "Retrieves the
    // status of all recipients in a single envelope", so every call returns
    // the whole list and the caller's page is cut from it.
    const res = await this.client(credentials).get<RecipientsResponse>(
      `/envelopes/${envelopeId}/recipients`,
    )
    const out: Signer[] = []
    for (const [typeKey, list] of Object.entries(res)) {
      if (!Array.isArray(list)) continue
      for (const raw of list as RawDocuSignSigner[]) {
        out.push(transformSigner(raw, envelopeId, typeKey))
      }
    }
    return pageLocally(out, params)
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    const [envelopeId, recipientId] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId || !recipientId) {
      throw new Error('getSigner expects an id of shape "<envelopeId>:<recipientId>"')
    }
    const all = await this.listSigners(credentials, envelopeId, {})
    const found = all.find((s) => s.externalId === recipientId)
    if (!found) throw new Error(`Signer ${recipientId} not found on envelope ${envelopeId}`)
    return found
  }

  // ── Documents (metadata only — content REFUSED) ──────────────────────────

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    // Documents_GetDocuments takes no paging parameter and returns every
    // document on the envelope; the caller's page is cut from that.
    const res = await this.client(credentials).get<DocumentsResponse>(
      `/envelopes/${envelopeId}/documents`,
    )
    return pageLocally(
      (res.envelopeDocuments ?? []).map((raw) => transformDocument(raw, envelopeId)),
      params,
    )
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const [envelopeId, documentId] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId || !documentId) {
      throw new Error('getDocument expects an id of shape "<envelopeId>:<documentId>"')
    }
    const all = await this.listDocuments(credentials, envelopeId, {})
    const found = all.find((d) => d.externalId === documentId)
    if (!found) throw new Error(`Document ${documentId} not found on envelope ${envelopeId}`)
    return found
  }

  // ── Audit-trail entries ──────────────────────────────────────────────────

  async listAuditTrailEntries(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    // AuditEvents_GetAuditEvents takes no paging parameter (only `locale`) and
    // returns every event. Mapped BEFORE slicing: an entry's id is its index in
    // the whole list ("<envelopeId>:<index>"), which getAuditTrailEntry
    // resolves by position, so a page-local index would renumber page 2.
    const res = await this.client(credentials).get<AuditEventsResponse>(
      `/envelopes/${envelopeId}/audit_events`,
    )
    return pageLocally(
      (res.auditEvents ?? []).map((raw, i) => transformAuditTrailEntry(raw, envelopeId, i)),
      params,
    )
  }

  async getAuditTrailEntry(credentials: Credentials, id: string): Promise<AuditTrailEntry> {
    const [envelopeId, indexStr] = id.split(':')
    if (!envelopeId || !indexStr) {
      throw new Error('getAuditTrailEntry expects an id of shape "<envelopeId>:<index>"')
    }
    const all = await this.listAuditTrailEntries(credentials, envelopeId, {})
    const found = all[Number(indexStr)]
    if (!found) throw new Error(`Audit entry ${id} not found`)
    return found
  }

  // ── Templates ────────────────────────────────────────────────────────────

  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    // No documented `count` maximum for templates, so the caller's limit is
    // sent as is. The router (500) and the sync worker (MAX_PAGE_SIZE, 1000)
    // never ask for more than one call serves by DocuSign's own default: "If
    // the `count` parameter is not used, `listTemplates` has a default limit
    // of 2,000 templates." A set that serves fewer anyway, while it still
    // reports more, is filled by `readPage`.
    //
    // Known risk: no `order_by` is sent, and the order can move mid-read. The
    // spec documents no default order, and each value it offers moves when a
    // template changes ("`name`: template name", "`modified`: date/time
    // template was last modified", "`used`: date/time the template was last
    // used."). A template renamed, edited, used or deleted between two pages
    // can shift the rows after it by one place, repeating or skipping one.
    // Which order is safest cannot be told from the docs, so none is pinned.
    const filters: Record<string, unknown> = {}
    // `updated_after` is a modification watermark. On /templates `from_date`
    // "Only returns templates created on or after this date/time", which
    // would drop every template edited since but created before; the
    // modification filter is `modified_from_date` ("Lists templates modified
    // on or after this date."). /templates takes no `status` parameter.
    const since = this.updatedSince(params)
    if (since) filters.modified_from_date = since
    const client = this.client(credentials)
    const templates = await this.readPage(
      params,
      this.offsetWindow(params),
      async (count, start) => {
        const set = await client.get<TemplatesResponse>('/templates', {
          count,
          start_position: start,
          ...filters,
        })
        return { set, rows: set.envelopeTemplates ?? [] }
      },
    )
    return templates.map(transformTemplate)
  }

  async getTemplate(credentials: Credentials, id: string): Promise<Template> {
    const raw = await this.client(credentials).get<RawDocuSignTemplate>(`/templates/${id}`)
    return transformTemplate(raw)
  }
}
