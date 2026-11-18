import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIso } from './shared'

export interface RawNitroSignTransaction {
  id: string
  transactionId?: string
  name?: string
  subject?: string
  message?: string
  status?: string
  sender?: { id?: string; email?: string; name?: string }
  templateId?: string
  signingOrder?: string
  signers?: Array<{ id?: string; signerId?: string; order?: string | number }>
  documents?: Array<{ id?: string; documentId?: string }>
  createdAt?: string
  sentAt?: string
  deliveredAt?: string
  completedAt?: string
  declinedAt?: string
  cancelledAt?: string
  voidedAt?: string
  expiresAt?: string
  updatedAt?: string
  cancelReason?: string
  metadata?: Record<string, unknown>
  [key: string]: unknown
}

function mapStatus(raw: string | undefined): EnvelopeStatus {
  const s = (raw ?? '').toUpperCase()
  if (s === 'IN_PROGRESS' || s === 'SENT' || s === 'PENDING') return 'sent'
  if (s === 'DELIVERED' || s === 'VIEWED') return 'delivered'
  if (s === 'COMPLETED' || s === 'SIGNED') return 'completed'
  if (s === 'DECLINED') return 'declined'
  if (s === 'CANCELLED' || s === 'CANCELED' || s === 'VOIDED') return 'voided'
  if (s === 'EXPIRED') return 'expired'
  if (s === 'DRAFT') return 'draft'
  return 'draft'
}

function signingOrder(raw: RawNitroSignTransaction): 'parallel' | 'sequential' {
  const explicit = (raw.signingOrder ?? '').toLowerCase()
  if (explicit === 'sequential') return 'sequential'
  if (explicit === 'parallel') return 'parallel'
  const orders = (raw.signers ?? [])
    .map((s) => Number(s.order ?? 0))
    .filter((n) => Number.isFinite(n))
  if (orders.length === 0) return 'parallel'
  return new Set(orders).size > 1 ? 'sequential' : 'parallel'
}

export function transformEnvelope(raw: RawNitroSignTransaction): Envelope {
  const id = raw.id ?? raw.transactionId ?? ''
  return {
    id,
    externalId: id,
    status: mapStatus(raw.status),
    subject: pickStr(raw.subject) ?? pickStr(raw.name) ?? '',
    message: pickStr(raw.message),
    senderId: pickStr(raw.sender?.id),
    senderEmail: pickStr(raw.sender?.email),
    senderName: pickStr(raw.sender?.name),
    signingOrder: signingOrder(raw),
    signerIds: (raw.signers ?? [])
      .map((s) => pickStr(s.id ?? s.signerId))
      .filter((s): s is string => Boolean(s)),
    documentIds: (raw.documents ?? [])
      .map((d) => pickStr(d.id ?? d.documentId))
      .filter((s): s is string => Boolean(s)),
    templateId: pickStr(raw.templateId),
    createdAt: toIso(raw.createdAt),
    sentAt: toIso(raw.sentAt),
    deliveredAt: toIso(raw.deliveredAt),
    completedAt: toIso(raw.completedAt),
    declinedAt: toIso(raw.declinedAt),
    voidedAt: toIso(raw.voidedAt ?? raw.cancelledAt),
    expiresAt: toIso(raw.expiresAt),
    updatedAt: toIso(raw.updatedAt),
    platform: 'nitro-sign',
    metadata: {
      ...strMap(raw.metadata),
      ...(raw.cancelReason ? { cancelReason: String(raw.cancelReason) } : {}),
    },
    raw,
  }
}
