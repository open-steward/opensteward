/**
 * e-Signature.eu adapter (WordPress-hosted REST signature API).
 *
 * eIDAS electronic-signature provider (QES via itsme®/Evrotrust, AES via
 * Veriff, SES via OTP email). Maps a "signature request" → canonical
 * `Envelope`, its `signers` map → `Signer`, and its single attached PDF →
 * `Document`. The platform has no templates and no queryable audit-trail
 * endpoint, so those resources are left unimplemented (the router returns
 * 501). Webhook callbacks exist but carry no signature/HMAC for
 * verification, so no webhook handler is exposed.
 *
 * Auth: static `x-api-key` header + `userid` query parameter, both issued in
 * the dashboard. No interactive OAuth flow, so `getAuthUrl()` throws and
 * credentials are collected through the Connect Link form.
 */
// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: audit-trail-entry — no REST endpoint; audit trails are only downloadable as PDF from the dashboard
// Unavailable: template          — platform has no template management concept; only ad-hoc requests are supported
import type { Credentials, CredentialField, QueryParams } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'

import {
  ESIGNATURE_EU_CREDENTIAL_FIELDS,
  exchangeESignatureEuCredentials,
  refreshESignatureEuCredentials,
} from './auth'
import { ESignatureEuClient } from './client'
import { DEFAULT_SCOPES } from './constants'

import {
  transformEnvelope,
  transformListRow,
  type RawESignatureEuRequest,
  type RawESignatureEuListRow,
} from './transform/envelope'
import { transformSigner } from './transform/signer'
import { transformDocument } from './transform/document'

export interface ESignatureEuAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

export class ESignatureEuAdapter implements DocsignAdapter {
  readonly platform = 'e-signature-eu'
  readonly version = '0.1.0'

  private _clientId: string
  private _clientSecret: string
  private _redirectUri: string
  private _scopes: string[]

  constructor(config: ESignatureEuAdapterConfig) {
    this._clientId = config.clientId
    this._clientSecret = config.clientSecret
    this._redirectUri = config.redirectUri
    this._scopes = config.scopes ?? DEFAULT_SCOPES
    void this._clientId
    void this._clientSecret
    void this._redirectUri
    void this._scopes
  }

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    throw new Error(
      'e-signature-eu uses static API key auth; use credentialFields() instead',
    )
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error(
      'e-signature-eu uses static API key auth; use exchangeCredentials() instead',
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshESignatureEuCredentials(credentials)
  }

  credentialFields(): CredentialField[] {
    return ESIGNATURE_EU_CREDENTIAL_FIELDS
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return exchangeESignatureEuCredentials(fields)
  }

  private client(credentials: Credentials): ESignatureEuClient {
    return new ESignatureEuClient(credentials)
  }

  // ── Envelopes (signature requests) ─────────────────────────────────────────

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const query: Record<string, unknown> = {}
    // `/signature/list` filters by status_id (pending | skipped | finished);
    // omit the param to list everything.
    if (params['status']) query.status_id = String(params['status'])
    const rows = await this.client(credentials).get<RawESignatureEuListRow[]>(
      '/signature/list',
      query,
    )
    return (rows ?? []).map(transformListRow)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const raw = await this.client(credentials).get<RawESignatureEuRequest>(
      '/signature/getRequest',
      { id_sign: id },
    )
    return transformEnvelope(raw)
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Envelope> {
    const client = this.client(credentials)
    // The API splits termination into two routes: `cancel` only works while
    // nobody has signed; `skip` terminates a partially-signed request. Inspect
    // the current state to pick the right one.
    const before = await client.get<RawESignatureEuRequest>('/signature/getRequest', {
      id_sign: id,
    })
    const anySigned = Object.values(before.signers ?? {}).some(
      (s) => s?.status === 'signed',
    )
    if (anySigned) {
      await client.patch('/signature/skip', { id_sign: id })
    } else {
      await client.delete('/signature/cancel', { id_sign: id })
    }
    return this.getEnvelope(credentials, id)
  }

  // ── Signers (signatories) ───────────────────────────────────────────────────

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    _params: QueryParams,
  ): Promise<Signer[]> {
    const raw = await this.client(credentials).get<RawESignatureEuRequest>(
      '/signature/getRequest',
      { id_sign: envelopeId },
    )
    const signers = raw.signers ?? {}
    return Object.keys(signers)
      .sort((a, b) => Number(a) - Number(b))
      .map((pos) => transformSigner(signers[pos]!, envelopeId, pos))
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    const [envelopeId, position] = id.split(':')
    if (!envelopeId || !position) {
      throw new Error('e-signature-eu getSigner expects an id of shape "<id_sign>:<position>"')
    }
    const all = await this.listSigners(credentials, envelopeId, {})
    const found = all.find((s) => s.externalId === id)
    if (!found) throw new Error(`Signatory ${position} not found on request ${envelopeId}`)
    return found
  }

  // ── Documents (metadata only — content REFUSED) ──────────────────────────────

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    _params: QueryParams,
  ): Promise<Document[]> {
    const raw = await this.client(credentials).get<RawESignatureEuRequest>(
      '/signature/getRequest',
      { id_sign: envelopeId },
    )
    return [transformDocument(raw, envelopeId)]
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const [envelopeId] = id.split(':')
    if (!envelopeId) {
      throw new Error('e-signature-eu getDocument expects an id of shape "<id_sign>:doc"')
    }
    const raw = await this.client(credentials).get<RawESignatureEuRequest>(
      '/signature/getRequest',
      { id_sign: envelopeId },
    )
    return transformDocument(raw, envelopeId)
  }
}
