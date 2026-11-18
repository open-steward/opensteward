import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIso } from './shared'

/**
 * A party as returned on an envelope. The list endpoint returns only the
 * base fields (id, title, mobile-last4, password); the detail endpoint adds
 * contact_email, party_status, party_signature_type and party_role. We keep
 * the rich fields optional so one type covers both shapes.
 */
export interface RawSignableEnvelopeParty {
  party_id: string
  party_title?: string
  party_mobile_last4?: string | null
  party_password?: string | null
  contact_id?: string
  contact_email?: string
  party_status?: string
  party_signature_type?: string
  party_role?: string
  [key: string]: unknown
}

export interface RawSignableEnvelopeDocument {
  document_fingerprint: string
  document_title?: string
  document_page_total?: string
  [key: string]: unknown
}

/**
 * Signable envelope. `EnvelopeSignedSummary` (list) and
 * `EnvelopeDetailResponse` (detail) share the `EnvelopeUnsignedSummary`
 * base; the detail response additionally carries documents + history.
 */
export interface RawSignableEnvelope {
  envelope_fingerprint: string
  envelope_title?: string
  envelope_status: string
  envelope_redirect_url?: string | null
  envelope_created?: string
  envelope_sent?: string | null
  envelope_processed?: string | null
  envelope_all_at_once_enabled?: boolean
  envelope_requires_otp?: boolean
  envelope_parties?: RawSignableEnvelopeParty[]
  envelope_documents?: RawSignableEnvelopeDocument[]
  envelope_signed_pdf?: string | null
  [key: string]: unknown
}

/** Map Signable envelope statuses onto the canonical EnvelopeStatus enum. */
function mapStatus(raw: string): EnvelopeStatus {
  switch ((raw ?? '').toLowerCase()) {
    case 'draft':
    case 'processing':
      return 'draft'
    case 'sent':
    case 'verify':
      return 'sent'
    case 'signed':
      return 'completed'
    case 'rejected':
      return 'declined'
    case 'cancelled':
      return 'voided'
    case 'expired':
    case 'failed':
      return 'expired'
    default:
      return 'draft'
  }
}

export function transformEnvelope(raw: RawSignableEnvelope): Envelope {
  const status = mapStatus(raw.envelope_status)
  // Signable sends to all parties at once OR sequentially (one-at-a-time).
  const signingOrder = raw.envelope_all_at_once_enabled === false ? 'sequential' : 'parallel'
  // `envelope_processed` is when the terminal action (signed/cancelled) landed.
  const processedAt = toIso(raw.envelope_processed)
  return {
    id: raw.envelope_fingerprint,
    externalId: raw.envelope_fingerprint,
    status,
    subject: pickStr(raw.envelope_title) ?? '',
    signingOrder,
    signerIds: (raw.envelope_parties ?? []).map((p) => p.party_id),
    documentIds: (raw.envelope_documents ?? []).map((d) => d.document_fingerprint),
    createdAt: toIso(raw.envelope_created),
    sentAt: toIso(raw.envelope_sent),
    completedAt: status === 'completed' ? processedAt : undefined,
    declinedAt: status === 'declined' ? processedAt : undefined,
    voidedAt: status === 'voided' ? processedAt : undefined,
    expiresAt: status === 'expired' ? processedAt : undefined,
    updatedAt: processedAt ?? toIso(raw.envelope_sent) ?? toIso(raw.envelope_created),
    platform: 'signable',
    metadata: strMap({
      envelopeStatus: raw.envelope_status,
      requiresOtp: raw.envelope_requires_otp,
      allAtOnceEnabled: raw.envelope_all_at_once_enabled,
      redirectUrl: raw.envelope_redirect_url,
    }),
    raw,
  }
}
