/**
 * Foxit eSign adapter (eSignGenie REST API).
 *
 * API-key auth. Customer pastes the key into the Connect Link hosted form;
 * the adapter wraps it as `accessToken` and uses Bearer auth against the
 * eSignGenie REST API. Covers envelopes, recipients, documents (metadata
 * only), envelope history (audit), and templates.
 *
 * Recipients, documents and envelope history are read from the documented
 * "Get Envelope Details" endpoint, GET /folders/myfolder?folderId= on
 * https://na1.foxitesign.foxit.com/api (Foxit eSign OpenAPI, served by
 * https://developers.foxitesign.foxit.com/; also "Get Envelope Details" in
 * https://docs.developer-api.foxit.com/). Its response carries
 * `folder.folderRecipientParties`, `folder.documentsList` and
 * `Folder History` whole, with no paging parameters, so each list is cut
 * locally to the caller's page.
 *
 * Envelopes, templates and voidEnvelope still call the older, undocumented
 * api.esigngenie.com/rest/v1 paths; they were not part of this rebuild.
 */

import { pageLocally, simpleApiKey } from '@opensteward/shared'
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
  exchangeCode as foxitExchange,
  refreshCredentials as foxitRefresh,
} from './auth'
import { FoxitESignClient } from './client'
import { DEFAULT_PAGE_SIZE, DEFAULT_SCOPES, ESIGN_API_BASE_URL } from './constants'
import { verifyFoxitESignWebhook, parseFoxitESignWebhookEvents } from './webhook'

import { transformEnvelope, type RawFoxitESignEnvelope } from './transform/envelope'
import { transformSigner, type RawFoxitESignParty } from './transform/signer'
import { transformDocument, type RawFoxitESignDocument } from './transform/document'
import {
  transformAuditTrailEntry,
  type RawFoxitESignFolderHistoryEntry,
} from './transform/audit-trail-entry'
import { transformTemplate, type RawFoxitESignTemplate } from './transform/template'

export interface FoxitESignAdapterConfig {
  clientId: string
  /** Treated as the API key — Foxit eSign is api-key auth. */
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

interface EnvelopeListResponse {
  envelopes?: RawFoxitESignEnvelope[]
  data?: RawFoxitESignEnvelope[]
  total?: number
  page?: number
}

/**
 * "Get Envelope Details", GET /folders/myfolder: the documented example is
 * `{ "result": "success", "folder": { ..., "documentsList": [...],
 * "folderRecipientParties": [...] }, "allFields": [...],
 * "allFieldsNameValue": [...], "Folder History": [...] }`. Only the parts
 * the adapter reads are typed.
 */
interface MyFolderResponse {
  result?: string
  folder?: {
    documentsList?: RawFoxitESignDocument[]
    folderRecipientParties?: RawFoxitESignParty[]
  }
  'Folder History'?: RawFoxitESignFolderHistoryEntry[]
}

const MYFOLDER_PATH = '/folders/myfolder'

function expectArray<T>(value: unknown, what: string): T[] {
  if (!Array.isArray(value)) {
    throw new Error(`Foxit eSign GET ${MYFOLDER_PATH} returned no ${what} array`)
  }
  return value as T[]
}

interface TemplatesResponse {
  templates?: RawFoxitESignTemplate[]
  data?: RawFoxitESignTemplate[]
}

const API_KEY_FORM = simpleApiKey({
  label: 'Foxit eSign API key',
  placeholder: 'esg_live_...',
  helpText: 'Find this in Foxit eSign → Settings → API. Treated as Bearer.',
})

export class FoxitESignAdapter implements DocsignAdapter {
  readonly platform = 'foxit-esign'
  readonly version = '0.1.0'

  // Connect Link — API key form.
  credentialFields = API_KEY_FORM.credentialFields
  exchangeCredentials = API_KEY_FORM.exchangeCredentials

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: FoxitESignAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return foxitExchange(code, redirectUri, this.clientId, this.clientSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return foxitRefresh(credentials, this.clientId, this.clientSecret)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyFoxitESignWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseFoxitESignWebhookEvents(payload)
  }

  private client(credentials: Credentials): FoxitESignClient {
    return new FoxitESignClient(credentials)
  }

  /**
   * GET /folders/myfolder?folderId= — "(Required)" `folderId` is its only
   * documented parameter. Auth: "The bearer token is sent in the API request
   * like this: curl {BASEURI} -H 'Authorization: Bearer {OAUTH_TOKEN}'".
   */
  private async myFolder(credentials: Credentials, envelopeId: string): Promise<MyFolderResponse> {
    const res = await new FoxitESignClient(credentials, ESIGN_API_BASE_URL).get<MyFolderResponse>(
      MYFOLDER_PATH,
      { folderId: envelopeId },
    )
    if (res?.result !== 'success') {
      throw new Error(
        `Foxit eSign GET ${MYFOLDER_PATH} did not return result "success" for folder ${envelopeId}`,
      )
    }
    return res
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      page: params.page ?? 1,
      pageSize: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    if (params['cursor']) out.cursor = String(params['cursor'])
    if (params['status']) out.status = String(params['status'])
    if (params.updatedAfter instanceof Date) {
      out.updatedAfter = params.updatedAfter.toISOString()
    } else if (params['updated_after']) {
      out.updatedAfter = String(params['updated_after'])
    }
    return out
  }

