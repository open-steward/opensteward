/**
 * Evrotrust adapter (vendor REST API).
 *
 * Evrotrust is a Bulgarian eIDAS-qualified trust service provider (QTSP).
 * Its vendor REST API drives remote qualified-electronic-signature (QES)
 * flows: documents are sent to identified users who sign them in the
 * Evrotrust mobile app. The vendor then polls status or receives a callback.
 *
 * Canonical mapping (read surface only):
 *   - Envelope  ← a signing *thread* (`threadID`); status via
 *                 `POST /document/group/status`, void via
 *                 `POST /document/withdraw`.
 *   - Document  ← a single *transaction* (`transactionID`) within a thread;
 *                 status via `POST /document/status` (metadata only — content
 *                 download is refused).
 *
 * The vendor API exposes no list endpoint and no readable audit / template
 * resources, so `listEnvelopes`, `listSigners`, `listDocuments`, audit-trail
 * and template methods are intentionally not implemented — the router returns
 * 501 for them.
 *
 * `getSigner` IS implemented: a `transactionID` is the identifier for exactly
 * one signer's signing operation; its status is readable via
 * `POST /document/status`. Signer identity (e-mail, name) is not returned by
 * the status API.
 *
 * Auth: a static vendor API key + vendor number signing every request
 * (HMAC-SHA256), collected via the Connect Link form. There is no
 * interactive OAuth flow, so `getAuthUrl`/`exchangeCode` throw.
 *
 * Docs: https://docs.evrotrust.com/
 */
// ── Resource coverage ──────────────────────────────────────────────────────────
// Unavailable: audit-trail-entry — no audit trail or event-history endpoint in
//              the Evrotrust vendor REST API; audit evidence is stored in the
//              Evrotrust immutable archive and is not exposed to vendors.
// Unavailable: template — no template management endpoint; documents are
//              submitted directly per transaction with no reusable template concept.
// ──────────────────────────────────────────────────────────────────────────────
import type { Credentials, CredentialField } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { WebhookEvent } from '../../schema/webhook'

import {
  EVROTRUST_CREDENTIAL_FIELDS,
  exchangeEvrotrustCredentials,
  refreshEvrotrustCredentials,
} from './auth'
import { EvrotrustClient } from './client'
import { verifyEvrotrustWebhook, parseEvrotrustWebhookEvents } from './webhook'

import {
  transformEnvelope,
  type RawEvrotrustThreadStatus,
} from './transform/envelope'
import {
  transformDocument,
  type RawEvrotrustDocumentStatus,
} from './transform/document'
import {
  transformSigner,
  type RawEvrotrustSignerStatus,
} from './transform/signer'

export class EvrotrustAdapter implements DocsignAdapter {
  readonly platform = 'evrotrust'
  readonly version = '0.1.0'

  constructor() {
    // No config needed: auth is static vendor API key + vendor number,
    // collected via credentialFields() — there is no OAuth flow.
  }

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    throw new Error(
      'evrotrust uses static vendor API key auth; use credentialFields() instead',
    )
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error(
      'evrotrust uses static vendor API key auth; use exchangeCredentials() instead',
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshEvrotrustCredentials(credentials)
  }

  credentialFields(): CredentialField[] {
    return EVROTRUST_CREDENTIAL_FIELDS
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return exchangeEvrotrustCredentials(fields)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyEvrotrustWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseEvrotrustWebhookEvents(payload)
  }

  private client(credentials: Credentials): EvrotrustClient {
    return new EvrotrustClient(credentials)
  }

  // ── Envelopes (signing threads) ───────────────────────────────────────────

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const raw = await this.client(credentials).post<RawEvrotrustThreadStatus>(
      '/document/group/status',
      { transactionID: id },
    )
    return transformEnvelope(raw, id)
  }

  async voidEnvelope(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Envelope> {
    await this.client(credentials).post('/document/withdraw', { threadID: id })
    return this.getEnvelope(credentials, id)
  }

  // ── Documents (single transactions, metadata only — content REFUSED) ──────

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const raw = await this.client(credentials).post<RawEvrotrustDocumentStatus>(
      '/document/status',
      { transactionID: id },
    )
    const envelopeId = raw.threadID ? String(raw.threadID) : id
    return transformDocument(raw, envelopeId, 0)
  }

  // ── Signers ───────────────────────────────────────────────────────────────
  // Evrotrust is 1-signer-per-transaction: the transactionID is the signer ID.
  // listSigners is not implemented (no list endpoint). getSigner resolves the
  // signer outcome via /document/status. Signer identity (e-mail, name) is not
  // returned by the status API — only the signing result is readable.

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    const raw = await this.client(credentials).post<RawEvrotrustSignerStatus>(
      '/document/status',
      { transactionID: id },
    )
    const envelopeId = raw.threadID ? String(raw.threadID) : id
    return transformSigner(raw, envelopeId)
  }
}
