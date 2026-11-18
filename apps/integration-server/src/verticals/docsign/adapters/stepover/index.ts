/**
 * StepOver webSignatureOffice adapter.
 *
 * Maps the StepOver "Tyr" web service (XML-RPC) to the canonical docsign
 * schema. The Tyr API is deliberately narrow — a signature request is a
 * "document" addressed by integer id:
 *
 *   Envelope  ← tyrservice.getDocumentSignatureRequestStatus(sessionId, documentId)
 *   void      → tyrservice.deleteDocument(sessionId, documentId, username)
 *
 * The API exposes NO list endpoint, NO recipient/signer-read endpoint, NO
 * document-metadata endpoint (`retrieveXml` returns the signed PDF content,
 * which the docsign firewall forbids surfacing), NO audit-trail endpoint, and
 * NO template endpoint — so those resource methods are intentionally omitted
 * and the router returns 501 for them.
 *
 * Auth is a StepOver-issued login + password (exchanged for a session id) plus
 * a request-signing shared secret; there is no OAuth, so the OAuth methods
 * throw and the adapter uses the Connect Link credential form. Callbacks are
 * parsed but not signature-verified (StepOver documents no HMAC).
 */

import type { Credentials } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'

// ── Resource coverage ──────────────────────────────────────────────────────────
// Available:   envelope (get, void)
// Unavailable: audit-trail-entry — Tyr API has no audit-trail endpoint
// Unavailable: document          — Tyr API has no document-metadata endpoint (retrieveXml returns signed PDF content, refused by schema firewall)
// Unavailable: signer            — Tyr API has no recipient/signer-read endpoint
// Unavailable: template          — Tyr API has no template concept or endpoint

import { STEPOVER_CREDENTIAL_FORM } from './auth'
import { StepoverClient } from './client'
import { STATUS_FAILED } from './constants'
import { transformEnvelope } from './transform/envelope'

export interface StepoverAdapterConfig {
  clientId?: string
  clientSecret?: string
  redirectUri?: string
}

export class StepoverAdapter implements DocsignAdapter {
  readonly platform = 'stepover'
  readonly version = '0.1.0'

  // StepOver authenticates with a login/password + signing key — Connect Link
  // renders the credential form; the OAuth methods below are unsupported.
  credentialFields = STEPOVER_CREDENTIAL_FORM.credentialFields
  exchangeCredentials = STEPOVER_CREDENTIAL_FORM.exchangeCredentials

  constructor(_config: StepoverAdapterConfig = {}) {}

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    throw new Error('StepOver does not support OAuth. Use the API credential form.')
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('StepOver does not support OAuth. Use the API credential form.')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // The login/password + signing key are durable; the session id is fetched
    // on demand by the client. Nothing to refresh.
    return credentials
  }

  private client(credentials: Credentials): StepoverClient {
    return new StepoverClient(credentials)
  }

  // ── Envelopes (Tyr "documents") ────────────────────────────────────────────

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const documentId = Number(id)
    if (!Number.isFinite(documentId)) {
      throw new Error(`StepOver document id must be numeric, got "${id}"`)
    }
    const statusId = await this.client(credentials).callInt(
      'tyrservice.getDocumentSignatureRequestStatus',
      [documentId],
    )
    return transformEnvelope({ documentId, statusId })
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Envelope> {
    const documentId = Number(id)
    if (!Number.isFinite(documentId)) {
      throw new Error(`StepOver document id must be numeric, got "${id}"`)
    }
    const username = String(credentials.extra?.['username'] ?? credentials.accessToken ?? '')
    await this.client(credentials).callBool('tyrservice.deleteDocument', [documentId, username])
    // deleteDocument removes the request, so a follow-up status query would
    // fault — synthesise the terminal (voided/failed) envelope instead.
    return transformEnvelope({ documentId, statusId: STATUS_FAILED })
  }

  // No listEnvelopes / signers / documents / audit-trail / templates: the Tyr
  // web service exposes no read endpoints for them. They auto-501.
}
