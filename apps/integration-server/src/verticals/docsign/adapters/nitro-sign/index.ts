/**
 * Nitro Sign adapter.
 *
 * Signers and documents read the Nitro Sign Public API
 * (https://api.gonitro.dev/openapi.json): envelope participants → `Signer`,
 * envelope documents → `Document` (metadata only), on the connection's
 * regional host. Audit-trail entries refuse with 501: that API serves the
 * audit trail only as a PDF. Envelopes (`/transactions`) and templates still
 * call the legacy paths and are not yet rebuilt, but on the connection's
 * regional host, so the bearer token only ever reaches Nitro's own servers.
 *
 * Auth is the OAuth 2.0 client-credentials grant against `{host}/oauth/token`
 * with the customer's own Client ID / Client Secret (see auth.ts). There is no
 * authorization-code redirect.
 */

import { pageLocally } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { AuditTrailEntry } from '../../schema/audit-trail-entry'
import type { Template } from '../../schema/template'
import type { WebhookEvent } from '../../schema/webhook'

import {
  NITRO_SIGN_FORM,
  noAuthorizationCodeFlow,
  refreshCredentials as nitroRefresh,
} from './auth'
import { NitroSignClient, signApiBaseUrl } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import { verifyNitroSignWebhook, parseNitroSignWebhookEvents } from './webhook'

import { transformEnvelope, type RawNitroSignTransaction } from './transform/envelope'
import { transformSigner, type RawNitroSignParticipant } from './transform/signer'
import { transformDocument, type RawNitroSignDocument } from './transform/document'
import { transformTemplate, type RawNitroSignTemplate } from './transform/template'

/** No deployment config: the client pair is per connection. */
export type NitroSignAdapterConfig = Record<string, unknown>

interface ListResponse<T> {
  data?: T[]
  items?: T[]
  results?: T[]
  total?: number
  next?: string
}

function pickList<T>(res: ListResponse<T> | undefined, fallbackKey?: string): T[] {
  if (!res) return []
  if (Array.isArray(res.data)) return res.data
  if (Array.isArray(res.items)) return res.items
  if (Array.isArray(res.results)) return res.results
  if (fallbackKey && Array.isArray((res as Record<string, unknown>)[fallbackKey])) {
    return (res as Record<string, unknown>)[fallbackKey] as T[]
  }
  return []
}

/** `<envelopeId>:<childId>`, the id shape listSigners / listDocuments emit. */
function splitScopedId(id: string): [string, string] {
  const sep = id.indexOf(':')
  const envelopeId = sep > 0 ? id.slice(0, sep) : ''
  const childId = sep > 0 ? id.slice(sep + 1) : ''
  if (!envelopeId || !childId) {
    throw Object.assign(
      new Error(`Nitro Sign id expects shape "<envelopeId>:<id>" (got "${id}")`),
      {
        statusCode: 400,
      },
    )
  }
  return [envelopeId, childId]
}

/**
 * The Sign Public API has no JSON audit trail. Its one audit-trail operation,
 * `GET /sign/envelopes/{envelopeID}:download-audit-trail`, "Downloads the PDF
 * file containing the full audit trail for the selected envelope."
 * (https://developers.gonitro.com/docs/api-reference/sign/download-audit-trail-of-envelope.md)
 */
function auditTrailNotSupported(verb: 'list' | 'read'): Error {
  return Object.assign(
    new Error(
      `Nitro Sign cannot ${verb} audit trail entries: the Sign API only "Downloads the PDF file ` +
        'containing the full audit trail for the selected envelope."',
    ),
    { statusCode: 501, code: 'NOT_SUPPORTED' },
  )
}

export class NitroSignAdapter implements DocsignAdapter {
  readonly platform = 'nitro-sign'
  readonly version = '0.1.0'

  credentialFields = NITRO_SIGN_FORM.credentialFields
  exchangeCredentials = NITRO_SIGN_FORM.exchangeCredentials

  constructor(_config: NitroSignAdapterConfig = {}) {}

  getAuthUrl(_state: string): string {
    throw noAuthorizationCodeFlow()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw noAuthorizationCodeFlow()
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return nitroRefresh(credentials)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyNitroSignWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseNitroSignWebhookEvents(payload)
  }

