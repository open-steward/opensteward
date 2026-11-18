/**
 * Visma Sign adapter (Finnish, Visma ecosystem). Every request is signed with
 * the organization's API client identifier and secret ("Authorization:
 * Onnistuu …", https://sign.visma.net/api/docs/v1/); see ./auth.ts.
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

import {
  credentialFields as vismaCredentialFields,
  exchangeCredentials as vismaExchangeCredentials,
  oauthUnsupported,
} from './auth'
import { VismaSignClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import { verifyVismaSignWebhook, parseVismaSignWebhookEvents } from './webhook'

import {
  transformEnvelope,
  type RawVismaSignDocument,
  type RawVismaSignInvitation,
} from './transform/envelope'
import { transformSigner } from './transform/signer'
import { transformDocument } from './transform/document'
import { transformTemplate, type RawVismaSignTemplate } from './transform/template'

/** Nothing deployment-wide: the signing pair is per connection. */
export type VismaSignAdapterConfig = Record<string, unknown>

/**
 * "Search documents" response (https://sign.visma.net/api/docs/v1/):
 *
 *     { "total": 78, "offset": 0, "length": 20, "documents": [ ... ] }
 */
interface DocumentSearchResponse {
  total?: number
  offset?: number
  length?: number
  documents?: RawVismaSignDocument[]
}

/**
 * "Get invitation status" (`GET /api/v1/invitation/{uuid}`), authenticated:
 * `{ "uuid": "2076…", "status": "new", "document": { "uuid": "e59c…", "name": "Test document" } }`.
 */
interface InvitationStatusResponse extends RawVismaSignInvitation {
  document?: { uuid?: string; name?: string }
}

const AUDIT_TRAIL_REASON =
  'the Visma Sign API v1 (https://sign.visma.net/api/docs/v1/) documents no audit, event or history action; ' +
  '"Get document status" returns only uuid, name, status, files and invitations, with no timestamps'

function auditTrailRefusal(verb: 'list' | 'get'): Error {
  return Object.assign(
    new Error(`Visma Sign cannot ${verb} audit trail entries: ${AUDIT_TRAIL_REASON}`),
    { statusCode: 501, code: 'NOT_SUPPORTED' },
  )
}

/** The upstream answered with a shape the docs do not describe. */
function upstreamShape(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 502, code: 'UPSTREAM_ERROR' })
}

function notFound(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 404, code: 'NOT_FOUND' })
}

export class VismaSignAdapter implements DocsignAdapter {
  readonly platform = 'visma-sign'
  readonly version = '0.1.0'

