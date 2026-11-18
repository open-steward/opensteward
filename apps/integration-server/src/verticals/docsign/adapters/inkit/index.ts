/**
 * Inkit adapter.
 *
 * Inkit is a document-GENERATION platform: it renders documents from
 * templates + merge parameters and delivers them to destinations. It has
 * no e-signature workflow — no envelopes, signers, signing order, or
 * audit trail — so only the two resources Inkit actually exposes are
 * mapped to the canonical docsign schema:
 *
 *   • Documents  — generated-document records (metadata only; the file
 *                  body is never read, so no content can leak).
 *   • Templates  — document templates.
 *
 * Envelopes, signers, and audit-trail entries are intentionally NOT
 * implemented; the router returns 501 Not Implemented for them.
 *
 * Auth: static API token in the `X-Inkit-API-Token` header.
 * Docs:  https://docs.inkit.com/docs/api-endpoints
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: envelope       — Inkit has no envelope/signing-workflow concept; no envelope endpoint exists.
 * Unavailable: signer         — Signers are inline on generation requests only; no list/get endpoint exists.
 * Unavailable: audit-trail-entry — No audit-trail or activity-log endpoint exists in the public REST API.
 */
import type { CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Document } from '../../schema/document'
import type { Template } from '../../schema/template'
import type { WebhookEvent } from '../../schema/webhook'

import { FORM, getAuthUrlUnsupported } from './auth'
import { InkitClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { verifyInkitWebhook, parseInkitWebhookEvents } from './webhook'

import { transformDocument, type RawInkitDocument } from './transform/document'
import { transformTemplate, type RawInkitTemplate } from './transform/template'

export interface InkitAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

/** GET /document and GET /template both page as { items, metadata }. */
interface ListResponse<T> {
  items?: Array<T & { id?: string }>
}

export class InkitAdapter implements DocsignAdapter {
  readonly platform = 'inkit'
  readonly version = '0.1.0'

  constructor(_config: InkitAdapterConfig) {}

  getAuthUrl(_state: string, _scopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('inkit uses a static API token; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  credentialFields(): CredentialField[] {
    return FORM.credentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return FORM.exchangeCredentials(fields)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyInkitWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseInkitWebhookEvents(payload)
  }

  private client(credentials: Credentials): InkitClient {
    return new InkitClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const pageSize = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    return { page: params.page ?? 1, page_size: pageSize }
  }

  // ── Documents (generated documents — metadata only, content REFUSED) ───────

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    const res = await this.client(credentials).get<ListResponse<RawInkitDocument>>(
      '/document',
      this.listParams(params),
    )
    // The list mixes folders + documents; keep document records only, and
    // when an envelopeId (treated as a render scope) is supplied, narrow to it.
    const docs = (res.items ?? []).filter(
      (it): it is RawInkitDocument => typeof it.id === 'string' && it.id.startsWith('doc_'),
    )
    const scoped = envelopeId
      ? docs.filter((d) => d.render_id === envelopeId || d.id === envelopeId)
      : docs
    return scoped.map((d, i) => transformDocument(d, envelopeId, i))
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const raw = await this.client(credentials).get<RawInkitDocument>(`/document/${id}`)
    return transformDocument(raw, raw.render_id ?? id, 0)
  }

  // ── Templates ──────────────────────────────────────────────────────────────

  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    const res = await this.client(credentials).get<ListResponse<RawInkitTemplate>>(
      '/template',
      this.listParams(params),
    )
    return (res.items ?? [])
      .filter((it): it is RawInkitTemplate => typeof it.id === 'string')
      .map(transformTemplate)
  }

  async getTemplate(credentials: Credentials, id: string): Promise<Template> {
    const raw = await this.client(credentials).get<RawInkitTemplate>(`/template/${id}`)
    return transformTemplate(raw)
  }
}
