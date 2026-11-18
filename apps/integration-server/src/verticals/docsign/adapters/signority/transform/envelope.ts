import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { SIGNING_STATUS } from '../constants'
import { pickStr, strMap, toIso } from './shared'

/** A Signority invitation (recipient) as it appears nested on a document. */
export interface RawSignorityInvitation {
  id?: number | string
  GUID?: string
  recipientName?: string
  recipientEmail?: string
  sequence?: number | string
  status?: number | string
  actionType?: number | string
  canSignTags?: boolean
  signedTime?: number | string
  declinedTime?: number | string
  [key: string]: unknown
}

/** A Signority document — the canonical Envelope on the wire. */
export interface RawSignorityDocument {
  id: number | string
  GUID?: string
  title?: string
  senderName?: string
  senderEmail?: string
  userId?: number | string
  signingStatus?: number | string
  documentType?: number | string
  createdTime?: number | string
  lastModifiedTime?: number | string
  documentSentTime?: number | string
  documentCompletedTime?: number | string
  documentRejectedTime?: number | string
  documentExpiredTime?: number | string
  expiryTime?: number | string
  invitations?: RawSignorityInvitation[]
  files?: Array<{ id?: number | string }>
  documentSetting?: { message?: string; subject?: string; postBackURL?: string }
  [key: string]: unknown
}

function mapStatus(raw: number | string | undefined): EnvelopeStatus {
  const code = typeof raw === 'string' ? Number(raw) : raw
  switch (code) {
    case SIGNING_STATUS.DRAFT:
      return 'draft'
    case SIGNING_STATUS.IN_PROGRESS:
      return 'sent'
    case SIGNING_STATUS.COMPLETED:
      return 'completed'
    case SIGNING_STATUS.REJECTED:
      return 'declined'
    default:
      return 'draft'
  }
}

/**
 * Signority encodes signing flow via per-invitation `sequence`. When the
 * invitations span more than one sequence value the flow is sequential;
 * a single shared sequence means parallel.
 */
function signingOrder(raw: RawSignorityDocument): 'parallel' | 'sequential' {
  const seqs = (raw.invitations ?? [])
    .map((i) => (typeof i.sequence === 'string' ? Number(i.sequence) : i.sequence))
    .filter((n): n is number => typeof n === 'number' && !Number.isNaN(n))
  if (seqs.length === 0) return 'parallel'
  return new Set(seqs).size > 1 ? 'sequential' : 'parallel'
}

function signerIds(raw: RawSignorityDocument): string[] {
  return (raw.invitations ?? [])
    .slice()
    .sort((a, b) => Number(a.sequence ?? 0) - Number(b.sequence ?? 0))
    .map((i) => pickStr(i.GUID) ?? pickStr(i.id) ?? '')
    .filter((id) => id.length > 0)
}

export function transformEnvelope(raw: RawSignorityDocument): Envelope {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    status: mapStatus(raw.signingStatus),
    subject: pickStr(raw.title) ?? pickStr(raw.documentSetting?.subject) ?? '',
    message: pickStr(raw.documentSetting?.message),
    senderId: pickStr(raw.userId),
    senderEmail: pickStr(raw.senderEmail),
    senderName: pickStr(raw.senderName),
    signingOrder: signingOrder(raw),
    signerIds: signerIds(raw),
    documentIds: (raw.files ?? [])
      .map((f) => pickStr(f.id))
      .filter((id): id is string => typeof id === 'string'),
    createdAt: toIso(raw.createdTime),
    sentAt: toIso(raw.documentSentTime),
    completedAt: toIso(raw.documentCompletedTime),
    declinedAt: toIso(raw.documentRejectedTime),
    expiresAt: toIso(raw.documentExpiredTime ?? raw.expiryTime),
    updatedAt: toIso(raw.lastModifiedTime),
    platform: 'signority',
    metadata: strMap({
      GUID: raw.GUID,
      documentType: raw.documentType,
      signingStatus: raw.signingStatus,
    }),
    raw,
  }
}
