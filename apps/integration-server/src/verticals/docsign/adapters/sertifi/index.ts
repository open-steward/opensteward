/**
 * Sertifi adapter.
 *
 * Maps Sertifi *folders* → canonical `Envelope`, folder `participants` →
 * `Signer`, and folder `documents` → `Document` (metadata only). Sertifi
 * authenticates with a portal API code (apiKey scheme via the
 * `sertifi-api-code` header), wired through the Connect Link
 * single-API-key form.
 *
 * Resources Sertifi does NOT expose as JSON — and therefore left
 * unimplemented (router auto-returns 501):
 *   • listEnvelopes — Sertifi has no top-level folder collection endpoint.
 *   • voidEnvelope — folders are hard-deleted, not voided-with-reason.
 *   • audit-trail entries — the folder "summary" endpoint returns a
 *     rendered PDF, not a structured activity feed.
 *   • templates — Sertifi has a document *library*, not a Template resource
 *     shaped like the canonical schema.
 *   • webhooks — Sertifi pushes via URL RedirectActions, not signed
 *     webhook callbacks, so verify/parse are not implemented.
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: audit-trail-entry — GET /v1.1/{folderId}/summary returns a rendered PDF certificate, not a structured JSON activity feed; no per-event audit trail endpoint exists.
// Unavailable: template — Sertifi exposes no REST endpoint to list or retrieve document-library items as templates; libraryId is only accepted as an input when creating a folder document.

import { pageLocally, simpleApiKey } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'

import { buildAuthUrl, refreshCredentials as sertifiRefresh } from './auth'
import { SertifiClient } from './client'
import { API_CODE_HELP_URL } from './constants'

import { transformEnvelope, type RawSertifiFolder } from './transform/envelope'
import { transformSigner } from './transform/signer'
import { transformDocument } from './transform/document'

export interface SertifiAdapterConfig {
  clientId?: string
  clientSecret?: string
  redirectUri?: string
  scopes?: string[]
}

const SERTIFI_API_KEY_FORM = simpleApiKey({
  label: 'Sertifi API code',
  helpText: `Find your portal API code under Administration → Account Settings. ${API_CODE_HELP_URL}`,
})

export class SertifiAdapter implements DocsignAdapter {
  readonly platform = 'sertifi'
  readonly version = '0.1.0'

  // Connect Link support — Sertifi uses a single API-code form (apiKey auth).
  credentialFields = SERTIFI_API_KEY_FORM.credentialFields
  exchangeCredentials = SERTIFI_API_KEY_FORM.exchangeCredentials

  constructor(_config: SertifiAdapterConfig = {}) {}

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  // No OAuth code exchange — credentials arrive via exchangeCredentials.
  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return { accessToken: code.trim() }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return sertifiRefresh(credentials)
  }

  private client(credentials: Credentials): SertifiClient {
    return new SertifiClient(credentials)
  }

  private async fetchFolder(credentials: Credentials, folderId: string): Promise<RawSertifiFolder> {
    return this.client(credentials).get<RawSertifiFolder>(`/folders/${folderId}`)
  }

  // ── Envelopes (folders) ─────────────────────────────────────────────────

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const raw = await this.fetchFolder(credentials, id)
    return transformEnvelope(raw)
  }

  // ── Signers (folder participants) ─────────────────────────────────────────

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    // GetFolder takes no paging params and returns every participant inline.
    const folder = await this.fetchFolder(credentials, envelopeId)
    return pageLocally(
      (folder.participants ?? []).map((p) => transformSigner(p, envelopeId)),
      params,
    )
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    const [envelopeId, participantId] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId || !participantId) {
      throw new Error('getSigner expects an id of shape "<folderId>:<participantId>"')
    }
    const all = await this.listSigners(credentials, envelopeId, {})
    const found = all.find((s) => s.externalId === participantId)
    if (!found) throw new Error(`Participant ${participantId} not found on folder ${envelopeId}`)
    return found
  }

  // ── Documents (metadata only — content REFUSED) ──────────────────────────

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]> {
    // GetFolder takes no paging params and returns every document inline.
    const folder = await this.fetchFolder(credentials, envelopeId)
    return pageLocally(
      (folder.documents ?? []).map((d, i) => transformDocument(d, envelopeId, i)),
      params,
    )
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const [envelopeId, documentId] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId || !documentId) {
      throw new Error('getDocument expects an id of shape "<folderId>:<documentId>"')
    }
    const all = await this.listDocuments(credentials, envelopeId, {})
    const found = all.find((d) => d.externalId === documentId)
    if (!found) throw new Error(`Document ${documentId} not found on folder ${envelopeId}`)
    return found
  }
}
