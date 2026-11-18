/**
 * CloudSign adapter (GMO Cloud, Japan).
 *
 * Web API spec 0.37.0: https://api.swaggerhub.com/apis/CloudSign/cloudsign-web_api/0.37.0
 * Usage guide: https://help.cloudsign.jp/ja/articles/2681259
 */
import { connectionScope, cursorPagerKey, pageByRows, pageLocally } from '@opensteward/shared'
import type { CredentialField, Credentials, CursorPage, QueryParams } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { AuditTrailEntry } from '../../schema/audit-trail-entry'
import type { Template } from '../../schema/template'
import type { WebhookEvent } from '../../schema/webhook'

import { mintToken, refreshCredentials as cloudsignRefresh } from './auth'
import { CloudSignClient } from './client'
import { DEFAULT_PAGE_SIZE, DOCUMENTS_PAGE_SIZE } from './constants'
import { verifyCloudSignWebhook, parseCloudSignWebhookEvents } from './webhook'

import { transformEnvelope, type RawCloudSignDocument } from './transform/envelope'
import { transformSigner, type RawCloudSignParticipant } from './transform/signer'
import { transformDocument } from './transform/document'
import { transformTemplate, type RawCloudSignTemplate } from './transform/template'

const AUDIT_TRAIL_REASON =
  'the CloudSign Web API documents no audit-trail or history endpoint; its only signing record, ' +
  'GET /documents/{documentID}/certificate, "PDF ファイルを返却します" ' +
  '(https://api.swaggerhub.com/apis/CloudSign/cloudsign-web_api/0.37.0)'

function notSupported(verb: 'list' | 'get'): Error {
  return Object.assign(
    new Error(`CloudSign cannot ${verb} audit trail entries: ${AUDIT_TRAIL_REASON}`),
    { statusCode: 501, code: 'NOT_SUPPORTED' },
  )
}

export class CloudSignAdapter implements DocsignAdapter {
  readonly platform = 'cloudsign'
  readonly version = '0.1.0'

  /**
   * The factory hands every adapter the deployment's OAuth config. CloudSign
   * has no OAuth app, so none of it is read: each connection brings its own
   * client ID through `credentialFields`.
   */
  constructor(_config?: object) {}

