import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIsoDatetime } from './shared'

/**
 * A LegalDesk eSign *transaction* — the unit a customer creates, attaches
 * documents + signers to, and tracks to completion. Maps to the canonical
 * `Envelope`. Field names are snake_case on the wire; LegalDesk's gateway
 * is loosely versioned, so a number of aliases are accepted defensively.
 */
export interface RawLegaldeskSigner {
  signer_id?: string
  reference_id?: string
  signer_email?: string
  email?: string
  signer_name?: string
  name?: string
  sign_order?: number | string
  signing_order?: number | string
  [key: string]: unknown
}

export interface RawLegaldeskDocument {
  document_id?: string
  doc_id?: string
  document_name?: string
  file_name?: string
  [key: string]: unknown
}

export interface RawLegaldeskTransaction {
  transaction_id?: string
  txn_id?: string
  reference_id?: string
  status?: string
  title?: string
  subject?: string
  message?: string
  note?: string
  initiator_id?: string
  initiator_email?: string
  initiator_name?: string
  signing_type?: string
  signers?: RawLegaldeskSigner[]
  documents?: RawLegaldeskDocument[]
  created_at?: string | number
  sent_at?: string | number
  delivered_at?: string | number
  completed_at?: string | number
  declined_at?: string | number
  rejected_at?: string | number
  expired_at?: string | number
  expiry_date?: string | number
  cancelled_at?: string | number
  voided_at?: string | number
  cancellation_reason?: string
  updated_at?: string | number
  [key: string]: unknown
}

function mapStatus(raw: string | undefined): EnvelopeStatus {
  const s = (raw ?? '').toLowerCase()
  if (s === 'created' || s === 'draft' || s === 'initiated' || s === 'pending') return 'draft'
  if (s === 'sent' || s === 'in_progress' || s === 'in-progress') return 'sent'
  if (s === 'delivered' || s === 'viewed' || s === 'opened') return 'delivered'
  if (s === 'completed' || s === 'signed' || s === 'success' || s === 'esigned') return 'completed'
  if (s === 'declined' || s === 'rejected') return 'declined'
  if (s === 'voided' || s === 'cancelled' || s === 'canceled' || s === 'revoked') return 'voided'
  if (s === 'expired') return 'expired'
  return 'draft'
}

function signerExternalId(s: RawLegaldeskSigner, index: number, txnId: string): string {
  return pickStr(s.signer_id) ?? pickStr(s.reference_id) ?? `${txnId}:${index}`
}

function docExternalId(d: RawLegaldeskDocument, index: number, txnId: string): string {
  return pickStr(d.document_id) ?? pickStr(d.doc_id) ?? `${txnId}:${index}`
}

function signerOrder(s: RawLegaldeskSigner): number {
  const v = s.sign_order ?? s.signing_order
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && !Number.isNaN(n) ? n : 0
}

function signingOrder(raw: RawLegaldeskTransaction): 'parallel' | 'sequential' {
  const explicit = (raw.signing_type ?? '').toLowerCase()
  if (explicit === 'sequential') return 'sequential'
  if (explicit === 'parallel') return 'parallel'
  const orders = (raw.signers ?? []).map(signerOrder)
  return new Set(orders).size > 1 ? 'sequential' : 'parallel'
}

export function transformEnvelope(raw: RawLegaldeskTransaction): Envelope {
  const id = pickStr(raw.transaction_id) ?? pickStr(raw.txn_id) ?? pickStr(raw.reference_id) ?? ''
  const signers = (raw.signers ?? [])
    .map((s, i) => ({ s, order: signerOrder(s), idx: i }))
    .sort((a, b) => a.order - b.order)
  return {
    id,
    externalId: id,
    status: mapStatus(raw.status),
    subject: pickStr(raw.title) ?? pickStr(raw.subject) ?? '',
    message: pickStr(raw.message) ?? pickStr(raw.note),
    senderId: pickStr(raw.initiator_id),
    senderEmail: pickStr(raw.initiator_email),
    senderName: pickStr(raw.initiator_name),
    signingOrder: signingOrder(raw),
    signerIds: signers.map(({ s, idx }) => signerExternalId(s, idx, id)),
    documentIds: (raw.documents ?? []).map((d, i) => docExternalId(d, i, id)),
    createdAt: toIsoDatetime(raw.created_at),
    sentAt: toIsoDatetime(raw.sent_at),
    deliveredAt: toIsoDatetime(raw.delivered_at),
    completedAt: toIsoDatetime(raw.completed_at),
    declinedAt: toIsoDatetime(raw.declined_at ?? raw.rejected_at),
    voidedAt: toIsoDatetime(raw.voided_at ?? raw.cancelled_at),
    expiresAt: toIsoDatetime(raw.expired_at ?? raw.expiry_date),
    updatedAt: toIsoDatetime(raw.updated_at),
    platform: 'legaldesk',
    metadata: strMap({
      reference_id: raw.reference_id,
      cancellation_reason: raw.cancellation_reason,
      signing_type: raw.signing_type,
    }),
    raw,
  }
}
