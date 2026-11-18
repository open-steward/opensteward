/**
 * pdfFiller adapter — pdfFiller SignNow-style e-signature REST API.
 *
 * Maps pdfFiller `signature_requests` → canonical `Envelope`, the embedded
 * `recipients[]` → `Signer`, and `templates` → `Template`. pdfFiller exposes
 * no per-envelope document-metadata endpoint and no audit-trail endpoint, so
 * `documents` and `audit_trail_entries` are intentionally not implemented
 * (the router returns 501 for them). Callbacks carry no documented signature,
 * so webhook verification is not wired.
 *
 * Docs: https://docs.pdffiller.com/ — host https://api.pdffiller.com/v2
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: document       — pdfFiller v2 exposes no per-envelope document-metadata endpoint;
//                               signature_request carries only a document_id foreign key with no
//                               name/size/pages fields reachable via a public REST call.
// Unavailable: audit-trail-entry — pdfFiller v2 has no audit-trail or activity-log endpoint;
//                               no such resource is present in the official SDK clients or API reference.

import type { Credentials, QueryParams } from '@opensteward/shared'
import { pageLocally } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Template } from '../../schema/template'

import {
  buildAuthUrl,
  exchangeCode as pdffillerExchange,
  refreshCredentials as pdffillerRefresh,
} from './auth'
import { PdffillerClient } from './client'
import { DEFAULT_PAGE_SIZE, DEFAULT_SCOPES } from './constants'

import {
  transformEnvelope,
  type RawPdffillerSignatureRequest,
} from './transform/envelope'
import { transformSigner } from './transform/signer'
import { transformTemplate, type RawPdffillerTemplate } from './transform/template'

export interface PdffillerAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

/** pdfFiller list envelope: rows under `items`, pagination metadata alongside. */
interface ListResponse<T> {
  items?: T[]
  total?: number
  current_page?: number
  per_page?: number
  next_page_url?: string | null
  prev_page_url?: string | null
}

export class PdffillerAdapter implements DocsignAdapter {
  readonly platform = 'pdffiller'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: PdffillerAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return pdffillerExchange(code, redirectUri, this.clientId, this.clientSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return pdffillerRefresh(credentials, this.clientId, this.clientSecret)
  }

  private client(credentials: Credentials): PdffillerClient {
    return new PdffillerClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      page: params.page ?? 1,
      per_page: params.limit ?? DEFAULT_PAGE_SIZE,
    }
  }

  // ── Envelopes (signature_requests) ────────────────────────────────────────

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const res = await this.client(credentials).get<ListResponse<RawPdffillerSignatureRequest>>(
      '/signature_requests',
      this.listParams(params),
    )
    return (res.items ?? []).map(transformEnvelope)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const raw = await this.client(credentials).get<RawPdffillerSignatureRequest>(
      `/signature_requests/${id}`,
    )
    return transformEnvelope(raw)
  }

  // ── Signers (recipients embedded on a signature_request) ──────────────────

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    // The signature request embeds its whole `recipients[]` array and takes no
    // paging parameter, so the collection is paged here or page 2 repeats page 1.
    const raw = await this.client(credentials).get<RawPdffillerSignatureRequest>(
      `/signature_requests/${envelopeId}`,
    )
    const all = (raw.recipients ?? []).map((r) => transformSigner(r, envelopeId))
    return pageLocally(all, params)
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    const [envelopeId, recipientId] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId || !recipientId) {
      throw new Error('getSigner expects an id of shape "<envelopeId>:<recipientId>"')
    }
    const all = await this.listSigners(credentials, envelopeId, {})
    const found = all.find((s) => s.externalId === recipientId)
    if (!found) throw new Error(`Signer ${recipientId} not found on signature request ${envelopeId}`)
    return found
  }

  // ── Templates ─────────────────────────────────────────────────────────────

  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    const res = await this.client(credentials).get<ListResponse<RawPdffillerTemplate>>(
      '/templates',
      this.listParams(params),
    )
    return (res.items ?? []).map(transformTemplate)
  }

  async getTemplate(credentials: Credentials, id: string): Promise<Template> {
    const raw = await this.client(credentials).get<RawPdffillerTemplate>(`/templates/${id}`)
    return transformTemplate(raw)
  }
}
