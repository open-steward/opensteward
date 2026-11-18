/**
 * Certinal eSign adapter.
 *
 * Certinal authenticates with a per-tenant OAuth2 client_credentials grant:
 * the customer enters the API URL, Client ID and Secret of a Certinal Custom
 * Integration plus the API user email, the adapter mints a Bearer token on
 * that host (see ./auth) and re-mints it on refresh. The first-class
 * resource is the Transaction, which maps to the canonical
 * Envelope and nests its participants (signers), documents, and custom
 * fields. The audit trail has no dedicated endpoint, so it is synthesised
 * from the transaction + candidate action timestamps.
 *
 * Certinal addresses transactions individually by id and does not publish a
 * list-transactions, void-transaction, or read-template endpoint, so
 * `listEnvelopes`, `voidEnvelope`, and the template methods are intentionally
 * not implemented — the router returns 501 for those. No webhook signature
 * scheme is documented, so the webhook methods are omitted too.
 *
 * ── Resource coverage ──────────────────────────────────────────────────────
 * Unavailable: template — Certinal API exposes no list-template or
 *   get-template endpoint; the only template operation is "Create Transaction
 *   Using Template" (write-only, consumes a templateId). Confirmed via the
 *   full published API surface (Microsoft connector docs + Stoplight).
 *
 * Docs: https://certinal.stoplight.io/docs/api/72b66de24898e-introduction
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { AuditTrailEntry } from '../../schema/audit-trail-entry'

import { CertinalCredentialForm, refreshCertinalCredentials } from './auth'
import { CertinalClient, type CertinalResponse } from './client'

import {
  transformEnvelope,
  type RawCertinalTransaction,
  type RawCertinalCandidate,
} from './transform/envelope'
import { transformSigner } from './transform/signer'
import { transformDocument } from './transform/document'
import {
  transformAuditTrailEntry,
  type SyntheticAuditEvent,
} from './transform/audit-trail-entry'

export interface CertinalAdapterConfig {
  /** Optional default host; the customer supplies the real one on the Connect form. */
  baseUrl?: string
}

export class CertinalAdapter implements DocsignAdapter {
  readonly platform = 'certinal'
  readonly version = '0.1.0'

  // Per-tenant client credentials (API URL, Client ID, Secret, API user email)
  // entered on the Connect form and exchanged for a Bearer token. There is no
  // browser redirect, so the authorization-code methods below refuse.
  credentialFields = CertinalCredentialForm.credentialFields
  exchangeCredentials = CertinalCredentialForm.exchangeCredentials

  constructor(_config: CertinalAdapterConfig = {}) {
    // Client credentials are per-tenant (Connect form), not operator config.
  }

  // ── Auth (BaseAdapter requires these; Certinal has no authorization-code flow)

  getAuthUrl(): string {
    throw new Error(
      'Certinal has no browser OAuth redirect; connect via the client-credentials form (credentialFields).',
    )
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error(
      'Certinal has no authorization-code flow; use exchangeCredentials with the Custom Integration client credentials.',
    )
  }

