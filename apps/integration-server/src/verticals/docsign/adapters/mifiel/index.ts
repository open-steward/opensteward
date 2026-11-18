/**
 * Mifiel adapter (Mexican advanced electronic signature on the e.firma/FIEL).
 * HTTP Basic auth with APP_ID:APP_SECRET (see ./auth.ts).
 *
 * The API reference is https://docs.mifiel.com/en/api.json; the list surface
 * is `POST /api/query` ("Advanced information"), explained in
 * https://guia.mifiel.com/como-hacer-busquedas-avanzadas-api.
 *   - envelopes:   /api/query `{"resource": "document"}`, paged by `page` and
 *                  `per_page`; one document by `"q": {"id": {"eq": …}}`.
 *   - signers:     the `stakeholders` of that document of type Signer.
 *   - documents:   the document itself (a Mifiel document is one file).
 *   - audit trail, templates, a stakeholder by id: refused with 501.
 */
import { DEFAULT_PAGE_LIMIT, pageLocally, reportUpstreamPage } from '@opensteward/shared'
import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { AuditTrailEntry } from '../../schema/audit-trail-entry'
import type { Template } from '../../schema/template'
import type { WebhookEvent } from '../../schema/webhook'

import {
  credentialFields as mifielCredentialFields,
  exchangeCredentials as mifielExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { MifielClient } from './client'
import { QUERY_VERSION } from './constants'
import { verifyMifielWebhook, parseMifielWebhookEvents } from './webhook'

import { transformEnvelope, type RawMifielQueryDocument } from './transform/envelope'
import { isSigner, transformSigner } from './transform/signer'
import { transformDocument } from './transform/document'

export interface MifielAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

/**
 * The document attributes requested from /api/query. Only requested fields
 * come back ("Es importante definir este parámetro … en caso contrario la
 * respuesta podría aparecer “vacía”"), and relations follow the attributes
 * ("debes agregar las relaciones después de los atributos del recurso").
 * Every name is documented: see ./transform/envelope.ts and ./transform/signer.ts.
 */
const DOCUMENT_FIELDS =
  'id,file_file_name,state,signed,created_at,stakeholders(id,type,email,name,state)'

/**
 * Ascending creation order, so documents created during a walk land after it
 * instead of shifting the pages already served. "El parámetro sort se puede
 * usar para ordenar por cualquier atributo … -asc para orden ascendente".
 */
const DOCUMENT_SORT = 'created_at-asc'

/**
 * QueryResponse: `records`, plus paging metadata. The guide's responses print
 * it as `"_metadata": { "page", "per_page", "page_count", "total_count" }`
 * (the reference's schema names the same object `___metadata`; the printed
 * responses are what is read here).
 */
interface QueryResponse {
  records?: unknown
  _metadata?: {
    page?: unknown
    per_page?: unknown
    page_count?: unknown
    total_count?: unknown
  }
}

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

function records(res: QueryResponse | undefined): RawMifielQueryDocument[] {
  if (!Array.isArray(res?.records)) {
    throw new Error('mifiel POST /api/query did not return a records array')
  }
  return res.records as RawMifielQueryDocument[]
}

function pageNumber(params: QueryParams): number {
  const page = params.page
  return typeof page === 'number' && Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1
}

function pageSize(params: QueryParams): number {
  const limit = params.limit
  return typeof limit === 'number' && Number.isFinite(limit) && limit >= 1
    ? Math.floor(limit)
    : DEFAULT_PAGE_LIMIT
}

const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined

export class MifielAdapter implements DocsignAdapter {
  readonly platform = 'mifiel'
  readonly version = '0.2.0'

  constructor(_config: MifielAdapterConfig) {}

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('mifiel uses static APP_ID/APP_SECRET auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  credentialFields(): CredentialField[] {
    return mifielCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return mifielExchangeCredentials(fields)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyMifielWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseMifielWebhookEvents(payload)
  }

  private client(credentials: Credentials): MifielClient {
    return new MifielClient(credentials)
  }

  /**
   * One document by id: `"q": { "id": { "eq": id } }`, the guide's filter form
   * (`"q": { "{attribute_name}": { "{predicate}": "{search term}" } }`, String
   * predicate "eq: igual a"). A record with any other id means the filter was
   * not applied, and is never read as the requested document.
   */
  private async queryDocument(
    credentials: Credentials,
    id: string,
  ): Promise<RawMifielQueryDocument> {
    const res = await this.client(credentials).query<QueryResponse>({
      version: QUERY_VERSION,
      resource: 'document',
      q: { id: { eq: id } },
      fields: DOCUMENT_FIELDS,
    })
    const rows = records(res)
    if (rows.some((r) => r.id !== id)) {
      throw new Error(`mifiel POST /api/query returned documents other than ${id}`)
    }
    const [row] = rows
    if (!row) {
      throw Object.assign(new Error(`mifiel document ${id} not found`), {
        statusCode: 404,
        code: 'NOT_FOUND',
      })
    }
    return row
  }

  // ── Envelopes ─────────────────────────────────────────────────────────────

  /**
   * `POST /api/query` pages by number: QueryRequest `page` ("Page number to
   * get results", "default": 1) and `per_page` ("Number of records to get per
   * page", "default": 10). No maximum is documented, so the caller's page and
   * exact limit are sent as they are. The end comes from `_metadata`
   * (`page_count`, "Total number of pages matching the query criteria");
   * without it nothing is reported.
   */
  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const page = pageNumber(params)
    const res = await this.client(credentials).query<QueryResponse>({
      version: QUERY_VERSION,
      resource: 'document',
      page,
      per_page: pageSize(params),
      sort: DOCUMENT_SORT,
      fields: DOCUMENT_FIELDS,
    })
    const rows = records(res)
    const meta = res._metadata
    const pageCount = num(meta?.page_count)
    if (pageCount !== undefined) {
      reportUpstreamPage(params, {
        totalCount: num(meta?.total_count),
        totalPages: pageCount,
        currentPage: num(meta?.page),
        hasMore: page < pageCount,
      })
    }
    return rows.map(transformEnvelope)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    return transformEnvelope(await this.queryDocument(credentials, id))
  }

  /**
   * Write method, out of scope for the list rebuild. `/transactions/{id}/cancel`
   * is not in the API reference, which documents no cancel or void call.
   */
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

  // ── Signers ───────────────────────────────────────────────────────────────

  /**
   * Stakeholders have no list endpoint: `/api/v1/documents/{document_id}/stakeholders`
   * takes only POST. They come back whole as the `stakeholders` relation of
   * the document's query record; those of type Signer are the signers
   * (reviewers are not). The caller's page is cut locally.
   */
  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    const doc = await this.queryDocument(credentials, envelopeId)
    const all = (doc.stakeholders ?? []).filter(isSigner).map((s) => transformSigner(s, envelopeId))
    return pageLocally(all, params)
  }

  async getSigner(_credentials: Credentials, _id: string): Promise<Signer> {
    throw notSupported(
      'Mifiel cannot get a stakeholder by id alone: /api/v1/documents/{document_id}/stakeholders/{id} documents only PUT and DELETE; use listSigners(envelopeId)',
    )
  }

  // ── Documents (metadata only) ─────────────────────────────────────────────

  /** The document's one file (see ./transform/document.ts), paged locally. */
  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    const doc = await this.queryDocument(credentials, envelopeId)
    return pageLocally([transformDocument(doc)], params)
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    return transformDocument(await this.queryDocument(credentials, id))
  }

  // ── Audit trail ───────────────────────────────────────────────────────────

  async listAuditTrailEntries(
    _credentials: Credentials,
    _envelopeId: string,
    _params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    throw notSupported(
      'Mifiel cannot list audit trail entries: its API reference (https://docs.mifiel.com/en/api.json) documents no audit, history or event endpoint',
    )
  }

  async getAuditTrailEntry(_credentials: Credentials, _id: string): Promise<AuditTrailEntry> {
    throw notSupported(
      'Mifiel cannot read audit trail entries: its API reference (https://docs.mifiel.com/en/api.json) documents no audit, history or event endpoint',
    )
  }

  // ── Templates ─────────────────────────────────────────────────────────────

  /**
   * /api/query names a `template` resource ("Plantillas de documentos
   * (template)"), but no template attribute is documented anywhere, and a
   * query without `fields` "podría aparecer “vacía”". With nothing to request
   * and nothing to map, templates are refused rather than guessed.
   */
  async listTemplates(_credentials: Credentials, _params: QueryParams): Promise<Template[]> {
    throw notSupported(
      'Mifiel cannot list templates: POST /api/query names a "template" resource but documents none of its fields, and without them "la respuesta podría aparecer “vacía”"',
    )
  }

  async getTemplate(_credentials: Credentials, _id: string): Promise<Template> {
    throw notSupported(
      'Mifiel cannot read templates: its API reference documents no template endpoint and no template fields',
    )
  }
}