  private pickArray<T>(
    res:
      | {
          data?: T[]
          envelopes?: T[]
          recipients?: T[]
          documents?: T[]
          history?: T[]
          events?: T[]
          templates?: T[]
        }
      | undefined,
  ): T[] {
    if (!res) return []
    return (
      res.data ??
      res.envelopes ??
      res.recipients ??
      res.documents ??
      res.history ??
      res.events ??
      res.templates ??
      []
    )
  }

  // ── Envelopes ─────────────────────────────────────────────────────────────

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const res = await this.client(credentials).get<EnvelopeListResponse>(
      '/envelopes',
      this.listParams(params),
    )
    return this.pickArray<RawFoxitESignEnvelope>(res).map(transformEnvelope)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const raw = await this.client(credentials).get<RawFoxitESignEnvelope>(`/envelopes/${id}`)
    return transformEnvelope(raw)
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Envelope> {
    await this.client(credentials).put(`/envelopes/${id}`, {
      status: 'Voided',
      voidReason: data?.reason ?? 'Voided by API',
    })
    return this.getEnvelope(credentials, id)
  }

  // ── Signers (recipients) ─────────────────────────────────────────────────

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    const res = await this.myFolder(credentials, envelopeId)
    const parties = expectArray<RawFoxitESignParty>(
      res.folder?.folderRecipientParties,
      'folder.folderRecipientParties',
    )
    // Status comes from the same response's history. A response without it
    // is malformed and fails, as it does for listAuditTrailEntries.
    const history = expectArray<RawFoxitESignFolderHistoryEntry>(
      res['Folder History'],
      'Folder History',
    )
    return pageLocally(
      parties.map((raw) => transformSigner(raw, envelopeId, history)),
      params,
    )
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    const [envelopeId, recipientId] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId || !recipientId) {
      throw new Error('Foxit eSign signer id expects shape "<envelopeId>:<recipientId>"')
    }
    const all = await this.listSigners(credentials, envelopeId, {})
    const found = all.find((s) => s.externalId === recipientId)
    if (!found) throw new Error(`Signer ${recipientId} not found on envelope ${envelopeId}`)
    return found
  }

  // ── Documents (metadata only) ────────────────────────────────────────────

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    const res = await this.myFolder(credentials, envelopeId)
    const docs = expectArray<RawFoxitESignDocument>(
      res.folder?.documentsList,
      'folder.documentsList',
    )
    return pageLocally(
      docs.map((raw, i) => transformDocument(raw, envelopeId, i)),
      params,
    )
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const [envelopeId, documentId] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId || !documentId) {
      throw new Error('Foxit eSign document id expects shape "<envelopeId>:<documentId>"')
    }
    const all = await this.listDocuments(credentials, envelopeId, {})
    const found = all.find((d) => d.externalId === documentId)
    if (!found) throw new Error(`Document ${documentId} not found on envelope ${envelopeId}`)
    return found
  }

  // ── Audit-trail entries (envelope history) ───────────────────────────────

  /**
   * Read from `Folder History` of GET /folders/myfolder, whose rows carry
   * `dateChanged` in epoch milliseconds. The dedicated "Get Envelope Activity
   * History" endpoint (GET /folders/viewActivityHistory) documents its
   * `time` only as a local string with a zone abbreviation
   * ("02 Feb 2021, 23:33:50, IST"), which cannot be turned into an instant
   * without guessing which zone "IST" means.
   */
  async listAuditTrailEntries(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    const res = await this.myFolder(credentials, envelopeId)
    const rows = expectArray<RawFoxitESignFolderHistoryEntry>(
      res['Folder History'],
      'Folder History',
    )
    return pageLocally(
      rows.map((raw, i) => transformAuditTrailEntry(raw, envelopeId, i)),
      params,
    )
  }

  async getAuditTrailEntry(credentials: Credentials, id: string): Promise<AuditTrailEntry> {
    const [envelopeId, indexStr] = id.split(':')
    if (!envelopeId || !indexStr) {
      throw new Error('Foxit eSign audit-trail id expects shape "<envelopeId>:<index>"')
    }
    const all = await this.listAuditTrailEntries(credentials, envelopeId, {})
    const found = all[Number(indexStr)]
    if (!found) throw new Error(`Audit entry ${id} not found`)
    return found
  }

  // ── Templates ────────────────────────────────────────────────────────────

  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    const res = await this.client(credentials).get<TemplatesResponse>(
      '/templates',
      this.listParams(params),
    )
    return this.pickArray<RawFoxitESignTemplate>(res).map(transformTemplate)
  }

  async getTemplate(credentials: Credentials, id: string): Promise<Template> {
    const raw = await this.client(credentials).get<RawFoxitESignTemplate>(`/templates/${id}`)
    return transformTemplate(raw)
  }
}
