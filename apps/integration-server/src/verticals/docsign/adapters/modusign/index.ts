/**
 * Modusign adapter — Korean e-signature provider (Modu Solutions).
 *
 * Maps Modusign `documents` → canonical `Envelope`, `participants[]` of
 * `GET /documents/{documentId}` → `Signer`, the same record → `Document`,
 * `GET /documents/{documentId}/histories` → `AuditTrailEntry`, and
 * `/templates` → `Template`.
 *
 * Authentication: HTTP Basic, account email + API key (see auth.ts). This
 * adapter has no OAuth flow — call `credentialFields()` +
 * `exchangeCredentials()` (Connect Link flow).
 *
 * Status enum (documented "문서 상태", see transform/envelope.ts):
 *   DRAFT, SCHEDULED → draft
 *   ON_GOING         → sent
 *   COMPLETED        → completed
 *   ABORTED          → declined (abort.type REJECTION) or voided (a cancellation)
 *   anything else    → unknown
 *
 * Refused fields:
 *   - Document content / preview URLs
 *   - Signature images
 *   - Korean KISA / NIPA accredited-CA payloads
 *
 * Docs: https://modusign.co.kr/developers
 */

import { pageLocally, pageOffset, reportUpstreamPage } from '@opensteward/shared'
import type { Credentials, QueryParams, CredentialField } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { AuditTrailEntry } from '../../schema/audit-trail-entry'
import type { Template } from '../../schema/template'
import type { WebhookEvent } from '../../schema/webhook'

