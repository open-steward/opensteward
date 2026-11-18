/**
 * ZealiD adapter (Data API "Orpheus").
 *
 * ZealiD is an eIDAS-qualified trust service provider (QTSP). Of its two
 * API surfaces, only the Data API's per-user signed documents map to the
 * canonical docsign schema. ZealiD has no envelope / signer / template /
 * audit-trail concept, so this adapter implements ONLY Documents:
 *
 *   GET /user/{customer_id}/documents        → listDocuments
 *   GET /user/{customer_id}/documents/{id}    → getDocument
 *
 * All other resource methods are intentionally left off and auto-return
 * 501 Not Implemented from the router.
 *
 * Documents are scoped to a `customer_id` (there is no envelope), so the
 * canonical `envelopeId` carries that customer_id. The router supplies it
 * via the `envelope_id` query parameter; the OAuth grant also captures it
 * on `credentials.extra.customerId` as a fallback.
 *
 * Auth: OAuth2 authorization-code grant (the QR-based authentication flow)
 * yields the per-user `access_token`; every Data API request is then
 * HMAC-SHA512 signed with the integrator client_id/client_secret.
 *
 * Document CONTENT is never exposed: the canonical Document has no content
 * field, and `signed.url` is dropped at the transform layer.
 *
 * ── Resource coverage ──────────────────────────────────────────────────────
 * Available:   document — GET /user/{customer_id}/documents[/{id}]
 * Unavailable: envelope — no envelope concept; documents scoped to customer_id
 * Unavailable: signer — no signer resource; actor is the OAuth-authed user only
 * Unavailable: template — no template support; signing is ad-hoc (upload + QR)
 * Unavailable: audit-trail-entry — no audit trail; only a document status field
 */
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Document } from '../../schema/document'

import {
  buildAuthUrl,
  exchangeCode as zealidExchange,
  refreshCredentials as zealidRefresh,
} from './auth'
import { ZealidClient } from './client'
import { DEFAULT_SCOPES } from './constants'
import { transformDocument, type RawZealidDocument } from './transform/document'

export interface ZealidAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

export class ZealidAdapter implements DocsignAdapter {
  readonly platform = 'zealid'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: ZealidAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return zealidExchange(code, redirectUri, this.clientId, this.clientSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return zealidRefresh(credentials)
  }

  private client(credentials: Credentials): ZealidClient {
    return new ZealidClient(credentials)
  }

  /** Resolve the customer_id keying document-scoped requests. */
  private customerId(credentials: Credentials, fallback?: string): string {
    const fromGrant = String(credentials.extra?.['customerId'] ?? '')
    const id = fallback || fromGrant
    if (!id) {
      throw new Error(
        'ZealiD requires a customer_id; pass it as the envelope_id query parameter',
      )
    }
    return id
  }

  // ── Documents (metadata only — content REFUSED) ──────────────────────────

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    _params: QueryParams,
  ): Promise<Document[]> {
    const customerId = this.customerId(credentials, envelopeId)
    const res = await this.client(credentials).get<RawZealidDocument[]>(
      `/user/${customerId}/documents`,
    )
    return (res ?? []).map((raw, i) => transformDocument(raw, customerId, i))
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const [customerId, documentId] = id.includes(':')
      ? id.split(':')
      : [this.customerId(credentials), id]
    if (!customerId || !documentId) {
      throw new Error(
        'ZealiD getDocument expects an id of shape "<customerId>:<documentId>"',
      )
    }
    const raw = await this.client(credentials).get<RawZealidDocument>(
      `/user/${customerId}/documents/${documentId}`,
    )
    return transformDocument(raw, customerId, 0)
  }
}
