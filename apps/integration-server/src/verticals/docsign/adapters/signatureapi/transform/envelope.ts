import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import type { SigningOrder } from '../../../schema/shared'
import { pickStr, strMap, toIso } from './shared'
import type { RawSignatureapiRecipient } from './signer'
import type { RawSignatureapiDocument } from './document'

/**
 * SignatureAPI envelope. Recipients and documents are embedded in the
 * envelope payload (there is no separately addressable recipient/document
 * resource), so signer/document transforms operate on these nested arrays.
 *
 * Docs: https://signatureapi.com/docs/api/resources/envelopes
 */
export interface RawSignatureapiEnvelope {
  id: string
  status?: string
  mode?: string
  title?: string
  label?: string
  message?: string
  routing?: string
  language?: string
  timezone?: string
  sender?: { name?: string; email?: string; organization?: string }
  recipients?: RawSignatureapiRecipient[]
  documents?: RawSignatureapiDocument[]
  topics?: string[]
  metadata?: Record<string, unknown>
  created_at?: string
  completed_at?: string
  declined_at?: string
  expires_at?: string
  [key: string]: unknown
}

/**
 * Envelope status enum: processing | in_progress | completed | failed |
 * canceled. SignatureAPI has no explicit `draft`/`sent` states — an envelope
 * is created already addressed to recipients and begins in `processing`.
 */
function mapStatus(raw: string | undefined): EnvelopeStatus {
  switch ((raw ?? '').toLowerCase()) {
    case 'processing':
      return 'sent'
    case 'in_progress':
      return 'delivered'
    case 'completed':
      return 'completed'
    case 'canceled':
    case 'cancelled':
      return 'voided'
    case 'failed':
      return 'expired'
    default:
      return 'sent'
  }
}

function signingOrder(raw: RawSignatureapiEnvelope): SigningOrder {
  return (raw.routing ?? '').toLowerCase() === 'sequential' ? 'sequential' : 'parallel'
}

/** Any recipient that declined drives a derived `declined` envelope status. */
function anyRejected(raw: RawSignatureapiEnvelope): boolean {
  return (raw.recipients ?? []).some((r) => (r.status ?? '').toLowerCase() === 'rejected')
}

export function transformEnvelope(raw: RawSignatureapiEnvelope): Envelope {
  const status: EnvelopeStatus =
    raw.declined_at || (anyRejected(raw) && mapStatus(raw.status) !== 'completed')
      ? 'declined'
      : mapStatus(raw.status)
  return {
    id: raw.id,
    externalId: raw.id,
    status,
    subject: raw.title ?? raw.label ?? '',
    message: pickStr(raw.message),
    senderEmail: pickStr(raw.sender?.email),
    senderName: pickStr(raw.sender?.name),
    signingOrder: signingOrder(raw),
    signerIds: (raw.recipients ?? []).map((r) => r.id),
    documentIds: (raw.documents ?? []).map((d) => d.id),
    createdAt: toIso(raw.created_at),
    completedAt: toIso(raw.completed_at),
    declinedAt: toIso(raw.declined_at),
    expiresAt: toIso(raw.expires_at),
    platform: 'signatureapi',
    metadata: {
      ...strMap(raw.metadata),
      ...(raw.mode ? { mode: raw.mode } : {}),
      ...(raw.language ? { language: raw.language } : {}),
      ...(raw.timezone ? { timezone: raw.timezone } : {}),
      ...(raw.sender?.organization ? { senderOrganization: raw.sender.organization } : {}),
      ...(raw.topics && raw.topics.length ? { topics: raw.topics.join(',') } : {}),
    },
    raw,
  }
}
