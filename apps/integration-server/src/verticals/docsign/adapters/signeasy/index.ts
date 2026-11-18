/**
 * SignEasy adapter (global SMB, mobile-first).
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
  buildAuthUrl,
  exchangeCode as signeasyExchange,
  refreshCredentials as signeasyRefresh,
} from './auth'
import { SignEasyClient } from './client'
import { DEFAULT_SCOPES } from './constants'
import { verifySignEasyWebhook, parseSignEasyWebhookEvents } from './webhook'

import { transformEnvelope, type RawSignEasyEnvelope } from './transform/envelope'
import { transformSigner } from './transform/signer'
import { transformDocument } from './transform/document'
import { transformTemplate, type RawSignEasyTemplate } from './transform/template'

export interface SignEasyAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

/** GET /rs/envelope/ — documented response `{ "count": 2, "files": [ ... ] }`. */
interface EnvelopeListResponse {
  count?: number
  files?: RawSignEasyEnvelope[]
}

/** GET /rs/envelope/signed/ — each `files[]` item carries its `pending_file`. */
interface SignedEnvelopeListResponse {
  count?: number
  files?: Array<{ id?: number; pending_file?: RawSignEasyEnvelope; [key: string]: unknown }>
}

function auditTrailNotSupported(): Error {
  return Object.assign(
    new Error(
      'SignEasy cannot list audit trail entries: its only documented audit trail is the signature certificate, "use the Download a signed envelope with certificate endpoint to fetch the PDF of the audit trail"',
    ),
    { statusCode: 501, code: 'NOT_SUPPORTED' },
  )
}

export class SignEasyAdapter implements DocsignAdapter {
  readonly platform = 'signeasy'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: SignEasyAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return signeasyExchange(code, redirectUri, this.clientId, this.clientSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return signeasyRefresh(credentials, this.clientId, this.clientSecret)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifySignEasyWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseSignEasyWebhookEvents(payload)
  }

  private client(credentials: Credentials): SignEasyClient {
    return new SignEasyClient(credentials)
  }

  /** GET /rs/envelope/{pending_file_id} — "Fetch an envelope". */
  private async fetchEnvelope(
    credentials: Credentials,
    id: string,
  ): Promise<RawSignEasyEnvelope> {
    return this.client(credentials).get<RawSignEasyEnvelope>(
      `/rs/envelope/${encodeURIComponent(id)}`,
    )
  }

  /**
   * Every envelope of the user, paged locally: neither list endpoint pages.
   *
   * - GET /rs/envelope/ ("Fetch all envelopes") takes only `include_expired`
   *   (default false) and answers `{count, files}` with "all the pending files
   *   of a user ... irrespective of whether the pending file is incomplete,
   *   canceled or recipient_declined". `include_expired: true` keeps expired
   *   envelopes in the set.
   * - Completed envelopes are the `pending_file` of each GET /rs/envelope/signed/
   *   ("Fetch all signed envelopes") item, whose `pending_file.id` is the
   *   `pending_file_id` that GET /rs/envelope/{pending_file_id} reads back.
   *
   * An id present in both lists is served once.
   *
   * Neither list's documented items carry `sources`, `expiry_time` or
   * `message`, so listed envelopes have `documentIds: []` and no `expiresAt`
   * or `message`. getEnvelope (GET /rs/envelope/{pending_file_id}) fills them;
   * use listDocuments(envelopeId) for an envelope's documents.
   */
  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const client = this.client(credentials)
    const pending = await client.get<EnvelopeListResponse>('/rs/envelope/', {
      include_expired: true,
    })
    const signed = await client.get<SignedEnvelopeListResponse>('/rs/envelope/signed/')
    const raws: RawSignEasyEnvelope[] = [
      ...(pending.files ?? []),
      ...(signed.files ?? []).flatMap((f) => (f.pending_file ? [f.pending_file] : [])),
    ]
    const seen = new Set<string>()
    const rows: Envelope[] = []
    for (const raw of raws) {
      const env = transformEnvelope(raw, 'name')
      if (seen.has(env.id)) continue
      seen.add(env.id)
      rows.push(env)
    }
    return pageLocally(rows, params)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    return transformEnvelope(await this.fetchEnvelope(credentials, id), 'subject')
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Envelope> {
    await this.client(credentials).post(`/requests/${id}/cancel`, {
      reason: data?.reason ?? 'Voided by API',
    })
    return this.getEnvelope(credentials, id)
  }

  /** The envelope's documented `recipients[]`, whole in one response, paged locally. */
  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    const raw = await this.fetchEnvelope(credentials, envelopeId)
    const signers = (raw.recipients ?? []).map((r) => transformSigner(r, envelopeId))
    return pageLocally(signers, params)
  }

  async getSigner(_credentials: Credentials, id: string): Promise<Signer> {
    throw new Error(
      `SignEasy does not expose a signer-by-id endpoint. Use listSigners(envelopeId). id=${id}`,
    )
  }

  /** The envelope's documented `sources[]`, whole in one response, paged locally. */
  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    const raw = await this.fetchEnvelope(credentials, envelopeId)
    const docs = (raw.sources ?? []).map((s, i) => transformDocument(s, envelopeId, i))
    return pageLocally(docs, params)
  }

  async getDocument(_credentials: Credentials, id: string): Promise<Document> {
    throw new Error(
      `SignEasy documents are envelope-scoped; call listDocuments(envelopeId). id=${id}`,
    )
  }

  /**
   * SignEasy documents no audit-trail JSON: the audit trail is a signature
   * certificate delivered as a PDF.
   * https://docs.signeasy.com/docs/signature-certificate.md
   */
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

  /** GET /template — "Fetch all templates": no parameters, a bare array, paged locally. */
  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    const raw = await this.client(credentials).get<unknown>('/template')
    if (!Array.isArray(raw)) {
      // Documented 200 body is a bare array; anything else is not "no templates".
      throw new Error('SignEasy GET /template did not return the documented array')
    }
    return pageLocally((raw as RawSignEasyTemplate[]).map(transformTemplate), params)
  }

  /** GET /template/{template_id} — "Fetch a template". */
  async getTemplate(credentials: Credentials, id: string): Promise<Template> {
    const raw = await this.client(credentials).get<RawSignEasyTemplate>(
      `/template/${encodeURIComponent(id)}`,
    )
    return transformTemplate(raw)
  }
}