  private client(credentials: Credentials): NitroSignClient {
    return new NitroSignClient(credentials, signApiBaseUrl(credentials))
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    if (params['cursor']) out.cursor = String(params['cursor'])
    if (params.page) out.page = params.page
    if (params['status']) out.status = String(params['status'])
    if (params.updatedAfter instanceof Date) {
      out.updatedAfter = params.updatedAfter.toISOString()
    } else if (params['updated_after']) {
      out.updatedAfter = String(params['updated_after'])
    }
    return out
  }

  // ── Envelopes (transactions) ──────────────────────────────────────────────

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const res = await this.client(credentials).get<ListResponse<RawNitroSignTransaction>>(
      '/transactions',
      this.listParams(params),
    )
    return pickList<RawNitroSignTransaction>(res, 'transactions').map(transformEnvelope)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const raw = await this.client(credentials).get<RawNitroSignTransaction>(`/transactions/${id}`)
    return transformEnvelope(raw)
  }

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

  // ── Nitro Sign Public API (https://api.gonitro.dev/openapi.json) ──────────
  //
  // Signers and documents read the documented envelope sub-resources on the
  // connection's regional host. Neither list operation declares a query
  // parameter — each "returns all" of the envelope's rows in `items` — so a
  // caller page is sliced locally from the whole list.

  private async envelopeItems<T>(
    credentials: Credentials,
    envelopeId: string,
    resource: 'participants' | 'documents',
  ): Promise<T[]> {
    const res = await this.client(credentials).get<{ items?: T[] }>(
      `/sign/envelopes/${encodeURIComponent(envelopeId)}/${resource}`,
    )
    if (!Array.isArray(res?.items)) {
      throw new Error(
        `Nitro Sign ${resource} response for envelope ${envelopeId} has no items array`,
      )
    }
    return res.items
  }

  // ── Signers (participants) ────────────────────────────────────────────────

  private async allSigners(credentials: Credentials, envelopeId: string): Promise<Signer[]> {
    const items = await this.envelopeItems<RawNitroSignParticipant>(
      credentials,
      envelopeId,
      'participants',
    )
    return items.map((p) => transformSigner(p, envelopeId))
  }

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    return pageLocally(await this.allSigners(credentials, envelopeId), params)
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    // The API documents no single-participant read, only PATCH/DELETE on
    // /participants/{participantID}; read the envelope's list and pick.
    const [envelopeId, participantId] = splitScopedId(id)
    const found = (await this.allSigners(credentials, envelopeId)).find(
      (s) => s.externalId === participantId,
    )
    if (!found) {
      throw Object.assign(
        new Error(`Nitro Sign participant ${participantId} not found on envelope ${envelopeId}`),
        { statusCode: 404 },
      )
    }
    return found
  }

  // ── Documents (metadata only) ─────────────────────────────────────────────

  private async allDocuments(credentials: Credentials, envelopeId: string): Promise<Document[]> {
    const items = await this.envelopeItems<RawNitroSignDocument>(
      credentials,
      envelopeId,
      'documents',
    )
    return items.map((raw, i) => transformDocument(raw, envelopeId, i))
  }

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    return pageLocally(await this.allDocuments(credentials, envelopeId), params)
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    // GET /documents/{documentID} exists, but a document's `order` is its
    // position in the envelope's list, so the read-back goes through the list.
    const [envelopeId, documentId] = splitScopedId(id)
    const found = (await this.allDocuments(credentials, envelopeId)).find(
      (d) => d.externalId === documentId,
    )
    if (!found) {
      throw Object.assign(
        new Error(`Nitro Sign document ${documentId} not found on envelope ${envelopeId}`),
        { statusCode: 404 },
      )
    }
    return found
  }

  // ── Audit-trail entries ───────────────────────────────────────────────────

  async listAuditTrailEntries(
    _credentials: Credentials,
    _envelopeId: string,
    _params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    throw auditTrailNotSupported('list')
  }

  async getAuditTrailEntry(_credentials: Credentials, _id: string): Promise<AuditTrailEntry> {
    throw auditTrailNotSupported('read')
  }

  // ── Templates ────────────────────────────────────────────────────────────

  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    const res = await this.client(credentials).get<ListResponse<RawNitroSignTemplate>>(
      '/templates',
      this.listParams(params),
    )
    return pickList<RawNitroSignTemplate>(res, 'templates').map(transformTemplate)
  }

  async getTemplate(credentials: Credentials, id: string): Promise<Template> {
    const raw = await this.client(credentials).get<RawNitroSignTemplate>(`/templates/${id}`)
    return transformTemplate(raw)
  }
}
