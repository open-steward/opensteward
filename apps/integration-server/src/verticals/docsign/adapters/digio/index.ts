/**
 * Digio adapter — Indian Aadhaar eSign aggregator + paperwork platform.
 *
 * Maps Digio `documents` → canonical `Envelope`, and `/template/list` →
 * `Template`. Signers and the document come from the documented "Get
 * Document Details" (`GET /v2/client/document/{docId}`): its
 * `signing_parties[]` → `Signer`, the record itself → `Document`.
 *
 * Audit trail is refused: Digio's only documented audit trail,
 * `GET /v2/client/document/{doc_id}/v2/audit_log`, downloads a PDF.
 *
 * Authentication: HTTP Basic, `client_id:client_secret`. There is no
 * OAuth flow — call `credentialFields()` + `exchangeCredentials()`
 * (Connect Link flow).
 *
 * Refused fields:
 *   - Document content / signed PDF download URLs
 *   - Signature images
 *   - Aadhaar eSign XML responses (eKYC / OTP / biometric payloads)
 *   - eSign certificate bundles
 *
 * Docs: https://documentation.digio.in/
 */

import { pageLocally } from '@opensteward/shared'
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
  exchangeCode as digioExchange,
  refreshCredentials as digioRefresh,
} from './auth'
import { DigioClient } from './client'
import { DEFAULT_PAGE_SIZE, DOCUMENT_DETAILS_PATH, LEGACY_PREFIX } from './constants'
import { verifyDigioWebhook, parseDigioWebhookEvents } from './webhook'

import { transformEnvelope, type RawDigioDocument } from './transform/envelope'
import { transformSigner } from './transform/signer'
import { transformDocument, type RawDigioDocumentDetails } from './transform/document'
import { transformTemplate, type RawDigioTemplate } from './transform/template'

export interface DigioAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

interface DocumentListResponse {
  entities?: RawDigioDocument[]
  documents?: RawDigioDocument[]
}

/**
 * https://documentation.digio.in/swagger/get_getDocumentAuditLogV2.json
 *   "/v2/client/document/{doc_id}/v2/audit_log": "summary":"Download audit trail",
 *   200: {"schema":{"type":"file","description":"Pdf File","format":"byte"}}
 * No other audit-trail endpoint is documented, so there are no entries to list.
 */
function auditTrailNotSupported(): Error {
  return Object.assign(
    new Error(
      'Digio cannot list audit trail entries: its only documented audit trail, ' +
        'GET /v2/client/document/{doc_id}/v2/audit_log ("Download audit trail"), returns a "Pdf File"',
    ),
    { statusCode: 501, code: 'NOT_SUPPORTED' },
  )
}

interface TemplateListResponse {
  templates?: RawDigioTemplate[]
  entities?: RawDigioTemplate[]
}

export class DigioAdapter implements DocsignAdapter {
  readonly platform = 'digio'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: { clientId: string; clientSecret: string; redirectUri: string; scopes?: string[] }) {
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
    return digioExchange(code, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return digioRefresh(credentials)
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'clientId',
        label: 'Client ID',
        type: 'text',
        required: true,
        placeholder: 'Digio client ID',
        helpText: 'Issued from the Digio dashboard. Used as the username half of the Basic auth pair.',
      },
      {
        name: 'clientSecret',
        label: 'Client Secret',
        type: 'password',
        required: true,
        placeholder: 'Digio client secret',
        helpText: 'Issued from the Digio dashboard. Used as the password half of the Basic auth pair.',
      },
    ]
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return exchangeApiKey(fields)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyDigioWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseDigioWebhookEvents(payload)
  }

  private client(credentials: Credentials): DigioClient {
    return new DigioClient(credentials)
  }

  /** Documented "Get Document Details": GET /v2/client/document/{docId}, no query parameters. */
  private async documentDetails(
    credentials: Credentials,
    docId: string,
  ): Promise<RawDigioDocumentDetails> {
    return this.client(credentials).get<RawDigioDocumentDetails>(
      `${DOCUMENT_DETAILS_PATH}/${encodeURIComponent(docId)}`,
    )
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      page: params.page ?? 1,
      page_size: params.limit ?? DEFAULT_PAGE_SIZE,
    }
  }

  // ── Envelopes (documents) ────────────────────────────────────────────────

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const res = await this.client(credentials).get<DocumentListResponse | RawDigioDocument[]>(
      `${LEGACY_PREFIX}/document/list`,
      this.listParams(params),
    )
    const docs: RawDigioDocument[] = Array.isArray(res)
      ? res
      : (res.entities ?? res.documents ?? [])
    return docs.map(transformEnvelope)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const raw = await this.client(credentials).get<RawDigioDocument>(
      `${LEGACY_PREFIX}/document/${id}`,
    )
    return transformEnvelope(raw)
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Envelope> {
    await this.client(credentials).post(`${LEGACY_PREFIX}/document/${id}/cancel`)
    return this.getEnvelope(credentials, id)
  }

  // ── Signers ───────────────────────────────────────────────────────────────

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    // Every party comes in the one reply; page after mapping.
    const doc = await this.documentDetails(credentials, envelopeId)
    const signers = (doc.signing_parties ?? []).map((p) => transformSigner(p, envelopeId))
    // The docs do not promise an identifier is unique per document, and the id
    // space depends on it, so refuse rather than emit duplicate ids.
    const seen = new Set<string>()
    for (const s of signers) {
      if (seen.has(s.id)) {
        throw new Error(`Digio document ${envelopeId} repeats signing party ${s.externalId}`)
      }
      seen.add(s.id)
    }
    return pageLocally(signers, params)
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    // Digio has no signer-by-id endpoint; the id is "<docId>:<identifier>".
    const sep = id.indexOf(':')
    if (sep <= 0 || sep === id.length - 1) {
      throw new Error('Digio getSigner expects an id of shape "<docId>:<identifier>"')
    }
    const docId = id.slice(0, sep)
    const identifier = id.slice(sep + 1)
    const all = await this.listSigners(credentials, docId, {})
    const found = all.find((s) => s.externalId === identifier)
    if (!found) {
      throw Object.assign(new Error(`Digio signer ${identifier} not found on document ${docId}`), {
        statusCode: 404,
      })
    }
    return found
  }

  // ── Documents (metadata only — content + Aadhaar XML REFUSED) ────────────

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    // A Digio document holds one file: the list is that one record.
    const doc = await this.documentDetails(credentials, envelopeId)
    return pageLocally([transformDocument(doc)], params)
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    return transformDocument(await this.documentDetails(credentials, id))
  }

  // ── Audit-trail entries (REFUSED: documented only as a PDF download) ─────

  async listAuditTrailEntries(
    _credentials: Credentials,
    _envelopeId: string,
    _params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    throw auditTrailNotSupported()
  }

  async getAuditTrailEntry(_credentials: Credentials, _id: string): Promise<AuditTrailEntry> {
    throw auditTrailNotSupported()
  }

  // ── Templates ────────────────────────────────────────────────────────────

  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    try {
      const res = await this.client(credentials).get<TemplateListResponse | RawDigioTemplate[]>(
        `${LEGACY_PREFIX}/template/list`,
        this.listParams(params),
      )
      const templates: RawDigioTemplate[] = Array.isArray(res)
        ? res
        : (res.templates ?? res.entities ?? [])
      return templates.map(transformTemplate)
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
    const raw = await this.client(credentials).get<RawDigioTemplate>(`${LEGACY_PREFIX}/template/${id}`)
    return transformTemplate(raw)
  }
}
