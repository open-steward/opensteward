import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { idStr, pickStr, strMap, toIso } from './shared'
import type { RawDocumensoRecipient } from './signer'

/**
 * A Documenso v1 document. The document IS the canonical envelope; recipients
 * (signers) are embedded. Numeric ids are coerced to strings on the wire.
 */
export interface RawDocumensoDocument {
  id: number
  externalId?: string | null
  userId?: number
  teamId?: number | null
  title?: string
  status?: string
  source?: string
  visibility?: string
  documentDataId?: string
  createdAt?: string
  updatedAt?: string
  completedAt?: string | null
  deletedAt?: string | null
  recipients?: RawDocumensoRecipient[]
  documentMeta?: {
    subject?: string | null
    message?: string | null
    timezone?: string | null
    dateFormat?: string | null
    redirectUrl?: string | null
    signingOrder?: string | null
  } | null
  [key: string]: unknown
}

/** Map Documenso DocumentStatus (DRAFT|PENDING|COMPLETED|REJECTED) → canonical. */
function mapStatus(raw: string | undefined): EnvelopeStatus {
  switch ((raw ?? '').toUpperCase()) {
    case 'DRAFT':
      return 'draft'
    case 'PENDING':
      return 'sent'
    case 'COMPLETED':
      return 'completed'
    case 'REJECTED':
      return 'declined'
    default:
      return 'draft'
  }
}

/**
 * Documenso documentMeta.signingOrder is 'PARALLEL' | 'SEQUENTIAL'. When the
 * meta is absent, infer from whether recipients carry distinct signingOrder
 * values.
 */
function signingOrder(raw: RawDocumensoDocument): 'parallel' | 'sequential' {
  const declared = (raw.documentMeta?.signingOrder ?? '').toUpperCase()
  if (declared === 'SEQUENTIAL') return 'sequential'
  if (declared === 'PARALLEL') return 'parallel'
  const orders = (raw.recipients ?? [])
    .map((r) => r.signingOrder)
    .filter((o): o is number => typeof o === 'number')
  return new Set(orders).size > 1 ? 'sequential' : 'parallel'
}

/** Ordered recipient (signer) ids — sorted by signingOrder for sequential flows. */
function signerIds(raw: RawDocumensoDocument): string[] {
  return (raw.recipients ?? [])
    .slice()
    .sort((a, b) => (a.signingOrder ?? 0) - (b.signingOrder ?? 0))
    .map((r) => idStr(r.id))
}

/** Latest signing timestamp across recipients approximates the envelope sent time. */
function earliestSentAt(raw: RawDocumensoDocument): string | undefined {
  // Documenso has no document-level sentAt; PENDING/COMPLETED docs were sent at
  // creation time in the common flow. Fall back to createdAt for sent docs.
  const status = (raw.status ?? '').toUpperCase()
  if (status === 'PENDING' || status === 'COMPLETED' || status === 'REJECTED') {
    return toIso(raw.createdAt)
  }
  return undefined
}

export function transformEnvelope(raw: RawDocumensoDocument): Envelope {
  const sender = raw.documentMeta
  return {
    id: idStr(raw.id),
    externalId: raw.externalId ? String(raw.externalId) : idStr(raw.id),
    status: mapStatus(raw.status),
    subject: pickStr(raw.title) ?? pickStr(sender?.subject) ?? '',
    message: pickStr(sender?.message),
    senderId: raw.userId != null ? String(raw.userId) : undefined,
    senderEmail: undefined,
    senderName: undefined,
    signingOrder: signingOrder(raw),
    signerIds: signerIds(raw),
    documentIds: [idStr(raw.id)],
    templateId: undefined,
    createdAt: toIso(raw.createdAt),
    sentAt: earliestSentAt(raw),
    deliveredAt: undefined,
    completedAt: toIso(raw.completedAt),
    declinedAt:
      (raw.status ?? '').toUpperCase() === 'REJECTED' ? toIso(raw.updatedAt) : undefined,
    voidedAt: undefined,
    expiresAt: undefined,
    updatedAt: toIso(raw.updatedAt),
    platform: 'documenso',
    metadata: strMap({
      source: raw.source,
      visibility: raw.visibility,
      teamId: raw.teamId,
      documentDataId: raw.documentDataId,
      redirectUrl: sender?.redirectUrl,
    }),
    raw,
  }
}
