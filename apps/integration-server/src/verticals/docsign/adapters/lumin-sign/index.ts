/**
 * Lumin Sign adapter.
 *
 * Maps Lumin Sign `signature_request` → canonical `Envelope`, the embedded
 * `signers[]` → `Signer`, and `templates` → `Template`. Auth is api-key only
 * (the `X-API-Key` header); the Connect Link hosted form collects the API
 * key plus an environment toggle (production / sandbox).
 *
 * Resources Lumin Sign does NOT expose are intentionally left unimplemented
 * so the router returns 501:
 *   - listEnvelopes      — no list/search endpoint; requests are fetched by id.
 *   - listDocuments /    — the only document endpoints stream raw PDF *content*,
 *     getDocument          which the canonical Document schema firewall refuses;
 *                          there is no content-free document-metadata surface.
 *   - listAuditTrailEntries / getAuditTrailEntry
 *                        — no audit-trail endpoint.
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: document — No GET document-metadata endpoint exists. Document
//   endpoints are write-only (POST /documents, POST /documents/from-template).
//   GET /signature_request/{id}/file returns a signed URL for binary PDF
//   content, not a metadata record. The signature_request response carries no
//   per-document fields. Verified against openapi.json + llms.txt index.
// Unavailable: audit-trail-entry — No audit trail or event-history endpoint
//   exists in the Lumin Sign API. Confirmed absent from the complete official
//   documentation index (llms.txt) and OpenAPI specification.

import { customForm, pageOffset, reportUpstreamPage } from '@opensteward/shared'
import type { Credentials, QueryParams, CredentialField } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Template } from '../../schema/template'
import type { WebhookEvent } from '../../schema/webhook'

import {
  buildAuthUrl,
  exchangeCode as luminSignExchange,
  refreshCredentials as luminSignRefresh,
} from './auth'
import { LuminSignClient } from './client'
import {
  ALLOWED_PAGE_SIZES,
  API_VERSION,
  API_VERSION_HEADER,
  DEFAULT_PAGE_SIZE,
  DEFAULT_SCOPES,
  MAX_PAGE_SIZE,
} from './constants'
import { verifyLuminSignWebhook, parseLuminSignWebhookEvents } from './webhook'

import {
  transformEnvelope,
  type RawLuminSignSignatureRequest,
} from './transform/envelope'
import { transformSigner } from './transform/signer'
import { transformTemplate, type RawLuminSignTemplate } from './transform/template'

export interface LuminSignAdapterConfig {
  clientId: string
  /** Treated as the API key — Lumin Sign is api-key auth. */
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

interface SignatureRequestResponse {
  signature_request?: RawLuminSignSignatureRequest
}

interface TemplateListResponse {
  page?: number
  limit?: number
  total_count?: number
  data?: RawLuminSignTemplate[]
}

const FORM_FIELDS: CredentialField[] = [
  {
    name: 'apiKey',
    label: 'Lumin Sign API key',
    type: 'password',
    placeholder: 'lmn_...',
    helpText: 'Generate this in Lumin → Settings → Developer settings → API keys.',
    required: true,
  },
  {
    name: 'environment',
    label: 'Environment',
    type: 'select',
    helpText: 'Use sandbox for testing against api-sandbox.luminpdf.com.',
    required: false,
    options: [
      { value: 'production', label: 'Production' },
      { value: 'sandbox', label: 'Sandbox' },
    ],
  },
]

const LUMIN_SIGN_FORM = customForm({
  fields: FORM_FIELDS,
  exchange: async (fields) => {
    const apiKey = (fields['apiKey'] ?? '').trim()
    if (!apiKey) throw new Error('Lumin Sign API key is required.')
    const environment = (fields['environment'] ?? '').trim() === 'sandbox' ? 'sandbox' : 'production'
    return {
      accessToken: apiKey,
      extra: { environment },
    }
  },
})

export class LuminSignAdapter implements DocsignAdapter {
  readonly platform = 'lumin-sign'
  readonly version = '0.1.0'
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  // Connect Link — API key + environment toggle.
  credentialFields = LUMIN_SIGN_FORM.credentialFields
  exchangeCredentials = LUMIN_SIGN_FORM.exchangeCredentials

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: LuminSignAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return luminSignExchange(code, redirectUri, this.clientId, this.clientSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return luminSignRefresh(credentials, this.clientId, this.clientSecret)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyLuminSignWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseLuminSignWebhookEvents(payload)
  }