  /** Re-mint the access token with the client credentials stored on `extra`. */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshCertinalCredentials(credentials)
  }

  private client(credentials: Credentials): CertinalClient {
    return new CertinalClient(credentials)
  }

  private async fetchTransaction(
    credentials: Credentials,
    transactionId: string,
  ): Promise<RawCertinalTransaction> {
    const res = await this.client(credentials).get<CertinalResponse<RawCertinalTransaction>>(
      `/transactions/${transactionId}`,
    )
    const data = res.data
    if (!data) throw new Error(`Certinal transaction ${transactionId} not found`)
    // Certinal omits transactionId inside `data` on some responses; backfill it.
    if (!data.transactionId) data.transactionId = transactionId
    return data
  }

  // ── Envelopes (Transactions) ───────────────────────────────────────────────

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const raw = await this.fetchTransaction(credentials, id)
    return transformEnvelope(raw)
  }

  // ── Signers (participants × candidates) ─────────────────────────────────────

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    _params: QueryParams,
  ): Promise<Signer[]> {
    const raw = await this.fetchTransaction(credentials, envelopeId)
    const out: Signer[] = []
    for (const participant of raw.participants ?? []) {
      for (const candidate of participant.candidates ?? []) {
        out.push(transformSigner(candidate, participant, envelopeId))
      }
    }
    return out
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    // id shape: "<envelopeId>:<participantId>:<candidateId>"
    const parts = id.split(':')
    if (parts.length < 2) {
      throw new Error('getSigner expects an id of shape "<envelopeId>:<participantId>:<candidateId>"')
    }
    const [envelopeId] = parts
    const signerId = parts.slice(1).join(':')
    const all = await this.listSigners(credentials, envelopeId, {})
    const found = all.find((s) => s.id === signerId)
    if (!found) throw new Error(`Signer ${signerId} not found on transaction ${envelopeId}`)
    return found
  }

  // ── Documents (metadata only — content REFUSED) ─────────────────────────────

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    _params: QueryParams,
  ): Promise<Document[]> {
    const raw = await this.fetchTransaction(credentials, envelopeId)
    return (raw.documents ?? []).map((d) => transformDocument(d, envelopeId))
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    // id shape: "<envelopeId>:<documentId>"
    const [envelopeId, documentId] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId || !documentId) {
      throw new Error('getDocument expects an id of shape "<envelopeId>:<documentId>"')
    }
    const all = await this.listDocuments(credentials, envelopeId, {})
    const found = all.find((d) => d.externalId === documentId)
    if (!found) throw new Error(`Document ${documentId} not found on transaction ${envelopeId}`)
    return found
  }

  // ── Audit-trail entries — synthesised from transaction + candidate actions ──

  async listAuditTrailEntries(
    credentials: Credentials,
    envelopeId: string,
    _params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    const raw = await this.fetchTransaction(credentials, envelopeId)
    const events: SyntheticAuditEvent[] = []

    if (raw.createdDate) {
      events.push({
        envelopeId,
        occurredAt: raw.createdDate,
        type: 'created',
        description: 'Transaction created',
        actorId: raw.createdBy?.id,
        actorName: raw.createdBy?.username,
        actorEmail: raw.createdBy?.emailAddress,
      })
    }
    if (raw.sentDate) {
      events.push({
        envelopeId,
        occurredAt: raw.sentDate,
        type: 'sent',
        description: 'Transaction sent to participants',
        actorId: raw.createdBy?.id,
        actorName: raw.createdBy?.username,
        actorEmail: raw.createdBy?.emailAddress,
      })
    }

    for (const participant of raw.participants ?? []) {
      for (const candidate of participant.candidates ?? []) {
        const evt = candidateEvent(envelopeId, candidate)
        if (evt) events.push(evt)
      }
    }

    const terminal = terminalEvent(envelopeId, raw)
    if (terminal) events.push(terminal)

    events.sort((a, b) => isoMillis(a.occurredAt) - isoMillis(b.occurredAt))
    return events.map((e, i) => transformAuditTrailEntry(e, i))
  }

  async getAuditTrailEntry(credentials: Credentials, id: string): Promise<AuditTrailEntry> {
    const [envelopeId, indexStr] = id.split(':')
    if (!envelopeId || indexStr === undefined) {
      throw new Error('getAuditTrailEntry expects an id of shape "<envelopeId>:<index>"')
    }
    const all = await this.listAuditTrailEntries(credentials, envelopeId, {})
    const found = all[Number(indexStr)]
    if (!found) throw new Error(`Audit entry ${id} not found`)
    return found
  }
}

function isoMillis(iso: string | undefined): number {
  if (!iso) return 0
  const t = Date.parse(iso)
  return Number.isNaN(t) ? 0 : t
}

function candidateEvent(
  envelopeId: string,
  candidate: RawCertinalCandidate,
): SyntheticAuditEvent | undefined {
  const action = (candidate.action ?? '').toUpperCase()
  if (!action || !candidate.actionDate) return undefined
  const map: Record<string, { type: SyntheticAuditEvent['type']; description: string }> = {
    VIEWED: { type: 'viewed', description: 'Participant viewed the document' },
    OPENED: { type: 'viewed', description: 'Participant opened the document' },
    SIGNED: { type: 'signed', description: 'Participant signed' },
    COMPLETED: { type: 'signed', description: 'Participant completed signing' },
    APPROVED: { type: 'signed', description: 'Participant approved' },
    EXECUTED: { type: 'signed', description: 'Participant executed' },
    DECLINED: { type: 'declined', description: 'Participant declined' },
    REJECTED: { type: 'declined', description: 'Participant rejected' },
  }
  const m = map[action] ?? { type: 'other' as const, description: `Participant action: ${action}` }
  return {
    envelopeId,
    occurredAt: candidate.actionDate,
    type: m.type,
    description: m.description,
    actorId: candidate.id,
    actorName: candidate.name,
    actorEmail: candidate.emailAddress,
    rawAction: candidate.action,
  }
}

function terminalEvent(
  envelopeId: string,
  raw: RawCertinalTransaction,
): SyntheticAuditEvent | undefined {
  const status = (raw.status ?? '').toUpperCase()
  const occurredAt = raw.lastUpdatedDate
  if (!occurredAt) return undefined
  if (status === 'COMPLETED' || status === 'SIGNED' || status === 'EXECUTED') {
    return { envelopeId, occurredAt, type: 'completed', description: 'Transaction completed', rawAction: raw.status }
  }
  if (status === 'DECLINED' || status === 'REJECTED') {
    return { envelopeId, occurredAt, type: 'declined', description: 'Transaction declined', rawAction: raw.status }
  }
  if (status === 'VOIDED' || status === 'CANCELLED' || status === 'CANCELED' || status === 'WITHDRAWN') {
    return { envelopeId, occurredAt, type: 'voided', description: 'Transaction voided', rawAction: raw.status }
  }
  if (status === 'EXPIRED') {
    return { envelopeId, occurredAt, type: 'expired', description: 'Transaction expired', rawAction: raw.status }
  }
  return undefined
}