import {
  buildAuthUrl,
  exchangeApiKey,
  exchangeCode as modusignExchange,
  refreshCredentials as modusignRefresh,
} from './auth'
import { ModusignClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { verifyModusignWebhook, parseModusignWebhookEvents } from './webhook'

import { transformEnvelope, type RawModusignDocument } from './transform/envelope'
import { transformSigner } from './transform/signer'
import { transformDocument, type RawModusignDocumentDetail } from './transform/document'
import {
  transformAuditTrailEntry,
  type ModusignHistoriesResponse,
} from './transform/audit-trail-entry'
import { transformTemplate, type RawModusignTemplate } from './transform/template'

export interface ModusignAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

/** `GetDocumentsResponseDto`: required ['count', 'documents']. */
interface DocumentListResponse {
  /** "전체 개수" */
  count?: number
  /** "문서 목록" */
  documents?: RawModusignDocument[]
}

/**
 * An embedded list the schema marks required. A body without it holds no
 * rows of that kind: nothing is invented, the list is just empty.
 */
function rowsOf<T>(rows: T[] | undefined): T[] {
  return Array.isArray(rows) ? rows : []
}

/** `GetTemplatesResponseDto`: required ['count', 'templates']. */
interface TemplateListResponse {
  /** "총 템플릿 개수" */
  count?: number
  /** "템플릿 목록" */
  templates?: RawModusignTemplate[]
}

export class ModusignAdapter implements DocsignAdapter {
  readonly platform = 'modusign'
  readonly version = '0.1.0'
  /** GET /documents and GET /templates: `limit` "maximum": 100. */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: {
    clientId: string
    clientSecret: string
    redirectUri: string
    scopes?: string[]
  }) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? []
    void this.clientId
    void this.clientSecret
    void this.redirectUri
    void this.scopes
  }

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    return buildAuthUrl()
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return modusignExchange(code, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return modusignRefresh(credentials)
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'email',
        label: 'Account email',
        type: 'text',
        required: true,
        placeholder: 'you@company.com',
        helpText:
          'The email of the Modusign account that issued the API key. Modusign authenticates API keys with HTTP Basic: this email is the user id.',
      },
      {
        name: 'apiKey',
        label: 'API Key',
        type: 'password',
        required: true,
        placeholder: 'Modusign API key',
        helpText:
          'Generate under 설정 → 워크스페이스 관리 → API KEY. Sent as the HTTP Basic password, with the account email as the user id.',
      },
    ]
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return exchangeApiKey(fields)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyModusignWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseModusignWebhookEvents(payload)
  }

  private client(credentials: Credentials): ModusignClient {
    return new ModusignClient(credentials)
  }

  /**
   * GET /documents and GET /templates page by offset, not by page number:
   *   offset — "건너 뛸 아이템 개수" (default 0)
   *   limit  — "한번에 불러 올 아이템 개수" (minimum 1, maximum 100, default 10)
   * and answer `{ count, <rows> }` with `count` the total ("전체 개수").
   * The caller's limit is clamped to 100; a smaller size is reported so a
   * full page of 100 is not read as the last one.
   */
  private async offsetPage<R>(
    credentials: Credentials,
    path: '/documents' | '/templates',
    key: 'documents' | 'templates',
    params: QueryParams,
  ): Promise<R[]> {
    const requested =
      typeof params.limit === 'number' && Number.isFinite(params.limit) && params.limit >= 1
        ? Math.floor(params.limit)
        : DEFAULT_PAGE_SIZE
    const size = Math.min(requested, MAX_PAGE_SIZE)
    const offset = pageOffset(params, size)
    const res = await this.client(credentials).get<{ count?: number } & Record<string, unknown>>(
      path,
      { offset, limit: size },
    )
    const rows = rowsOf(res[key] as R[] | undefined)
    const count = res.count
    reportUpstreamPage(params, {
      ...(size < requested ? { pageSize: size } : {}),
      ...(typeof count === 'number' && Number.isInteger(count) && count >= 0
        ? { totalCount: count, hasMore: offset + rows.length < count }
        : {}),
    })
    return rows
  }

  // ── Envelopes (documents) ────────────────────────────────────────────────

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const docs = await this.offsetPage<RawModusignDocument>(
      credentials,
      '/documents',
      'documents' satisfies keyof DocumentListResponse,
      params,
    )
    return docs.map(transformEnvelope)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const raw = await this.client(credentials).get<RawModusignDocument>(
      `/documents/${encodeURIComponent(id)}`,
    )
    return transformEnvelope(raw)
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Envelope> {
    await this.client(credentials).post(`/documents/${id}/cancel`, {
      reason: data?.reason ?? 'Cancelled by API',
    })
    return this.getEnvelope(credentials, id)
  }

  // ── Signers (participants) ────────────────────────────────────────────────
  //
  // GET /documents/{documentId} (문서 상세 조회) returns the whole document,
  // `participants[]` included, and takes only the path parameter
  // (https://developers.modusign.co.kr/reference/documentcontroller_getdocument.md).
  // The list is embedded and unpaginated, so it is paged locally.

  private async fetchDocument(
    credentials: Credentials,
    documentId: string,
  ): Promise<RawModusignDocumentDetail> {
    return this.client(credentials).get<RawModusignDocumentDetail>(
      `/documents/${encodeURIComponent(documentId)}`,
    )
  }

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    const doc = await this.fetchDocument(credentials, envelopeId)
    return pageLocally(
      rowsOf(doc.participants).map((p) => transformSigner(p, doc)),
      params,
    )
  }

  async getSigner(_credentials: Credentials, id: string): Promise<Signer> {
    throw new Error(
      `Modusign does not expose a signer-by-id endpoint. Use listSigners(envelopeId). id=${id}`,
    )
  }

  // ── Documents (metadata only — content REFUSED) ──────────────────────────
  //
  // A Modusign document is one file: the envelope and its document share the
  // id, so the list is the one record GET /documents/{documentId} returns.

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    const doc = await this.fetchDocument(credentials, envelopeId)
    return pageLocally([transformDocument(doc)], params)
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    return transformDocument(await this.fetchDocument(credentials, id))
  }

  // ── Audit-trail entries ──────────────────────────────────────────────────
  //
  // GET /documents/{documentId}/histories (문서 이력 조회) returns
  // `{ histories: HistoryDto[] }` and takes only the path parameter
  // (https://developers.modusign.co.kr/reference/documentcontroller_getalldocumenthistories.md).
  // Unpaginated, so it is paged locally.

  private async fetchHistories(
    credentials: Credentials,
    envelopeId: string,
  ): Promise<AuditTrailEntry[]> {
    const res = await this.client(credentials).get<ModusignHistoriesResponse>(
      `/documents/${encodeURIComponent(envelopeId)}/histories`,
    )
    return rowsOf(res.histories).map((raw, i) => transformAuditTrailEntry(raw, envelopeId, i))
  }

  async listAuditTrailEntries(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    return pageLocally(await this.fetchHistories(credentials, envelopeId), params)
  }

  async getAuditTrailEntry(credentials: Credentials, id: string): Promise<AuditTrailEntry> {
    const sep = id.lastIndexOf(':')
    const envelopeId = sep > 0 ? id.slice(0, sep) : ''
    const indexStr = sep > 0 ? id.slice(sep + 1) : ''
    if (!envelopeId || !/^\d+$/.test(indexStr)) {
      throw new Error('Modusign audit-trail id expects shape "<documentId>:<index>"')
    }
    const all = await this.fetchHistories(credentials, envelopeId)
    const found = all[Number(indexStr)]
    if (!found) throw new Error(`Audit entry ${id} not found`)
    return found
  }

  // ── Templates ────────────────────────────────────────────────────────────

  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    const templates = await this.offsetPage<RawModusignTemplate>(
      credentials,
      '/templates',
      'templates' satisfies keyof TemplateListResponse,
      params,
    )
    return templates.map(transformTemplate)
  }

  async getTemplate(credentials: Credentials, id: string): Promise<Template> {
    const raw = await this.client(credentials).get<RawModusignTemplate>(
      `/templates/${encodeURIComponent(id)}`,
    )
    return transformTemplate(raw)
  }
}
