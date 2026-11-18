/**
 * Signicat Sign API v2 adapter (docsign vertical).
 *
 * Signicat is a server-to-server eIDAS signing platform authorised with
 * OAuth 2.0 client-credentials tokens (scope `signicat-api`). The canonical
 * model maps as:
 *   signing session  → Envelope
 *   signing setup[]   → Signer  (synthesised; signers authenticate via eID)
 *   session document  → Document (metadata only — content REFUSED)
 *
 * Signicat addresses resources by id and exposes no list/search endpoint, no
 * audit-trail endpoint, and no templates in the Sign API. Those methods are
 * intentionally omitted and auto-resolve to 501 Not Implemented.
 *
 * Docs: https://developer.signicat.com/docs/electronic-signing/sign-api-v2/
 *
 * ── Resource coverage ──────────────────────────────────────────────────────
 * Unavailable: audit-trail-entry — Sign API v2 has no per-session audit-trail
 *   endpoint. The separate Signicat Audit Logs API is a general platform log
 *   for authentication events and does not expose signing-session event history.
 * Unavailable: template — Sign API v2 has no template concept; signing sessions
 *   are created dynamically and no template storage or retrieval endpoints exist.
 */

import { oauth2ClientCredentials, pageLocally } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { WebhookEvent } from '../../schema/webhook'

import {
  exchangeCode as signicatExchange,
  refreshCredentials as signicatRefresh,
} from './auth'
import { SignicatClient } from './client'
import { OAUTH_TOKEN_URL, DEFAULT_SCOPES } from './constants'
import { verifySignicatWebhook, parseSignicatWebhookEvents } from './webhook'

import {
  transformEnvelope,
  type RawSignicatSigningSession,
} from './transform/envelope'
import {
  transformSigner,
  type RawSignicatSigningSetup,
} from './transform/signer'
import {
  transformDocument,
  type RawSignicatDocumentRef,
} from './transform/document'

export interface SignicatAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri?: string
  scopes?: string[]
}

const CREDENTIAL_FORM = oauth2ClientCredentials({
  tokenUrl: OAUTH_TOKEN_URL,
  scopes: DEFAULT_SCOPES,
})

export class SignicatAdapter implements DocsignAdapter {
  readonly platform = 'signicat'
  readonly version = '0.1.0'

  // oauth2_cc: collect Client ID + Client Secret via the hosted Connect form.
  credentialFields = CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  private clientId: string
  private clientSecret: string
  private scopes: string[]

  constructor(config: SignicatAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  // No end-user OAuth redirect — Signicat is server-to-server. The auth URL
  // is a no-op; operators supply client credentials directly.
  getAuthUrl(state: string): string {
    return `https://api.signicat.com?state=${encodeURIComponent(state)}`
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return signicatExchange(this.clientId, this.clientSecret, this.scopes)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return signicatRefresh(credentials, this.clientId, this.clientSecret, this.scopes)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifySignicatWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseSignicatWebhookEvents(payload)
  }

  private client(credentials: Credentials): SignicatClient {
    return new SignicatClient(credentials)
  }

  // ── Envelopes (signing sessions) ──────────────────────────────────────────
  // Signicat has no list/search endpoint for signing sessions, so
  // listEnvelopes is intentionally omitted (auto-501).

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const raw = await this.client(credentials).get<RawSignicatSigningSession>(
      `/signing-sessions/${id}`,
    )
    return transformEnvelope(raw)
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Envelope> {
    // Signicat cancels a session by deleting it; fetch the final state first
    // because the deleted resource is no longer addressable afterwards.
    const before = await this.getEnvelope(credentials, id)
    await this.client(credentials).delete(`/signing-sessions/${id}`)
    return { ...before, status: 'voided', voidedAt: new Date().toISOString() }
  }

  // ── Signers (synthesised from signingSetup[]) ─────────────────────────────

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    // GET /signing-sessions/{sessionId} takes only the path id and embeds the
    // whole signingSetup[] (maxItems 1 in the Sign API v2 spec), so the list
    // is the whole collection and is paged locally.
    const session = await this.client(credentials).get<RawSignicatSigningSession>(
      `/signing-sessions/${envelopeId}`,
    )
    const setups = (session.signingSetup ?? []) as RawSignicatSigningSetup[]
    return pageLocally(
      setups.map((setup, i) => transformSigner(setup, session, i)),
      params,
    )
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    const [envelopeId, indexStr] = id.split(':')
    if (!envelopeId || indexStr === undefined) {
      throw new Error('getSigner expects an id of shape "<sessionId>:<index>"')
    }
    const all = await this.listSigners(credentials, envelopeId, {})
    const found = all[Number(indexStr)]
    if (!found) throw new Error(`Signer ${id} not found`)
    return found
  }

  // ── Documents (metadata only — content REFUSED) ───────────────────────────

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    // GET /signing-sessions/{sessionId} embeds every session document
    // (maxItems 100 in the Sign API v2 spec) and documents no paging
    // parameters, so the list is the whole collection and is paged locally.
    const session = await this.client(credentials).get<RawSignicatSigningSession>(
      `/signing-sessions/${envelopeId}`,
    )
    const docs = (session.documents ?? []) as RawSignicatDocumentRef[]
    return pageLocally(
      docs.map((raw, i) => transformDocument(raw, envelopeId, i)),
      params,
    )
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const [envelopeId, documentId] = id.split(':')
    if (!envelopeId || !documentId) {
      throw new Error('getDocument expects an id of shape "<sessionId>:<documentId>"')
    }
    const all = await this.listDocuments(credentials, envelopeId, {})
    const found = all.find((d) => d.externalId === documentId)
    if (!found) throw new Error(`Document ${documentId} not found on session ${envelopeId}`)
    return found
  }
}
