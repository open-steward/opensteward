/**
 * Yoti Sign (eSignatures) adapter.
 *
 * Maps the Yoti Sign envelope (`GET /v2/envelopes/<id>`) → canonical
 * `Envelope` and its `details.recipients[]` → `Signer`. Void maps to Yoti's
 * "archive" operation (`PATCH /v2/envelopes/<id>`), which cancels an envelope
 * that has not yet been fully signed.
 *
 * Auth: static API key sent as `Authorization: Bearer <API_KEY>`. No
 * interactive OAuth flow — credentials are collected via the Connect Link
 * `credentialFields()` form, so `getAuthUrl()` / `exchangeCode()` throw.
 *
 * Surfaces intentionally NOT implemented (auto-501 at the router):
 *   - listEnvelopes: Yoti has no general list endpoint; the only lookup
 *     (`POST /v2/organisations/envelopes/find`) requires an explicit id list.
 *   - listDocuments / getDocument: the only document endpoint
 *     (`/v2/envelopes/<id>/completed-documents`) streams a ZIP of *signed
 *     document content*, which the canonical Document schema forbids — so the
 *     adapter never exposes it.
 *   - audit-trail entries + templates: no documented API surface.
 *   - webhooks: Yoti notifications are configured per-envelope at creation
 *     time as plain outbound POSTs with no documented signature scheme, so no
 *     verify/parse handlers are provided.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Available:   envelope — GET /v2/envelopes/<id> + PATCH /v2/envelopes/<id>
 * Available:   signer   — derived from envelope.details.recipients
 * Unavailable: document — /v2/envelopes/<id>/completed-documents returns a
 *              ZIP binary; no JSON metadata endpoint exists
 * Unavailable: audit-trail-entry — no documented REST endpoint; portal-only
 * Unavailable: template — no documented REST API; portal import/export only
 *
 * Docs: https://developers.yoti.com/eSignatures/integration-guide
 */
import { pageLocally } from '@opensteward/shared'
import type { Credentials, CredentialField, QueryParams } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'

import {
  YOTI_SIGN_CREDENTIAL_FIELDS,
  exchangeYotiSignCredentials,
  refreshYotiSignCredentials,
} from './auth'
import { YotiSignClient } from './client'
import { transformEnvelope, type RawYotiSignEnvelope } from './transform/envelope'
import { transformSigner } from './transform/signer'

export interface YotiSignAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

export class YotiSignAdapter implements DocsignAdapter {
  readonly platform = 'yoti-sign'
  readonly version = '0.1.0'

  private _clientId: string
  private _clientSecret: string
  private _redirectUri: string
  private _scopes: string[]

  constructor(config: YotiSignAdapterConfig) {
    this._clientId = config.clientId
    this._clientSecret = config.clientSecret
    this._redirectUri = config.redirectUri
    this._scopes = config.scopes ?? []
    void this._clientId
    void this._clientSecret
    void this._redirectUri
    void this._scopes
  }

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    throw new Error(
      'yoti-sign uses static API key auth; use credentialFields() instead',
    )
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error(
      'yoti-sign uses static API key auth; use exchangeCredentials() instead',
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshYotiSignCredentials(credentials)
  }

  credentialFields(): CredentialField[] {
    return YOTI_SIGN_CREDENTIAL_FIELDS
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return exchangeYotiSignCredentials(fields)
  }

  private client(credentials: Credentials): YotiSignClient {
    return new YotiSignClient(credentials)
  }

  // ── Envelopes ─────────────────────────────────────────────────────────────

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const raw = await this.client(credentials).get<RawYotiSignEnvelope>(
      `/envelopes/${id}`,
    )
    return transformEnvelope(raw)
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Envelope> {
    // Yoti "archive" — PATCH the envelope; cancels it if not yet fully signed.
    await this.client(credentials).patch(`/envelopes/${id}`)
    return this.getEnvelope(credentials, id)
  }

  // ── Signers (envelope recipients) ──────────────────────────────────────────

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    // GET /v2/envelopes/<id> documents no query parameters and returns the
    // whole `details.recipients` array, so the caller's page is cut locally.
    // https://developers.yoti.com/eSignatures/get-envelope
    const raw = await this.client(credentials).get<RawYotiSignEnvelope>(
      `/envelopes/${envelopeId}`,
    )
    const all = (raw.details?.recipients ?? []).map((r) => transformSigner(r, envelopeId))
    return pageLocally(all, params)
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    const [envelopeId, recipientId] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId || !recipientId) {
      throw new Error('yoti-sign getSigner expects an id of shape "<envelopeId>:<recipientId>"')
    }
    const all = await this.listSigners(credentials, envelopeId, {})
    const found = all.find((s) => s.externalId === recipientId)
    if (!found) throw new Error(`Signer ${recipientId} not found on envelope ${envelopeId}`)
    return found
  }
}