  constructor(_config?: VismaSignAdapterConfig) {}

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    return oauthUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return oauthUnsupported()
  }

  /** The identifier and secret do not expire; there is nothing to refresh. */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  credentialFields(): CredentialField[] {
    return vismaCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return vismaExchangeCredentials(fields)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyVismaSignWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseVismaSignWebhookEvents(payload)
  }

  private client(credentials: Credentials): VismaSignClient {
    return new VismaSignClient(credentials)
  }

  /** `GET /api/v1/document/{uuid}` ("Get document status"). */
  private async fetchDocument(
    credentials: Credentials,
    uuid: string,
  ): Promise<RawVismaSignDocument> {
    return this.client(credentials).get<RawVismaSignDocument>(
      `/document/${encodeURIComponent(uuid)}`,
    )
  }

  /**
   * "Search documents": `GET /api/v1/document/?…`. "The category parameter is
   * not an optional parameter and at least category=all should be given";
   * "offset: Response is paged. Start at this document number." There is no
   * page-size parameter: the platform picks the page length and reports it
   * with `total` ("total": 78, "offset": 0, "length": 20). One upstream page
   * is therefore not one caller page, so `pageByRows` cuts exactly the
   * caller's rows out of them, walking `offset` until it reaches `total`.
   */
  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const client = this.client(credentials)
    const filters = { category: 'all' }
    const key = cursorPagerKey(connectionScope('visma-sign', credentials), 'documents', filters)
    const result = await pageByRows<Envelope, number>(
      key,
      params,
      async (cursor): Promise<CursorPage<Envelope, number>> => {
        const offset = cursor ?? 0
        const res = await client.get<DocumentSearchResponse>('/document/', { ...filters, offset })
        const rows = res.documents ?? []
        const reached = offset + rows.length
        return {
          items: rows.map(transformEnvelope),
          next:
            rows.length > 0 && typeof res.total === 'number' && reached < res.total
              ? reached
              : undefined,
        }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return result.items
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    return transformEnvelope(await this.fetchDocument(credentials, id))
  }

  /** "Cancel a document": `POST /api/v1/document/{uuid}/cancel`. */
  async voidEnvelope(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Envelope> {
    await this.client(credentials).post(`/document/${encodeURIComponent(id)}/cancel`)
    return this.getEnvelope(credentials, id)
  }

  /** The document's embedded `invitations`, sliced to the caller's page. */
  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    const raw = await this.fetchDocument(credentials, envelopeId)
    return pageLocally(
      (raw.invitations ?? []).map((inv) => transformSigner(inv, raw.uuid)),
      params,
    )
  }

  /** "Get invitation status": `GET /api/v1/invitation/{uuid}`. */
  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    const raw = await this.client(credentials).get<InvitationStatusResponse>(
      `/invitation/${encodeURIComponent(id)}`,
    )
    const envelopeId = raw.document?.uuid
    if (!envelopeId) {
      // "Response to an authenticated request" carries `document`; without it
      // there is no envelope to name, and no id is invented in its place.
      throw upstreamShape(
        `Visma Sign invitation ${id} names no document uuid (is the request authenticated?)`,
      )
    }
    const { document: _document, ...invitation } = raw
    return transformSigner(invitation, envelopeId)
  }

  /** The document's `files`, sliced to the caller's page. */
  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    const raw = await this.fetchDocument(credentials, envelopeId)
    return pageLocally(
      (raw.files ?? []).map((f, i) => transformDocument(f, raw.uuid, i)),
      params,
    )
  }

  /** `<documentUuid>:<fileIndex>`, the pair "Get document file" addresses a file by. */
  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const sep = id.lastIndexOf(':')
    const envelopeId = sep > 0 ? id.slice(0, sep) : ''
    const indexStr = sep > 0 ? id.slice(sep + 1) : ''
    if (!envelopeId || !/^\d+$/.test(indexStr)) {
      throw Object.assign(
        new Error('Visma Sign document id expects "<documentUuid>:<fileIndex>"'),
        { statusCode: 400, code: 'VALIDATION' },
      )
    }
    const index = Number(indexStr)
    const raw = await this.fetchDocument(credentials, envelopeId)
    const file = raw.files?.[index]
    if (!file) throw notFound(`Visma Sign document ${envelopeId} has no file ${index}`)
    return transformDocument(file, raw.uuid, index)
  }

  async listAuditTrailEntries(
    _credentials: Credentials,
    _envelopeId: string,
    _params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    throw auditTrailRefusal('list')
  }

  async getAuditTrailEntry(_credentials: Credentials, _id: string): Promise<AuditTrailEntry> {
    throw auditTrailRefusal('get')
  }

  /**
   * "Get invitation templates": `GET /api/v1/invitation-template`, whose
   * response is a bare array with no paging parameters, so it is the whole
   * collection and is sliced locally.
   */
  private async fetchTemplates(credentials: Credentials): Promise<RawVismaSignTemplate[]> {
    const res = await this.client(credentials).get<RawVismaSignTemplate[]>('/invitation-template')
    if (!Array.isArray(res)) {
      throw upstreamShape('Visma Sign GET /invitation-template did not return an array')
    }
    return res
  }

  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    return pageLocally((await this.fetchTemplates(credentials)).map(transformTemplate), params)
  }

  /** The API documents no single-template read, so this finds it in the list. */
  async getTemplate(credentials: Credentials, id: string): Promise<Template> {
    const raw = (await this.fetchTemplates(credentials)).find((t) => t.uuid === id)
    if (!raw) throw notFound(`Visma Sign invitation template ${id} not found`)
    return transformTemplate(raw)
  }
}