  // ── Auth: client ID → `POST /token` (see auth.ts) ─────────────────────────

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'clientId',
        label: 'Client ID',
        type: 'password',
        required: true,
        helpText:
          'Issue one in CloudSign under 管理画面 > アカウント > クライアントID ' +
          '(https://www.cloudsign.jp/api/clients). Your team must have the Web API option.',
      },
    ]
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return mintToken(fields['clientId'])
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return cloudsignRefresh(credentials)
  }

  getAuthUrl(_state: string): string {
    throw new Error(
      'CloudSign has no OAuth authorize endpoint; connect with a client ID via credentialFields()',
    )
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error(
      'CloudSign has no authorization code to exchange; connect with a client ID via credentialFields()',
    )
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyCloudSignWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseCloudSignWebhookEvents(payload)
  }

  private client(credentials: Credentials): CloudSignClient {
    return new CloudSignClient(credentials)
  }

  /**
   * Serve the caller's `{ page, limit }` out of `GET /documents`, which pages
   * by `page` alone at up to 100 rows a page and takes no size parameter
   * (https://api.swaggerhub.com/apis/CloudSign/cloudsign-web_api/0.37.0):
   * "ページ番号は 1 から始まる / 1 ページあたり最大 100 件のデータを取得 /
   * 一覧のデータ量に対して大きすぎる値を指定した場合は … documents の配列は空となる".
   * One upstream page is therefore not one caller page, so `pageByRows` cuts
   * exactly the caller's rows out of them. A page shorter than 100 rows (or
   * empty) ends the list.
   *
   * The key is per connection (CloudSign's token response names no account,
   * so the scope is the token fingerprint) plus the `status` filter. The
   * caller's limit stays out: the upstream page size does not depend on it.
   */
  private async pageDocuments<Raw, R>(
    credentials: Credentials,
    params: QueryParams,
    collection: string,
    filters: Record<string, unknown>,
    map: (rows: Raw[]) => R[],
  ): Promise<R[]> {
    const client = this.client(credentials)
    const key = cursorPagerKey(connectionScope('cloudsign', credentials), collection, filters)
    const result = await pageByRows<R, number>(
      key,
      params,
      async (cursor): Promise<CursorPage<R, number>> => {
        const page = cursor ?? 1
        const res = await client.get<{ documents?: Raw[] }>('/documents', { ...filters, page })
        const rows = res.documents ?? []
        return {
          items: map(rows),
          next: rows.length >= DOCUMENTS_PAGE_SIZE ? page + 1 : undefined,
        }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return result.items
  }

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    return this.pageDocuments<RawCloudSignDocument, Envelope>(
      credentials,
      params,
      'documents',
      {},
      (rows) => rows.map(transformEnvelope),
    )
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const raw = await this.client(credentials).get<RawCloudSignDocument>(`/documents/${id}`)
    return transformEnvelope(raw)
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Envelope> {
    // PUT /documents/{id}/decline, form-urlencoded `comment` — CloudSign has
    // no `/cancel` route. Only valid while the document awaits
    // the counterparty (status 1) and it was sent by the caller; anything
    // else 400s from upstream and is left to propagate. The response body
    // is already the updated documentModel, so no follow-up GET is needed.
    const raw = await this.client(credentials).put<RawCloudSignDocument>(
      `/documents/${id}/decline`,
      { comment: data?.reason ?? 'Voided by API' },
    )
    return transformEnvelope(raw)
  }

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    // GET /documents/{documentID} takes only the path id and returns the
    // document's whole participants[] array, so the caller's page is cut here.
    const raw = await this.client(credentials).get<RawCloudSignDocument>(`/documents/${envelopeId}`)
    return pageLocally(
      (raw.participants ?? []).map((p) =>
        transformSigner(p as RawCloudSignParticipant, envelopeId),
      ),
      params,
    )
  }

  async getSigner(_credentials: Credentials, id: string): Promise<Signer> {
    throw new Error(
      `CloudSign does not expose a signer-by-id endpoint. Use listSigners(envelopeId). id=${id}`,
    )
  }

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    // One unpaged GET /documents/{documentID} reply is the whole list.
    const raw = await this.client(credentials).get<RawCloudSignDocument>(`/documents/${envelopeId}`)
    return pageLocally([transformDocument(raw)], params)
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const raw = await this.client(credentials).get<RawCloudSignDocument>(`/documents/${id}`)
    return transformDocument(raw)
  }

  /**
   * CloudSign documents no audit-trail, history or event-log endpoint. The
   * Web API spec (https://api.swaggerhub.com/apis/CloudSign/cloudsign-web_api/0.37.0)
   * has no `history` path at all: under `/documents/{documentID}` it lists
   * only `alert`, `attribute`, `certificate`, `decline`, `files`,
   * `participants`, `participant_groups`, `reportees` and `attachments`.
   * The one signing record, `GET /documents/{documentID}/certificate`, is a
   * PDF: "リクエストが成功した場合、このエンドポイントは PDF ファイルを返却します。"
   * The `/documents/{id}/history` this used to call does not exist, and its
   * error was swallowed into an empty list; both methods now refuse instead.
   */
  async listAuditTrailEntries(
    _credentials: Credentials,
    _envelopeId: string,
    _params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    throw notSupported('list')
  }

  async getAuditTrailEntry(_credentials: Credentials, _id: string): Promise<AuditTrailEntry> {
    throw notSupported('get')
  }

  /**
   * CloudSign has no `/templates` route — a "template" is a
   * documentModel with `status=4` (テンプレート), read off the same
   * `GET /documents` the envelope list uses. `with_shared_templates` is a
   * real query param on this endpoint (only honoured with `status=4`) but
   * has no channel to reach here: `parseListQuery` builds a fixed
   * `{page, limit, updatedAfter, search}` and drops any other query key
   * before an adapter ever sees it, so it is left off rather than faked.
   */
  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    // No swallow-404 here (contrast listTemplates on sibling platforms with a
    // real, optional /templates route): /documents is the same endpoint
    // listEnvelopes always relies on, so any failure is a genuine upstream
    // fault and must propagate. Paged like listEnvelopes (see pageDocuments).
    return this.pageDocuments<RawCloudSignTemplate, Template>(
      credentials,
      params,
      'templates',
      { status: 4 },
      (rows) => rows.map(transformTemplate),
    )
  }

  async getTemplate(credentials: Credentials, id: string): Promise<Template> {
    const raw = await this.client(credentials).get<RawCloudSignTemplate>(`/documents/${id}`)
    // GET /documents/{id} returns any document regardless of status — reject
    // anything that isn't status 4 so the templates resource can't be used
    // to read a live envelope by id.
    if (raw.status !== 4) {
      throw Object.assign(
        new Error(`CloudSign document ${id} is not a template (status ${String(raw.status)})`),
        { statusCode: 404, code: 'NOT_FOUND' },
      )
    }
    return transformTemplate(raw)
  }
}
