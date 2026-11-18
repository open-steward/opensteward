/**
 * Tilaka Sign+ adapter.
 *
 * Maps a Tilaka *signing request* (keyed by `request_id`, read via
 * `/plus-checksignstatus`) → canonical `Envelope`: the request carries its
 * title, initiator, workflow status, signers (`signatures[]` / `tilaka_name`)
 * and documents (`list_pdf[]`) inline, so signers → `Signer` and the
 * attached PDFs → `Document` (metadata only — content is REFUSED).
 *
 * Tilaka's managed signing API is request-scoped: status is read per
 * `request_id` and there is no documented "list all requests" endpoint, so
 * `listEnvelopes` is intentionally omitted (the router returns 501). Tilaka
 * exposes no template resource, no separate audit-trail endpoint, and no
 * documented cancel/void endpoint on the managed signing API, so
 * `listTemplates`/`getTemplate`, the audit-trail methods, and `voidEnvelope`
 * are omitted too. Tilaka delivers status changes via a registered callback
 * URL, but those callbacks are not cryptographically signed (delivery is
 * gated by the registered URL + Bearer), so no `verifyWebhook` /
 * `parseWebhookEvents` is wired here.
 *
 * Auth is a client-credentials grant (client id + secret, exchanged for a
 * Bearer token) collected via the Connect Link credential form; there is no
 * OAuth Authorization-Code flow, so `getAuthUrl`/`exchangeCode` throw.
 *
 * Product: https://tilaka.id/features/
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: audit-trail-entry — Tilaka Sign+ has no dedicated audit-trail endpoint; the managed API surface is limited to /plus-upload, /plus-requestsign, /plus-executesign, and /plus-checksignstatus
// Unavailable: template — Tilaka Sign+ exposes no template resource on its managed signing API

import type { Credentials, QueryParams, CredentialField } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'

import { FORM, refreshCredentials as tilakaRefresh } from './auth'
import { TilakaClient } from './client'
import { CHECK_SIGN_STATUS_PATH } from './constants'

import {
  transformEnvelope,
  type RawTilakaSigningRequest,
} from './transform/envelope'
import { transformSigner } from './transform/signer'
import { transformDocument } from './transform/document'

export interface TilakaAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

/** `/plus-checksignstatus` wraps the request detail in `{ success, message, data }`. */
interface CheckSignStatusResponse {
  success?: boolean
  message?: string
  data?: RawTilakaSigningRequest
}

export class TilakaAdapter implements DocsignAdapter {
  readonly platform = 'tilaka'
  readonly version = '0.1.0'

   
  private clientId: string
   
  private clientSecret: string
   
  private redirectUri: string
   
  private scopes: string[]

  constructor(config: TilakaAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? []
  }

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    throw new Error('tilaka uses client-credentials auth; use credentialFields() instead')
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('tilaka uses client-credentials auth; use exchangeCredentials() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return tilakaRefresh(credentials)
  }

  credentialFields(): CredentialField[] {
    return FORM.credentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return FORM.exchangeCredentials(fields)
  }

  private client(credentials: Credentials): TilakaClient {
    return new TilakaClient(credentials)
  }

  /** Read the full signing-request detail by `request_id`. */
  private async signingRequest(
    credentials: Credentials,
    requestId: string,
  ): Promise<RawTilakaSigningRequest> {
    const res = await this.client(credentials).post<CheckSignStatusResponse>(
      CHECK_SIGN_STATUS_PATH,
      { request_id: requestId },
    )
    const detail = res.data
    if (!detail) {
      // Tilaka echoes only the coarse status at the top level on some
      // payloads; fall back to a minimal request shape so callers still get
      // the request id + status rather than a thrown error.
      return { request_id: requestId, status: res.message, message: res.message }
    }
    return { ...detail, request_id: detail.request_id ?? requestId, message: res.message }
  }

  private signers(raw: RawTilakaSigningRequest) {
    return raw.signatures ?? raw.signature ?? []
  }

  // ── Envelopes (Tilaka signing requests) ───────────────────────────────────

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const raw = await this.signingRequest(credentials, id)
    return transformEnvelope(raw)
  }

  // ── Signers (signatures on a request) ──────────────────────────────────────

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    _params: QueryParams,
  ): Promise<Signer[]> {
    const raw = await this.signingRequest(credentials, envelopeId)
    return this.signers(raw).map((s) => transformSigner(s, envelopeId))
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    const [envelopeId, signerId] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId || !signerId) {
      throw new Error('tilaka getSigner expects an id of shape "<requestId>:<tilakaName>"')
    }
    const all = await this.listSigners(credentials, envelopeId, {})
    const found = all.find((s) => s.externalId === signerId)
    if (!found) throw new Error(`Signer ${signerId} not found on request ${envelopeId}`)
    return found
  }

  // ── Documents (list_pdf, metadata only — content REFUSED) ──────────────────

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    _params: QueryParams,
  ): Promise<Document[]> {
    const raw = await this.signingRequest(credentials, envelopeId)
    return (raw.list_pdf ?? []).map((pdf, i) => transformDocument(pdf, envelopeId, i))
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const [envelopeId, documentId] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId || !documentId) {
      throw new Error('tilaka getDocument expects an id of shape "<requestId>:<filename>"')
    }
    const all = await this.listDocuments(credentials, envelopeId, {})
    const found = all.find((d) => d.externalId === documentId)
    if (!found) throw new Error(`Document ${documentId} not found on request ${envelopeId}`)
    return found
  }
}
