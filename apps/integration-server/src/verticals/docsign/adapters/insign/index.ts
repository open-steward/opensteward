/**
 * inSign adapter (is2 GmbH REST API).
 *
 * inSign is an EU-hosted, eIDAS-compliant e-signature platform built around
 * the *session* ("Vorgang"): a session bundles documents, signature fields,
 * and the external recipients invited to sign. This adapter maps:
 *   session (`/get/status` + `/get/checkstatus`)        → Envelope
 *   external recipients (`/extern/users` + externInfos)  → Signer
 *   session documents (`/get/documents/full`)            → Document
 *
 * inSign has no account-wide session list, no template concept, and exposes
 * the audit trail only as a downloadable PDF — so `listEnvelopes`,
 * `listTemplates`/`getTemplate`, and the audit-trail methods are intentionally
 * left unimplemented and auto-resolve to 501 Not Implemented. inSign delivers
 * status callbacks to a customer-configured URL with no documented signature
 * scheme, so no webhook verification is wired.
 *
 * ── Resource coverage ──────────────────────────────────────────────────────
 * Unavailable: audit-trail-entry — /get/audit/download returns a binary PDF;
 *              no endpoint surfaces structured, machine-parseable event records.
 * Unverified:  template — product UI offers templates but no list/get endpoints
 *              appear in the public Postman collection or getting-started guide;
 *              the live OpenAPI spec requires sandbox interaction to inspect.
 *
 * Auth: per-instance HTTP Basic credentials (no interactive OAuth), collected
 * through the Connect Link credential form. `getAuthUrl()` therefore throws.
 */
import { pageLocally } from '@opensteward/shared'
import type { Credentials, CredentialField, QueryParams } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'

import {
  INSIGN_CREDENTIAL_FIELDS,
  exchangeInsignCredentials,
  refreshInsignCredentials,
} from './auth'
import { InsignClient } from './client'
import { DEFAULT_SCOPES } from './constants'

import { transformEnvelope, type RawInsignSession } from './transform/envelope'
import {
  transformSigner,
  type RawInsignExternUser,
  type RawInsignSignatureField,
} from './transform/signer'
import { transformDocument, type RawInsignDocument } from './transform/document'

export interface InsignAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

interface ExternUsersResponse {
  externUsers?: RawInsignExternUser[]
}

interface ExternInfosResponse {
  externInfos?: RawInsignExternUser[]
}

interface DocumentsFullResponse {
  documents?: RawInsignDocument[]
}

export class InsignAdapter implements DocsignAdapter {
  readonly platform = 'insign'
  readonly version = '0.1.0'

  private _clientId: string
  private _clientSecret: string
  private _redirectUri: string
  private _scopes: string[]

  constructor(config: InsignAdapterConfig) {
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
      'insign uses per-instance Basic credentials; use credentialFields() instead',
    )
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error(
      'insign uses per-instance Basic credentials; use exchangeCredentials() instead',
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshInsignCredentials(credentials)
  }

  credentialFields(): CredentialField[] {
    return INSIGN_CREDENTIAL_FIELDS
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return exchangeInsignCredentials(fields)
  }

  private client(credentials: Credentials): InsignClient {
    return new InsignClient(credentials)
  }

  /** Fetch the rich session view (`/get/status`) merged with the lifecycle
   *  view (`/get/checkstatus`). Both key off the session id in the body. */
  private async fetchSession(
    credentials: Credentials,
    sessionId: string,
  ): Promise<RawInsignSession> {
    const client = this.client(credentials)
    const body = { sessionid: sessionId }
    const [status, check] = await Promise.all([
      client.post<RawInsignSession>('/get/status', body, { withImages: false }),
      client.post<RawInsignSession>('/get/checkstatus', body),
    ])
    return { ...status, ...stripNulls(check) }
  }

  // ── Envelopes (sessions) ───────────────────────────────────────────────────
  // inSign has no list-sessions endpoint, so `listEnvelopes` is unimplemented.

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const raw = await this.fetchSession(credentials, id)
    return transformEnvelope(raw, id)
  }

  // ── Signers (external recipients) ───────────────────────────────────────────

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    return pageLocally(await this.allSigners(credentials, envelopeId), params)
  }

  /** /extern/users, /get/externInfos and /get/status take only a
   *  `{ sessionid }` body (no page/limit parameter), so this is the whole roster. */
  private async allSigners(credentials: Credentials, envelopeId: string): Promise<Signer[]> {
    const client = this.client(credentials)
    const body = { sessionid: envelopeId }
    const [users, infos, status] = await Promise.all([
      client.post<ExternUsersResponse>('/extern/users', body),
      client.post<ExternInfosResponse>('/get/externInfos', body),
      client.post<RawInsignSession>('/get/status', body, { withImages: false }),
    ])
    const fields: RawInsignSignatureField[] = status.signaturFieldsStatusList ?? []
    const roster = users.externUsers ?? []
    const infoByEmail = new Map<string, RawInsignExternUser>()
    for (const info of infos.externInfos ?? []) {
      const key = (info.externUser ?? '').toLowerCase()
      if (key) infoByEmail.set(key, info)
    }
    return roster.map((user, i) => {
      const merged: RawInsignExternUser = {
        ...user,
        ...infoByEmail.get((user.externUser ?? '').toLowerCase()),
      }
      return transformSigner(merged, fields, envelopeId, i)
    })
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    const sep = id.indexOf(':')
    const [envelopeId, signerId] = sep >= 0 ? [id.slice(0, sep), id.slice(sep + 1)] : [id, id]
    if (!envelopeId || !signerId) {
      throw new Error('insign getSigner expects an id of shape "<sessionId>:<email>"')
    }
    const all = await this.allSigners(credentials, envelopeId)
    const found = all.find((s) => s.externalId === signerId)
    if (!found) throw new Error(`Signer ${signerId} not found on session ${envelopeId}`)
    return found
  }

  // ── Documents (metadata only — content REFUSED) ────────────────────────────

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    return pageLocally(await this.allDocuments(credentials, envelopeId), params)
  }

  /** /get/documents/full takes only a `{ sessionid }` body (no page/limit
   *  parameter), so this is every document on the session. */
  private async allDocuments(credentials: Credentials, envelopeId: string): Promise<Document[]> {
    const res = await this.client(credentials).post<DocumentsFullResponse>(
      '/get/documents/full',
      { sessionid: envelopeId },
    )
    return (res.documents ?? []).map((d, i) => transformDocument(d, envelopeId, i))
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const sep = id.indexOf(':')
    const [envelopeId, documentId] = sep >= 0 ? [id.slice(0, sep), id.slice(sep + 1)] : [id, id]
    if (!envelopeId || !documentId) {
      throw new Error('insign getDocument expects an id of shape "<sessionId>:<docid>"')
    }
    const all = await this.allDocuments(credentials, envelopeId)
    const found = all.find((d) => d.externalId === documentId)
    if (!found) throw new Error(`Document ${documentId} not found on session ${envelopeId}`)
    return found
  }
}

/** Drop null/undefined fields so the lifecycle view can be spread over the
 *  rich view without clobbering populated fields with `/get/checkstatus` nulls. */
function stripNulls(obj: RawInsignSession): Partial<RawInsignSession> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v !== null && v !== undefined) out[k] = v
  }
  return out as Partial<RawInsignSession>
}
