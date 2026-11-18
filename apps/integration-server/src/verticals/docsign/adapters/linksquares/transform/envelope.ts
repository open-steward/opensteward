import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIso } from './shared'

/**
 * A Finalize agreement party (counterparty / internal signer). Returned as
 * `parties` on the embedded agreement detail. The list endpoint omits the
 * embedded objects, so every nested array is optional.
 */
export interface RawLinksquaresParty {
  id?: number | string
  name?: string
  email?: string
  role?: string
  party_type?: string
  signing_order?: number
  status?: string
  signed_at?: string
  declined_at?: string
  [key: string]: unknown
}

/** A Finalize agreement version / attachment (document metadata only). */
export interface RawLinksquaresVersion {
  id?: number | string
  file_name?: string
  page_count?: number
  file_size?: number
  content_type?: string
  [key: string]: unknown
}

/**
 * A Finalize agreement. The canonical Envelope. The detail endpoint
 * (`?include=embedded`) carries the embedded `parties` and version/document
 * arrays; the list endpoint returns only the scalar fields, so those nested
 * arrays are optional.
 */
export interface RawLinksquaresAgreement {
  id: number | string
  name?: string
  description?: string
  status?: string
  phase?: string
  signing_order?: string
  creator_id?: number | string
  creator_email?: string
  creator_name?: string
  template_id?: number | string
  parties?: RawLinksquaresParty[]
  agreement_versions?: RawLinksquaresVersion[]
  documents?: RawLinksquaresVersion[]
  created_at?: string
  sent_at?: string
  executed_at?: string
  expires_at?: string
  updated_at?: string
  [key: string]: unknown
}

/**
 * Map Finalize agreement statuses onto the canonical EnvelopeStatus enum.
 * Finalize groups statuses into phases (Request, Review, Signature,
 * Complete/Active, Paused); we match on the normalized status string.
 */
function mapStatus(s: string | undefined): EnvelopeStatus {
  const t = (s ?? '').toLowerCase().replace(/[\s-]+/g, '_')
  if (t.includes('request_pending') || t.includes('draft')) return 'draft'
  if (t.includes('fully_signed') || t.includes('executed') || t.includes('complete') || t.includes('active')) {
    return 'completed'
  }
  if (t.includes('out_for_signature') || t.includes('ready_for_signature') || t.includes('signature')) {
    return 'sent'
  }
  if (t.includes('internal_review') || t.includes('counterparty_review') || t.includes('review') || t.includes('negotiation')) {
    return 'sent'
  }
  if (t.includes('declined') || t.includes('rejected')) return 'declined'
  if (t.includes('cancelled') || t.includes('canceled') || t.includes('void')) return 'voided'
  if (t.includes('expired')) return 'expired'
  if (t.includes('paused')) return 'draft'
  return 'draft'
}

function partyId(p: RawLinksquaresParty): string {
  return pickStr(p.id) ?? pickStr(p.email) ?? ''
}

function versionId(v: RawLinksquaresVersion, fallback: string): string {
  return pickStr(v.id) ?? fallback
}

export function transformEnvelope(raw: RawLinksquaresAgreement): Envelope {
  const parties = raw.parties ?? []
  const versions = raw.agreement_versions ?? raw.documents ?? []
  const status = mapStatus(raw.status ?? raw.phase)
  const signingOrder =
    (raw.signing_order ?? '').toLowerCase() === 'sequential' ? 'sequential' : 'parallel'
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    status,
    subject: pickStr(raw.name) ?? '',
    message: pickStr(raw.description),
    senderId: pickStr(raw.creator_id),
    senderEmail: pickStr(raw.creator_email),
    senderName: pickStr(raw.creator_name),
    signingOrder,
    signerIds: parties.map(partyId).filter((s): s is string => Boolean(s)),
    documentIds: versions.map((v, i) => versionId(v, `${raw.id}:${i}`)),
    templateId: pickStr(raw.template_id),
    createdAt: toIso(raw.created_at),
    sentAt: toIso(raw.sent_at),
    completedAt: status === 'completed' ? toIso(raw.executed_at) : undefined,
    expiresAt: toIso(raw.expires_at),
    updatedAt: toIso(raw.updated_at),
    platform: 'linksquares',
    metadata: strMap({
      status: raw.status,
      phase: raw.phase,
    }),
    raw,
  }
}
