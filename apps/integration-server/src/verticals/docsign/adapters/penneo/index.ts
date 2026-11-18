/**
 * Penneo adapter (Danish, Nordic-wide audit/accounting focus).
 *
 * HTTP Basic auth: apiKey + apiSecret combined as base64(apiKey:apiSecret).
 * Casefile is the envelope.
 */
import { pageLocally } from '@opensteward/shared'
import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { AuditTrailEntry } from '../../schema/audit-trail-entry'
import type { Template } from '../../schema/template'
import type { WebhookEvent } from '../../schema/webhook'

import {
  credentialFields as penneoCredentialFields,
  exchangeCredentials as penneoExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { PenneoClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import { verifyPenneoWebhook, parsePenneoWebhookEvents } from './webhook'

import { transformEnvelope, type RawPenneoCasefile } from './transform/envelope'
import { transformSigner, type RawPenneoSigner } from './transform/signer'
import { transformDocument, type RawPenneoDocument } from './transform/document'
import { transformTemplate, type RawPenneoCasefileTemplate } from './transform/template'

/**
 * Why audit-trail entries are refused (https://app.penneo.com/api/docs/swagger.json).
 * The spec has no `/casefiles/{caseFileId}/log` path. `GET
 * /api/{version}/casefiles/{caseFileId}/history` ("Get the history of a case
 * file.") documents no response body, only a 400. The signer event log's
 * `SignerLogEntry` documents `eventType`, `identitySignerName` and
 * `identityType`, with no id and no timestamp for the required `occurredAt`.
 */
const AUDIT_TRAIL_REASON =
  'GET /casefiles/{caseFileId}/history "Get the history of a case file." documents no response body, ' +
  'and the signer log entry (SignerLogEntry) documents no id or timestamp'

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

export interface PenneoAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

export class PenneoAdapter implements DocsignAdapter {
  readonly platform = 'penneo'
  readonly version = '0.1.0'

  constructor(_config: PenneoAdapterConfig) {}

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('penneo uses HTTP Basic auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  credentialFields(): CredentialField[] {
    return penneoCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return penneoExchangeCredentials(fields)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyPenneoWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parsePenneoWebhookEvents(payload)
  }

  private client(credentials: Credentials): PenneoClient {
    return new PenneoClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      perPage: params.limit ?? DEFAULT_PAGE_SIZE,
      ...(params.page ? { page: params.page } : {}),
    }
  }

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const res = await this.client(credentials).get<RawPenneoCasefile[]>(
      '/casefiles',
      this.listParams(params),
    )
    return (Array.isArray(res) ? res : []).map(transformEnvelope)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const raw = await this.client(credentials).get<RawPenneoCasefile>(`/casefiles/${id}`)
    return transformEnvelope(raw)
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Envelope> {
    await this.client(credentials).post(`/casefiles/${id}/cancel`)
    return this.getEnvelope(credentials, id)
  }

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    // GET /casefiles/{caseFileId}/signers takes no paging parameter and
    // "List all signers that linked to the case file", so page it here.
    const res = await this.client(credentials).get<RawPenneoSigner[]>(
      `/casefiles/${envelopeId}/signers`,
    )
    return pageLocally(
      (Array.isArray(res) ? res : []).map((s) => transformSigner(s, envelopeId)),
      params,
    )
  }

  async getSigner(_credentials: Credentials, id: string): Promise<Signer> {
    throw new Error(`penneo signers are casefile-scoped; call listSigners(envelopeId). id=${id}`)
  }

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    // GET /casefiles/{caseFileId}/documents takes no paging parameter and
    // lists "all documents that are linked to the case file", so page it here.
    // Transform first so `order` stays the position in the whole casefile.
    const res = await this.client(credentials).get<RawPenneoDocument[]>(
      `/casefiles/${envelopeId}/documents`,
    )
    return pageLocally(
      (Array.isArray(res) ? res : []).map((d, i) => transformDocument(d, envelopeId, i)),
      params,
    )
  }

  async getDocument(_credentials: Credentials, id: string): Promise<Document> {
    throw new Error(
      `penneo documents are casefile-scoped; call listDocuments(envelopeId). id=${id}`,
    )
  }

  async listAuditTrailEntries(
    _credentials: Credentials,
    _envelopeId: string,
    _params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    throw notSupported(`Penneo cannot list audit trail entries: ${AUDIT_TRAIL_REASON}`)
  }

  async getAuditTrailEntry(_credentials: Credentials, _id: string): Promise<AuditTrailEntry> {
    throw notSupported(`Penneo cannot read audit trail entries: ${AUDIT_TRAIL_REASON}`)
  }

  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    try {
      const res = await this.client(credentials).get<RawPenneoCasefileTemplate[]>(
        '/casefile_templates',
        this.listParams(params),
      )
      return (Array.isArray(res) ? res : []).map(transformTemplate)
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
    const raw = await this.client(credentials).get<RawPenneoCasefileTemplate>(
      `/casefile_templates/${id}`,
    )
    return transformTemplate(raw)
  }
}
