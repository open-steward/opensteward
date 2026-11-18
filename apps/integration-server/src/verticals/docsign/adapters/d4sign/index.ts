/**
 * D4Sign adapter — Brazilian e-signature provider.
 *
 * Maps D4Sign `documents` → canonical `Envelope`, embedded `signers[]` /
 * `/documents/{id}/list` → `Signer`, the same record → `Document`, and
 * `/templates` → `Template`. Audit-trail entries are refused (501): D4Sign
 * documents no history endpoint.
 *
 * Authentication: TWO tokens (`tokenAPI` + `cryptKey`) passed as query
 * params on every request. This adapter does NOT use OAuth — call
 * `credentialFields()` + `exchangeCredentials()` (Connect Link flow).
 *
 * Note: D4Sign API documentation has historical inconsistencies on status
 * codes (some docs map status `4` to completed, others map `3` to
 * completed). The transform handles both shapes; unknowns fall back to
 * draft.
 *
 * Refused fields:
 *   - Document content / download URLs
 *   - Signature images
 *   - ICP-Brasil digital certificate payloads
 *
 * Docs: https://docapi.d4sign.com.br/docs
 */

import type { Credentials, QueryParams, CredentialField } from '@opensteward/shared'
import { pageLocally } from '@opensteward/shared'
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
  exchangeCode as d4Exchange,
  refreshCredentials as d4Refresh,
} from './auth'
import { D4SignClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import { verifyD4SignWebhook, parseD4SignWebhookEvents } from './webhook'

import {
  transformEnvelope,
  type RawD4SignDocument,
  type RawD4SignSigner,
} from './transform/envelope'
import { transformSigner } from './transform/signer'
import { transformDocument } from './transform/document'
import {
  transformTemplate,
  type RawD4SignTemplate,
} from './transform/template'

const AUDIT_TRAIL_REASON =
  'the D4Sign API reference (docapi.d4sign.com.br/llms.txt) documents no audit-trail or document-history endpoint'

function auditTrailNotSupported(verb: 'list' | 'get'): Error {
  return Object.assign(
    new Error(`D4Sign cannot ${verb} audit trail entries: ${AUDIT_TRAIL_REASON}`),
    { statusCode: 501, code: 'NOT_SUPPORTED' },
  )
}

export interface D4SignAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

interface ListSignersResponse {
  list?: RawD4SignSigner[]
  signers?: RawD4SignSigner[]
}

export class D4SignAdapter implements DocsignAdapter {
  readonly platform = 'd4sign'
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
    return d4Exchange(code, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return d4Refresh(credentials)
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'tokenAPI',
        label: 'tokenAPI',
        type: 'password',
        required: true,
        placeholder: 'D4Sign tokenAPI',
        helpText:
          'Account-scoped API token. Generate at secure.d4sign.com.br → Integrações → API.',
      },
      {
        name: 'cryptKey',
        label: 'cryptKey',
        type: 'password',
        required: true,
        placeholder: 'D4Sign cryptKey',
        helpText:
          'Per-account cryptographic helper key. Issued alongside the tokenAPI in the same dashboard.',
      },
    ]
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return exchangeApiKey(fields)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyD4SignWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseD4SignWebhookEvents(payload)
  }

  private client(credentials: Credentials): D4SignClient {
    return new D4SignClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      pageNumber: params.page ?? 1,
      pageSize: params.limit ?? DEFAULT_PAGE_SIZE,
    }
  }

  // ── Envelopes (documents) ────────────────────────────────────────────────

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const res = await this.client(credentials).get<RawD4SignDocument[]>(
      '/documents',
      this.listParams(params),
    )
    return (res ?? []).map(transformEnvelope)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const raw = await this.client(credentials).get<RawD4SignDocument | RawD4SignDocument[]>(
      `/documents/${id}`,
    )
    const doc = Array.isArray(raw) ? raw[0] : raw
    if (!doc) throw new Error(`D4Sign document ${id} not found`)
    return transformEnvelope(doc)
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Envelope> {
    await this.client(credentials).post(`/documents/${id}/cancel`)
    return this.getEnvelope(credentials, id)
  }

  // ── Signers ───────────────────────────────────────────────────────────────

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    const res = await this.client(credentials).get<ListSignersResponse | RawD4SignSigner[]>(
      `/documents/${envelopeId}/list`,
    )
    let signers: RawD4SignSigner[] = []
    if (Array.isArray(res)) {
      signers = res
    } else if (Array.isArray(res.list)) {
      signers = res.list
    } else if (Array.isArray(res.signers)) {
      signers = res.signers
    }
    // `GET /documents/{UUID}/list` returns every signer and takes no paging
    // parameter (docapi.d4sign.com.br/docs/endpoints-1), so page it here.
    return pageLocally(
      signers.map((s) => transformSigner(s, envelopeId)),
      params,
    )
  }

  async getSigner(_credentials: Credentials, id: string): Promise<Signer> {
    throw new Error(
      `D4Sign does not expose a signer-by-id endpoint. Use listSigners(envelopeId). id=${id}`,
    )
  }

  // ── Documents (metadata only — content REFUSED) ──────────────────────────

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    const raw = await this.client(credentials).get<RawD4SignDocument | RawD4SignDocument[]>(
      `/documents/${envelopeId}`,
    )
    const doc = Array.isArray(raw) ? raw[0] : raw
    // `GET /documents/{UUID}` returns only the requested document
    // (docapi.d4sign.com.br/docs/endpoints-2): a whole collection of one.
    return pageLocally(doc ? [transformDocument(doc)] : [], params)
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const raw = await this.client(credentials).get<RawD4SignDocument | RawD4SignDocument[]>(
      `/documents/${id}`,
    )
    const doc = Array.isArray(raw) ? raw[0] : raw
    if (!doc) throw new Error(`D4Sign document ${id} not found`)
    return transformDocument(doc)
  }

  // ── Audit-trail entries ──────────────────────────────────────────────────

  // D4Sign documents no audit-trail / history endpoint. `GET
  // /documents/{UUID}/historic`, which this adapter used to call, is on none
  // of the pages https://docapi.d4sign.com.br/llms.txt lists. Refuse before
  // sending anything rather than read an undocumented response.

  async listAuditTrailEntries(
    _credentials: Credentials,
    _envelopeId: string,
    _params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    throw auditTrailNotSupported('list')
  }

  async getAuditTrailEntry(_credentials: Credentials, _id: string): Promise<AuditTrailEntry> {
    throw auditTrailNotSupported('get')
  }

  // ── Templates ────────────────────────────────────────────────────────────

  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    const res = await this.client(credentials).get<RawD4SignTemplate[] | { templates?: RawD4SignTemplate[] }>(
      '/templates',
      this.listParams(params),
    )
    const templates: RawD4SignTemplate[] = Array.isArray(res)
      ? res
      : Array.isArray(res?.templates)
        ? res.templates
        : []
    return templates.map(transformTemplate)
  }

  async getTemplate(credentials: Credentials, id: string): Promise<Template> {
    const res = await this.client(credentials).get<RawD4SignTemplate | RawD4SignTemplate[]>(
      `/templates/${id}`,
    )
    const t = Array.isArray(res) ? res[0] : res
    if (!t) throw new Error(`D4Sign template ${id} not found`)
    return transformTemplate(t)
  }
}
