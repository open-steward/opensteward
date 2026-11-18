/**
 * Validated ID (VIDsigner) adapter — REST API v2.2.
 *
 * VIDsigner is the EU eIDAS e-signature product of Validated ID
 * (Barcelona). A signing job is a single document (`DocumentInfoDTO`)
 * with one or more signers, so we map:
 *   - the document  → canonical `Envelope` (`DocGUI` is the id)
 *   - `Signers[]`   → canonical `Signer`
 *   - the document  → a single canonical `Document` (metadata only)
 *
 * Endpoints used:
 *   - `GET /documentinfo/{docGUI}`   full status + signers (evidence info)
 *
 * `listEnvelopes` refuses with 501: the spec documents the
 * `documentlist/{id}` response only as `{ "type": "object" }`.
 *
 * VIDsigner exposes no template catalogue and no separate audit-trail
 * resource (the audit evidence is delivered as a signed report PDF, i.e.
 * document content, which the canonical schema refuses), so
 * `listTemplates`/`getTemplate` and the audit-trail methods are left
 * unimplemented and auto-501 at the router. Likewise `voidEnvelope`:
 * VIDsigner has no cancel endpoint in this API surface.
 *
 * Auth: HTTP Basic with a per-subscription user + password. No
 * interactive OAuth flow, so `getAuthUrl()` throws. Webhooks are a bare
 * per-document `NotificationURL` callback with no documented signature
 * scheme, so no webhook verification is implemented.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: audit-trail-entry — VIDsigner delivers audit evidence as a
 *   signed PDF report (not a queryable event stream); REST API v2.2 has no
 *   structured audit-trail endpoint.
 * Unavailable: template — VIDsigner REST API v2.2 exposes no template
 *   catalogue; template management exists only in the UI and is not surfaced
 *   via the documentinfo API surface.
 */
import type { Credentials, CredentialField, QueryParams } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'

import {
  VALIDATED_ID_CREDENTIAL_FIELDS,
  exchangeValidatedIdCredentials,
  refreshValidatedIdCredentials,
} from './auth'
import { ValidatedIdClient } from './client'

import {
  transformEnvelope,
  type RawValidatedIdDocumentInfo,
  type RawValidatedIdSignerInfo,
} from './transform/envelope'
import { transformSigner } from './transform/signer'
import { transformDocument } from './transform/document'

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

export interface ValidatedIdAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
}

export class ValidatedIdAdapter implements DocsignAdapter {
  readonly platform = 'validated-id'
  readonly version = '0.1.0'

  private _clientId: string
  private _clientSecret: string
  private _redirectUri: string

  constructor(config: ValidatedIdAdapterConfig) {
    this._clientId = config.clientId
    this._clientSecret = config.clientSecret
    this._redirectUri = config.redirectUri
    void this._clientId
    void this._clientSecret
    void this._redirectUri
  }

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    throw new Error(
      'validated-id uses HTTP Basic subscription auth; use credentialFields() instead',
    )
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error(
      'validated-id uses HTTP Basic subscription auth; use exchangeCredentials() instead',
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshValidatedIdCredentials(credentials)
  }

  credentialFields(): CredentialField[] {
    return VALIDATED_ID_CREDENTIAL_FIELDS
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return exchangeValidatedIdCredentials(fields)
  }

  private client(credentials: Credentials): ValidatedIdClient {
    return new ValidatedIdClient(credentials)
  }

  // ── Envelopes (documents) ─────────────────────────────────────────────────

  /**
   * Refused. The only documented listing is `GET /api/v{version}/documentlist/{id}`
   * ("Returns a list of documents by specific type"; types all, unsigned,
   * rejected, signed, signeddownloaded, signednotdownloaded) paged by
   * `paginationDTO.pageNumber` / `paginationDTO.pageSize`, but its 200 response
   * is documented only as `{ "type": "object" }`, with no items property, item
   * schema, total or page base. Reading it would mean inventing that shape.
   */
  async listEnvelopes(_credentials: Credentials, _params: QueryParams): Promise<Envelope[]> {
    throw notSupported(
      'VIDsigner cannot list documents: GET /api/v{version}/documentlist/{id} documents its 200 response only as { "type": "object" } (https://vidsignercloud.validatedid.com/3.0/swagger), with no property holding the documents, no item schema and no page base',
    )
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const raw = await this.client(credentials).get<RawValidatedIdDocumentInfo>(
      `/documentinfo/${id}`,
    )
    return transformEnvelope(raw)
  }

  // ── Signers ─────────────────────────────────────────────────────────────

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    _params: QueryParams,
  ): Promise<Signer[]> {
    const info = await this.client(credentials).get<RawValidatedIdDocumentInfo>(
      `/documentinfo/${envelopeId}`,
    )
    return (info.Signers ?? []).map((s: RawValidatedIdSignerInfo) => transformSigner(s, envelopeId))
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    const [envelopeId, signerId] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId || !signerId) {
      throw new Error('validated-id getSigner expects an id of shape "<docGUI>:<signerGUI>"')
    }
    const all = await this.listSigners(credentials, envelopeId, {})
    const found = all.find((s) => s.externalId === signerId)
    if (!found) throw new Error(`Signer ${signerId} not found on document ${envelopeId}`)
    return found
  }

  // ── Documents (metadata only — content REFUSED) ───────────────────────────

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    _params: QueryParams,
  ): Promise<Document[]> {
    const info = await this.client(credentials).get<RawValidatedIdDocumentInfo>(
      `/documentinfo/${envelopeId}`,
    )
    // VIDsigner signs a single document per job.
    return [transformDocument(info, envelopeId, 0)]
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const [envelopeId] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId) {
      throw new Error(
        'validated-id getDocument expects an id of shape "<docGUI>" or "<docGUI>:<docGUI>"',
      )
    }
    const docs = await this.listDocuments(credentials, envelopeId, {})
    const found = docs[0]
    if (!found) throw new Error(`Document ${id} not found`)
    return found
  }
}
