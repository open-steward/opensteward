export type { Credentials, QueryParams } from '@opensteward/shared'
import type { Credentials, QueryParams, BaseAdapter } from '@opensteward/shared'

import type { Envelope } from '../schema/envelope'
import type { Signer } from '../schema/signer'
import type { Document } from '../schema/document'
import type { AuditTrailEntry } from '../schema/audit-trail-entry'
import type { Template } from '../schema/template'
import type { WebhookEvent } from '../schema/webhook'

/**
 * DocsignAdapter — extends BaseAdapter with read-only document-signing
 * resource methods. Every resource method is optional. Adapters implement
 * whatever the platform supports; the router returns 501 Not Implemented
 * for the rest.
 *
 * The schema is the firewall: the canonical Document has no `content`
 * field, so a misconfigured adapter cannot leak signed-document content
 * even if it tried. Adapters MUST refuse signature-image and KYC-attachment
 * reads at the wire level too.
 */
export interface DocsignAdapter extends BaseAdapter {
  // Webhooks (refined return type)
  parseWebhookEvents?(payload: Record<string, unknown>): WebhookEvent[]

  // ── Envelopes ─────────────────────────────────────────────────────────────
  listEnvelopes?(credentials: Credentials, params: QueryParams): Promise<Envelope[]>
  getEnvelope?(credentials: Credentials, id: string): Promise<Envelope>
  voidEnvelope?(credentials: Credentials, id: string, data?: { reason?: string }): Promise<Envelope>

  // ── Signers ───────────────────────────────────────────────────────────────
  listSigners?(credentials: Credentials, envelopeId: string, params: QueryParams): Promise<Signer[]>
  getSigner?(credentials: Credentials, id: string): Promise<Signer>

  // ── Documents (metadata only — no content) ────────────────────────────────
  listDocuments?(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Document[]>
  getDocument?(credentials: Credentials, id: string): Promise<Document>

  // ── Audit-trail entries ───────────────────────────────────────────────────
  listAuditTrailEntries?(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<AuditTrailEntry[]>
  getAuditTrailEntry?(credentials: Credentials, id: string): Promise<AuditTrailEntry>

  // ── Templates ─────────────────────────────────────────────────────────────
  listTemplates?(credentials: Credentials, params: QueryParams): Promise<Template[]>
  getTemplate?(credentials: Credentials, id: string): Promise<Template>
}
