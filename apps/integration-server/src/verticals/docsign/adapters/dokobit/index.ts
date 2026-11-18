/**
 * Dokobit adapter, on the Portal API (https://beta.dokobit.com/api/doc;
 * production host app.dokobit.com). Static API key, sent as the
 * `access_token` query parameter.
 *
 * The Portal API documents one list, GET /api/signing/list.json, which takes no
 * page or size ("Returns list of all user signings"), and a per-signing read,
 * GET /api/signing/{token}/status.json, that carries the signers and files
 * inline. Every list here is therefore paged locally. It documents no audit
 * trail and no templates, so those methods refuse.
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
  credentialFields as dokobitCredentialFields,
  exchangeCredentials as dokobitExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { DokobitClient } from './client'
import { verifyDokobitWebhook, parseDokobitWebhookEvents } from './webhook'

import {
  transformEnvelope,
  type RawDokobitSigningListRow,
  type RawDokobitSigningStatus,
} from './transform/envelope'
import { transformSigner } from './transform/signer'
import { transformDocument } from './transform/document'

export interface DokobitAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

/** GET /api/signing/list.json: `{ "status": "ok", "signings": [...] }`. */
interface SigningListResponse {
  status?: string
  signings?: RawDokobitSigningListRow[]
}

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

function requireArray<T>(value: T[] | undefined, what: string): T[] {
  if (!Array.isArray(value)) {
    throw new Error(`Dokobit ${what} was not an array; refusing to read it as empty`)
  }
  return value
}

export class DokobitAdapter implements DocsignAdapter {
  readonly platform = 'dokobit'
  readonly version = '0.1.0'

  constructor(_config: DokobitAdapterConfig) {}

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('dokobit uses static API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  credentialFields(): CredentialField[] {
    return dokobitCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return dokobitExchangeCredentials(fields)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyDokobitWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseDokobitWebhookEvents(payload)
  }

  private client(credentials: Credentials): DokobitClient {
    return new DokobitClient(credentials)
  }

  private status(client: DokobitClient, token: string): Promise<RawDokobitSigningStatus> {
    return client.get<RawDokobitSigningStatus>(`/signing/${encodeURIComponent(token)}/status.json`)
  }

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const client = this.client(credentials)
    const res = await client.get<SigningListResponse>('/signing/list.json')
    const rows = requireArray(res.signings, 'GET /api/signing/list.json `signings`')
    // list.json carries no signing name, so each row on the page is completed
    // from its status.json.
    const out: Envelope[] = []
    for (const row of pageLocally(rows, params)) {
      out.push(transformEnvelope(row.token, await this.status(client, row.token), row))
    }
    return out
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    return transformEnvelope(id, await this.status(this.client(credentials), id))
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Envelope> {
    await this.client(credentials).post(`/signings/${id}/cancel`, {
      reason: data?.reason ?? 'Voided by API',
    })
    return this.getEnvelope(credentials, id)
  }

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    const status = await this.status(this.client(credentials), envelopeId)
    const signers = requireArray(status.signers, 'GET /api/signing/{token}/status.json `signers`')
    return pageLocally(
      signers.map((s) => transformSigner(s, envelopeId)),
      params,
    )
  }

  async getSigner(_credentials: Credentials, id: string): Promise<Signer> {
    throw new Error(`dokobit signers are signing-scoped; call listSigners(envelopeId). id=${id}`)
  }

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    const status = await this.status(this.client(credentials), envelopeId)
    const files = requireArray(status.files, 'GET /api/signing/{token}/status.json `files`')
    return pageLocally(
      files.map((f, i) => transformDocument(f, envelopeId, i)),
      params,
    )
  }

  /** `id` is `<signing token>:<index in files>`, as listDocuments returns it. */
  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const at = id.lastIndexOf(':')
    const envelopeId = id.slice(0, at)
    const index = Number(id.slice(at + 1))
    if (at <= 0 || !Number.isInteger(index) || index < 0) {
      throw Object.assign(new Error('dokobit document id expects "<signingToken>:<index>"'), {
        statusCode: 400,
      })
    }
    const status = await this.status(this.client(credentials), envelopeId)
    const files = requireArray(status.files, 'GET /api/signing/{token}/status.json `files`')
    const file = files[index]
    if (!file) {
      throw Object.assign(new Error(`dokobit document ${id} not found`), { statusCode: 404 })
    }
    return transformDocument(file, envelopeId, index)
  }

  async listAuditTrailEntries(
    _credentials: Credentials,
    _envelopeId: string,
    _params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    throw notSupported(
      'Dokobit cannot list audit trail entries: the Portal API documents no audit endpoint; ' +
        'its Signing group is create, list, delete-all, delete, download, remind, share, ' +
        'signers/delete, status and update',
    )
  }

  async getAuditTrailEntry(_credentials: Credentials, _id: string): Promise<AuditTrailEntry> {
    throw notSupported(
      'Dokobit cannot read audit trail entries: the Portal API documents no audit endpoint',
    )
  }

  async listTemplates(_credentials: Credentials, _params: QueryParams): Promise<Template[]> {
    throw notSupported(
      'Dokobit cannot list templates: the Portal API documents no template endpoint; ' +
        'its groups are Category, Seal, Signing and Validation',
    )
  }

  async getTemplate(_credentials: Credentials, _id: string): Promise<Template> {
    throw notSupported(
      'Dokobit cannot read templates: the Portal API documents no template endpoint',
    )
  }
}
