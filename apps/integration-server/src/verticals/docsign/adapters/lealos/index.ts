/**
 * Lealos adapter — Korean e-signature provider.
 *
 * NOTE: no first-party Lealos API documentation could be found (checked
 * 2026-09-24). The base host `api.lealos.com` has no DNS record,
 * `lealos.com` refuses connections, and the Wayback Machine holds 2003-2005
 * captures of the domain (a GoDaddy parking page, then a personal photo
 * gallery) and nothing later except a 2014 favicon request that returned 404. The envelope and template paths below are unverified
 * guesses. They were outside this rebuild's scope and are left as they were.
 *
 * Signers, documents and the audit trail refuse with 501 NOT_SUPPORTED
 * before sending anything, because no document describes an endpoint for
 * them. The audit trail used to fall back to entries made up from document
 * timestamps, and that fallback has been removed.
 *
 * Authentication: Bearer API key. There is no OAuth flow — call
 * `credentialFields()` + `exchangeCredentials()` (Connect Link flow).
 *
 * Refused fields:
 *   - Document content / preview URLs
 *   - Signature images
 *   - Korean KISA / NIPA accredited-CA payloads
 */

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
  exchangeCode as lealosExchange,
  refreshCredentials as lealosRefresh,
} from './auth'
import { LealosClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import { verifyLealosWebhook, parseLealosWebhookEvents } from './webhook'

import { transformEnvelope, type RawLealosDocument } from './transform/envelope'
import { transformTemplate, type RawLealosTemplate } from './transform/template'

export interface LealosAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

interface DocumentListResponse {
  documents?: RawLealosDocument[]
  data?: RawLealosDocument[]
}

const NO_API_REASON =
  '"getaddrinfo ENOTFOUND api.lealos.com" (the API host has no DNS record) and Lealos publishes no API documentation'

function notSupported(what: string): Error {
  return Object.assign(new Error(`Lealos cannot ${what}: ${NO_API_REASON}`), {
    statusCode: 501,
    code: 'NOT_SUPPORTED',
  })
}

interface TemplateListResponse {
  templates?: RawLealosTemplate[]
  data?: RawLealosTemplate[]
}

export class LealosAdapter implements DocsignAdapter {
  readonly platform = 'lealos'
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
    return lealosExchange(code, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return lealosRefresh(credentials)
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'apiKey',
        label: 'API Key',
        type: 'password',
        required: true,
        placeholder: 'Lealos API key',
        helpText: 'Generate from the Lealos dashboard. Sent as a Bearer token on every request.',
      },
    ]
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return exchangeApiKey(fields)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyLealosWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseLealosWebhookEvents(payload)
  }

  private client(credentials: Credentials): LealosClient {
    return new LealosClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      page: params.page ?? 1,
      page_size: params.limit ?? DEFAULT_PAGE_SIZE,
    }
  }

  // ── Envelopes (documents) ────────────────────────────────────────────────

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const res = await this.client(credentials).get<DocumentListResponse | RawLealosDocument[]>(
      '/documents',
      this.listParams(params),
    )
    const docs: RawLealosDocument[] = Array.isArray(res)
      ? res
      : (res.documents ?? res.data ?? [])
    return docs.map(transformEnvelope)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const raw = await this.client(credentials).get<RawLealosDocument>(`/documents/${id}`)
    return transformEnvelope(raw)
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Envelope> {
    await this.client(credentials).post(`/documents/${id}/cancel`)
    return this.getEnvelope(credentials, id)
  }

  // ── Signers, documents, audit trail: refused ─────────────────────────────
  //
  // No first-party Lealos API document exists to build these on. The base
  // host api.lealos.com has no DNS record, lealos.com refuses connections,
  // and its archived pages (2003-2005) are a GoDaddy parking page and a
  // personal photo gallery; the only later capture is a 2014 favicon 404. The paths these methods used to call
  // (/documents/{id}, /documents/{id}/history) were guesses, and the audit
  // trail fell back to entries made up from document timestamps. Each method
  // now refuses before a client is built.

  async listSigners(
    _credentials: Credentials,
    _envelopeId: string,
    _params: QueryParams,
  ): Promise<Signer[]> {
    throw notSupported('list signers')
  }

  async getSigner(_credentials: Credentials, _id: string): Promise<Signer> {
    throw notSupported('get signers')
  }

  async listDocuments(
    _credentials: Credentials,
    _envelopeId: string,
    _params: QueryParams,
  ): Promise<Document[]> {
    throw notSupported('list documents')
  }

  async getDocument(_credentials: Credentials, _id: string): Promise<Document> {
    throw notSupported('get documents')
  }

  async listAuditTrailEntries(
    _credentials: Credentials,
    _envelopeId: string,
    _params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    throw notSupported('list audit trail entries')
  }

  async getAuditTrailEntry(_credentials: Credentials, _id: string): Promise<AuditTrailEntry> {
    throw notSupported('get audit trail entries')
  }

  // ── Templates ────────────────────────────────────────────────────────────

  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    try {
      const res = await this.client(credentials).get<TemplateListResponse | RawLealosTemplate[]>(
        '/templates',
        this.listParams(params),
      )
      const templates: RawLealosTemplate[] = Array.isArray(res)
        ? res
        : (res.templates ?? res.data ?? [])
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
    const raw = await this.client(credentials).get<RawLealosTemplate>(`/templates/${id}`)
    return transformTemplate(raw)
  }
}