  private client(credentials: Credentials): LuminSignClient {
    return new LuminSignClient(credentials)
  }

  // ── Envelopes (signature_request) ─────────────────────────────────────────
  //
  // Lumin has no list/search endpoint — only fetch-by-id and cancel.

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const res = await this.client(credentials).get<SignatureRequestResponse>(
      `/signature_request/${id}`,
    )
    if (!res.signature_request) throw new Error(`signature_request ${id} not found`)
    return transformEnvelope(res.signature_request)
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Envelope> {
    await this.client(credentials).put(`/signature_request/cancel/${id}`)
    return this.getEnvelope(credentials, id)
  }

  // ── Signers (embedded on the signature request) ───────────────────────────

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    _params: QueryParams,
  ): Promise<Signer[]> {
    const res = await this.client(credentials).get<SignatureRequestResponse>(
      `/signature_request/${envelopeId}`,
    )
    const request = res.signature_request
    if (!request) throw new Error(`signature_request ${envelopeId} not found`)
    return (request.signers ?? []).map((s) => transformSigner(s, envelopeId))
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    // Lumin signers have no addressable id — the caller passes
    // "<signature_request_id>:<email>" and we filter the embedded list.
    const sep = id.indexOf(':')
    if (sep <= 0 || sep === id.length - 1) {
      throw new Error('Lumin Sign signer id expects shape "<signatureRequestId>:<email>"')
    }
    const envelopeId = id.slice(0, sep)
    const email = id.slice(sep + 1)
    const all = await this.listSigners(credentials, envelopeId, {})
    const found = all.find((s) => s.externalId === email)
    if (!found) throw new Error(`Signer ${email} not found on signature request ${envelopeId}`)
    return found
  }

  // ── Templates ──────────────────────────────────────────────────────────────

  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    // Lumin's `limit` is an enum (10, 25, 50), so read upstream pages of the
    // smallest allowed size ≥ the caller's limit and slice out exactly the
    // caller's rows. Because that size is ≥ the limit, they span ≤ 2 pages.
    // The router never sends a limit below 1; a direct caller that does gets
    // the default. Above the largest allowed size (MAX_PAGE_SIZE), clamp to it.
    //
    // The page served follows the caller's limit; the upstream size, snapped
    // to 10/25/50, is only what it costs. So every page reports `pagedLocally`:
    // without it the paging gate reads the snapped size, which does not follow
    // the limit, as `fixed-size`. The paging tests pin that each row is served
    // once. A limit above 50 (a direct call: the router and the sync ask for at
    // most `maxPageSize`) is served in pages of 50, reported as `pageSize` so
    // the page is judged at the size it was cut at.
    const asked = params.limit ?? DEFAULT_PAGE_SIZE
    const wanted = asked >= 1 ? Math.floor(asked) : DEFAULT_PAGE_SIZE
    const size = ALLOWED_PAGE_SIZES.find((s) => s >= wanted) ?? MAX_PAGE_SIZE
    const limit = Math.min(wanted, size)
    const start = pageOffset(params, limit)
    let page = Math.floor(start / size) + 1
    const skip = start - (page - 1) * size
    const client = this.client(credentials)
    const rows: RawLuminSignTemplate[] = []
    while (rows.length < skip + limit) {
      const res = await client.get<TemplateListResponse>(
        '/templates',
        { page, limit: size },
        { [API_VERSION_HEADER]: API_VERSION },
      )
      const data = res.data ?? []
      rows.push(...data)
      if (data.length < size) break
      page++
    }
    reportUpstreamPage(params, {
      pagedLocally: true,
      ...(typeof params.limit === 'number' && limit < params.limit ? { pageSize: limit } : {}),
    })
    return rows.slice(skip, skip + limit).map(transformTemplate)
  }

  async getTemplate(credentials: Credentials, id: string): Promise<Template> {
    const raw = await this.client(credentials).get<RawLuminSignTemplate>(`/templates/${id}`)
    return transformTemplate(raw)
  }
}
