/**
 * Privy (PrivyID) adapter.
 *
 * Maps Privy *documents* → canonical `Envelope` (a Privy document IS the
 * envelope — it carries title, owner, status, recipients and the uploaded
 * file inline), its recipients (Signers / Reviewers) → `Signer`, and the
 * single uploaded file → `Document` (metadata only — content is REFUSED).
 *
 * Privy's merchant API has no template resource and exposes no separate
 * audit-trail endpoint, so `listTemplates`/`getTemplate` and the
 * audit-trail methods are intentionally omitted — the router returns 501
 * for them. Privy delivers status changes via merchant callbacks, but
 * those callbacks are not cryptographically signed (delivery is gated by
 * the registered callback URL + Merchant-Key), so no `verifyWebhook` /
 * `parseWebhookEvents` is wired here.
 *
 * Auth is a static merchant key (`Merchant-Key` header) collected via the
 * Connect Link credential form; there is no OAuth flow, so
 * `getAuthUrl`/`exchangeCode` throw.
 *
 * Product: https://privy.id/
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Available:   envelope, signer, document
 * Unavailable: audit-trail-entry — Privy merchant API exposes no audit-trail
 *              or activity-log endpoint; status changes arrive via callbacks only.
 * Unavailable: template — Privy merchant API has no template concept;
 *              merchants upload one-off documents on each request.
 */

import type { Credentials, QueryParams, CredentialField } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'

import { FORM } from './auth'
import { PrivyidClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import { transformEnvelope, type RawPrivyDocument } from './transform/envelope'
import { transformSigner } from './transform/signer'
import { transformDocument, type RawPrivyDocumentFile } from './transform/document'

export interface PrivyidAdapterConfig {
  clientId: string
  /** Treated as the merchant key when supplied via instance config rather than the form. */
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

/** Privy wraps every response in `{ code, message, data }`. */
interface PrivyEnvelope<T> {
  code?: number | string
  message?: string
  data?: T
}

/** `document/list` returns a page of documents (sometimes under `documents`). */
interface DocumentListData {
  documents?: RawPrivyDocument[]
  docs?: RawPrivyDocument[]
  total?: number
  page?: number
}

export class PrivyidAdapter implements DocsignAdapter {
  readonly platform = 'privyid'
  readonly version = '0.1.0'

   
  private clientId: string
  private clientSecret: string
   
  private redirectUri: string
   
  private scopes: string[]

  constructor(config: PrivyidAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? []
  }

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    throw new Error('privyid uses static merchant-key auth; use credentialFields() instead')
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('privyid uses static merchant-key auth; use exchangeCredentials() instead')
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

  private client(credentials: Credentials): PrivyidClient {
    return new PrivyidClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      page: params.page ?? 1,
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    if (params['status']) out.status = String(params['status'])
    return out
  }

  private async documentDetail(
    credentials: Credentials,
    docToken: string,
  ): Promise<RawPrivyDocument> {
    const res = await this.client(credentials).get<PrivyEnvelope<RawPrivyDocument>>(
      `/document/status/${docToken}`,
    )
    const doc = res.data
    if (!doc) throw new Error(`Privy document ${docToken} not found`)
    return doc
  }

  // ── Envelopes (Privy documents) ───────────────────────────────────────────

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const res = await this.client(credentials).get<PrivyEnvelope<DocumentListData>>(
      '/document/list',
      this.listParams(params),
    )
    const docs = res.data?.documents ?? res.data?.docs ?? []
    return docs.map(transformEnvelope)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const raw = await this.documentDetail(credentials, id)
    return transformEnvelope(raw)
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Envelope> {
    await this.client(credentials).post('/document/cancel', {
      docToken: id,
      reason: data?.reason ?? 'Cancelled by API',
    })
    return this.getEnvelope(credentials, id)
  }

  // ── Signers (document recipients: Signers / Reviewers) ────────────────────

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    _params: QueryParams,
  ): Promise<Signer[]> {
    const raw = await this.documentDetail(credentials, envelopeId)
    return (raw.recipients ?? []).map((r) => transformSigner(r, envelopeId))
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    const [envelopeId, recipientId] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId || !recipientId) {
      throw new Error('privyid getSigner expects an id of shape "<docToken>:<privyId>"')
    }
    const all = await this.listSigners(credentials, envelopeId, {})
    const found = all.find((s) => s.externalId === recipientId)
    if (!found) throw new Error(`Recipient ${recipientId} not found on document ${envelopeId}`)
    return found
  }

  // ── Documents (single uploaded file, metadata only — content REFUSED) ─────

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    _params: QueryParams,
  ): Promise<Document[]> {
    const raw = (await this.documentDetail(credentials, envelopeId)) as RawPrivyDocumentFile
    return [transformDocument(raw, envelopeId)]
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const [envelopeId] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId) {
      throw new Error('privyid getDocument expects an id of shape "<docToken>:<docToken>"')
    }
    const raw = (await this.documentDetail(credentials, envelopeId)) as RawPrivyDocumentFile
    return transformDocument(raw, envelopeId)
  }
}
