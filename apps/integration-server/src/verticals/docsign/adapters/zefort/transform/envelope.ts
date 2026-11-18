import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIso } from './shared'
import type { RawZefortParty } from './signer'
import type { RawZefortDocument } from './document'

/**
 * A Zefort signing request ("esign", id prefix `esgn_`) maps to the canonical
 * Envelope. Parties and documents are nested on the esign object; the
 * canonical Signer / Document resources are derived from those arrays.
 */
export interface RawZefortEsign {
  id: string
  owner?: string
  subject?: string
  message?: string
  status?: string
  sign_order?: string
  contract?: string
  parties?: RawZefortParty[]
  documents?: RawZefortDocument[]
  created?: string
  activated?: string
  signed?: string
  completed?: string
  cancelled?: string
  deadline?: string
  available_until?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): EnvelopeStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'draft':
      return 'draft'
    case 'pending':
      return 'sent'
    case 'completed':
      return 'completed'
    case 'declined':
      return 'declined'
    case 'canceled':
    case 'cancelled':
      return 'voided'
    case 'expired':
      return 'expired'
    case 'failed':
      return 'unknown'
    default:
      return 'draft'
  }
}

/** Zefort sign_order ("consecutive"/"parallel"/"flexible") → canonical order. */
function mapSigningOrder(s: string | undefined): 'sequential' | 'parallel' {
  return (s ?? '').toLowerCase() === 'consecutive' ? 'sequential' : 'parallel'
}

export function transformEnvelope(raw: RawZefortEsign): Envelope {
  const parties = raw.parties ?? []
  const documents = raw.documents ?? []
  return {
    id: raw.id,
    externalId: raw.id,
    status: mapStatus(raw.status),
    subject: pickStr(raw.subject) ?? '',
    message: pickStr(raw.message),
    senderId: pickStr(raw.owner),
    signingOrder: mapSigningOrder(raw.sign_order),
    signerIds: parties
      .map((p) => p.id ?? p.email ?? '')
      .filter((s): s is string => Boolean(s)),
    documentIds: documents.map((d) => d.id ?? '').filter((s): s is string => Boolean(s)),
    createdAt: toIso(raw.created),
    sentAt: toIso(raw.activated),
    completedAt: toIso(raw.completed ?? raw.signed),
    voidedAt: toIso(raw.cancelled),
    expiresAt: toIso(raw.deadline ?? raw.available_until),
    platform: 'zefort',
    metadata: strMap({
      contract: raw.contract,
      signOrder: raw.sign_order,
      rawStatus: raw.status,
    }),
    raw,
  }
}
