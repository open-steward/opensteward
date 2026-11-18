/**
 * GMO Sign adapter.
 *
 * GMO Sign (GMO GlobalSign Holdings) exposes an "agree-api" REST surface
 * keyed by `envelope_xid`. A single `/envelope/status` call returns the
 * envelope plus its embedded `document_list` and `signer_list`, so this
 * adapter maps that one response to the canonical `Envelope`, its
 * `signer_list` → `Signer`, and its `document_list` → `Document` (metadata
 * only — document content is REFUSED at the schema level).
 *
 * GMO Sign has no read endpoints for listing all envelopes, audit-trail
 * entries, or templates, and no documented void/cancel endpoint, so those
 * resource methods are intentionally omitted — the router returns 501 for
 * them. Webhook deliveries ("Connect" status-change hooks) carry no
 * documented signature scheme, so no webhook verification is wired.
 *
 * ── Resource coverage ──────────────────────────────────────────────────────
 * Available:   document, envelope, signer
 * Unavailable: audit-trail-entry — GMO Sign exposes no read endpoint for
 *              audit-trail / event-history; /envelope/status returns no
 *              event log.
 * Unavailable: template — GMO Sign has no GET/list endpoint for templates;
 *              they are referenced by ID only when sending a new envelope.
 *
 * Auth is a static Customer ID + Secret Key (no OAuth) collected via the
 * Connect Link credential form; per-request access tokens are minted in the
 * client.
 *
 * Docs:
 *   https://helpcenter.gmosign.com/
 *   https://learn.microsoft.com/en-us/connectors/gmosign/
 */

import type { Credentials, QueryParams, CredentialField } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'

import { FORM } from './auth'
import { GmoSignClient } from './client'
import { ENVELOPE_STATUS_PATH } from './constants'

import { transformEnvelope, type RawGmoSignEnvelope } from './transform/envelope'
import { transformSigner } from './transform/signer'
import { transformDocument } from './transform/document'

export interface GmoSignAdapterConfig {
  clientId: string
  /** Treated as the secret key when supplied via instance config rather than the form. */
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

export class GmoSignAdapter implements DocsignAdapter {
  readonly platform = 'gmo-sign'
  readonly version = '0.1.0'

   
  private clientId: string
   
  private clientSecret: string
   
  private redirectUri: string
   
  private scopes: string[]

  constructor(config: GmoSignAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? []
  }

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    throw new Error('gmo-sign uses Customer ID + Secret Key auth; use credentialFields() instead')
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('gmo-sign uses Customer ID + Secret Key auth; use exchangeCredentials() instead')
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

  private client(credentials: Credentials): GmoSignClient {
    return new GmoSignClient(credentials)
  }

  /** Fetch the full envelope-status record (envelope + embedded signers + documents). */
  private async envelopeStatus(
    credentials: Credentials,
    envelopeXid: string,
  ): Promise<RawGmoSignEnvelope> {
    const raw = await this.client(credentials).call<RawGmoSignEnvelope>(ENVELOPE_STATUS_PATH, {
      envelope_xid: envelopeXid,
    })
    // The status response may omit envelope_xid (we queried by it); pin it so
    // the canonical id is always populated.
    return { ...raw, envelope_xid: raw.envelope_xid ?? envelopeXid }
  }

  // ── Envelopes ─────────────────────────────────────────────────────────────

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const raw = await this.envelopeStatus(credentials, id)
    return transformEnvelope(raw)
  }

  // ── Signers (signer_list embedded in the envelope status) ─────────────────

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    _params: QueryParams,
  ): Promise<Signer[]> {
    const raw = await this.envelopeStatus(credentials, envelopeId)
    return (raw.signer_list ?? []).map((s) => transformSigner(s, envelopeId))
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    const [envelopeId, signerId] = id.split(':')
    if (!envelopeId || !signerId) {
      throw new Error('GMO Sign getSigner expects an id of shape "<envelopeXid>:<envelopeSignerId>"')
    }
    const all = await this.listSigners(credentials, envelopeId, {})
    const found = all.find((s) => s.externalId === signerId)
    if (!found) throw new Error(`GMO Sign signer ${signerId} not found on envelope ${envelopeId}`)
    return found
  }

  // ── Documents (document_list, metadata only — content REFUSED) ────────────

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    _params: QueryParams,
  ): Promise<Document[]> {
    const raw = await this.envelopeStatus(credentials, envelopeId)
    return (raw.document_list ?? []).map((d, i) => transformDocument(d, envelopeId, i))
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const [envelopeId, documentId] = id.split(':')
    if (!envelopeId || !documentId) {
      throw new Error('GMO Sign getDocument expects an id of shape "<envelopeXid>:<controlNumber>"')
    }
    const all = await this.listDocuments(credentials, envelopeId, {})
    const found = all.find((d) => d.externalId === documentId)
    if (!found) throw new Error(`GMO Sign document ${documentId} not found on envelope ${envelopeId}`)
    return found
  }
}
