import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { toIso, pickStr, strMap } from './shared'

/**
 * A Mekari Sign "document" is the canonical Envelope: it bundles the file,
 * the ordered list of signers, the signing flow, and lifecycle timestamps.
 *
 * `signing_status` ∈ { in_progress, completed, voided, declined };
 * `category` ∈ { global, psre }; `stamping_status` ∈
 * { none, in_progress, pending, failed, success }.
 */
export interface RawMekariSignSigner {
  id?: string
  email?: string
  name?: string
  full_name?: string
  order?: number
  signing_order?: number
  status?: string
  signing_status?: string
  signed_at?: string
  viewed_at?: string
  sent_at?: string
  declined_at?: string
  decline_reason?: string
  [key: string]: unknown
}

export interface RawMekariSignDocument {
  id: string
  filename?: string
  doc_name?: string
  title?: string
  subject?: string
  message?: string
  category?: string
  signing_status?: string
  stamping_status?: string
  signing_order?: boolean
  is_ordered?: boolean
  sender_email?: string
  creator_email?: string
  signers?: RawMekariSignSigner[]
  page_count?: number
  size?: number
  size_bytes?: number
  mime_type?: string
  created_at?: string
  updated_at?: string
  sent_at?: string
  completed_at?: string
  voided_at?: string
  declined_at?: string
  expired_at?: string
  expires_at?: string
  [key: string]: unknown
}

function mapStatus(raw: RawMekariSignDocument): EnvelopeStatus {
  switch ((raw.signing_status ?? '').toLowerCase()) {
    case 'completed':
      return 'completed'
    case 'voided':
      return 'voided'
    case 'declined':
      return 'declined'
    case 'expired':
      return 'expired'
    case 'in_progress':
      return 'sent'
    case 'draft':
      return 'draft'
    default:
      return 'unknown'
  }
}

function signerId(s: RawMekariSignSigner, index: number): string {
  return pickStr(s.id) ?? pickStr(s.email) ?? String(index)
}

export function transformEnvelope(raw: RawMekariSignDocument): Envelope {
  const signers = raw.signers ?? []
  const isOrdered = raw.signing_order === true || raw.is_ordered === true
  return {
    id: raw.id,
    externalId: raw.id,
    status: mapStatus(raw),
    subject:
      pickStr(raw.subject) ??
      pickStr(raw.title) ??
      pickStr(raw.filename) ??
      pickStr(raw.doc_name) ??
      '',
    message: pickStr(raw.message),
    senderEmail: pickStr(raw.sender_email) ?? pickStr(raw.creator_email),
    signingOrder: isOrdered ? 'sequential' : 'parallel',
    signerIds: signers.map(signerId),
    // A Mekari Sign document carries exactly one file; we surface it as a
    // single canonical Document addressed by the document id.
    documentIds: [raw.id],
    createdAt: toIso(raw.created_at),
    sentAt: toIso(raw.sent_at),
    completedAt: toIso(raw.completed_at),
    declinedAt: toIso(raw.declined_at),
    voidedAt: toIso(raw.voided_at),
    expiresAt: toIso(raw.expires_at) ?? toIso(raw.expired_at),
    updatedAt: toIso(raw.updated_at),
    platform: 'mekari-sign',
    metadata: strMap({
      category: raw.category,
      signingStatus: raw.signing_status,
      stampingStatus: raw.stamping_status,
    }),
    raw,
  }
}
