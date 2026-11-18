import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIso } from './shared'

/**
 * A signatory on a SignDesk eSign request. SignDesk identifies signatories
 * by `signatory_id` (or `reference_id`) and routes them either in parallel
 * or by an explicit `signing_sequence`.
 */
export interface RawSigndeskSignatory {
  signatory_id?: string
  reference_id?: string
  name?: string
  email?: string
  mobile?: string
  signatory_type?: string
  signing_status?: string
  status?: string
  signing_sequence?: number
  sequence?: number
  signed_on?: string
  rejected_on?: string
  declined_on?: string
  rejection_reason?: string
  decline_reason?: string
  [key: string]: unknown
}

/** A document attached to a SignDesk eSign request. */
export interface RawSigndeskDocumentFile {
  document_id?: string
  document_name?: string
  file_name?: string
  page_count?: number
  size_bytes?: number
  content_type?: string
  [key: string]: unknown
}

/**
 * A SignDesk eSign request — the unit that groups documents + signatories
 * and carries the overall signing status. Maps to the canonical Envelope.
 */
export interface RawSigndeskRequest {
  request_id?: string
  reference_number?: string
  reference_id?: string
  document_name?: string
  title?: string
  request_status?: string
  status?: string
  signing_type?: string
  signing_sequence_type?: string
  initiator_id?: string
  initiator_name?: string
  initiator_email?: string
  created_on?: string
  updated_on?: string
  completed_on?: string
  expires_on?: string
  signatories?: RawSigndeskSignatory[]
  documents?: RawSigndeskDocumentFile[]
  metadata?: Record<string, unknown>
  [key: string]: unknown
}

export function envelopeId(raw: RawSigndeskRequest): string {
  return pickStr(raw.request_id) ?? pickStr(raw.reference_number) ?? pickStr(raw.reference_id) ?? ''
}

function mapStatus(raw: RawSigndeskRequest): EnvelopeStatus {
  const s = (raw.request_status ?? raw.status ?? '').toLowerCase()
  if (s.includes('complete') || s.includes('signed') || s.includes('executed')) return 'completed'
  if (s.includes('expire')) return 'expired'
  if (s.includes('cancel') || s.includes('void') || s.includes('withdraw')) return 'voided'
  if (s.includes('reject') || s.includes('decline')) return 'declined'
  if (s.includes('deliver')) return 'delivered'
  if (s.includes('sent') || s.includes('initiat') || s.includes('progress') || s.includes('pending'))
    return 'sent'
  return 'draft'
}

function extractSignatories(raw: RawSigndeskRequest): RawSigndeskSignatory[] {
  return Array.isArray(raw.signatories) ? raw.signatories : []
}

function mapSigningOrder(raw: RawSigndeskRequest, signatories: RawSigndeskSignatory[]): 'parallel' | 'sequential' {
  const t = (raw.signing_type ?? raw.signing_sequence_type ?? '').toLowerCase()
  if (t.includes('sequen')) return 'sequential'
  if (t.includes('parallel')) return 'parallel'
  const orders = signatories.map((s) => s.signing_sequence ?? s.sequence ?? 0)
  return new Set(orders.filter((o) => o > 0)).size > 1 ? 'sequential' : 'parallel'
}

export function transformEnvelope(raw: RawSigndeskRequest): Envelope {
  const id = envelopeId(raw)
  const signatories = extractSignatories(raw)
  return {
    id,
    externalId: id,
    status: mapStatus(raw),
    subject: pickStr(raw.document_name) ?? pickStr(raw.title) ?? '',
    senderId: pickStr(raw.initiator_id),
    senderEmail: /@/.test(raw.initiator_email ?? '') ? String(raw.initiator_email) : undefined,
    senderName: pickStr(raw.initiator_name),
    signingOrder: mapSigningOrder(raw, signatories),
    signerIds: signatories
      .map((s) => s.signatory_id ?? s.reference_id)
      .filter((k): k is string => typeof k === 'string'),
    documentIds: Array.isArray(raw.documents)
      ? raw.documents
          .map((d, i) => d.document_id ?? (id ? `${id}:${i}` : undefined))
          .filter((k): k is string => typeof k === 'string')
      : id
        ? [id]
        : [],
    createdAt: toIso(raw.created_on),
    updatedAt: toIso(raw.updated_on),
    completedAt: toIso(raw.completed_on),
    expiresAt: toIso(raw.expires_on),
    platform: 'signdesk',
    metadata: strMap({
      ...raw.metadata,
      referenceNumber: raw.reference_number,
      signingType: raw.signing_type ?? raw.signing_sequence_type,
      requestStatus: raw.request_status ?? raw.status,
    }),
    raw,
  }
}
