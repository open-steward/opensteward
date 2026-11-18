import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIso } from './shared'

/**
 * The recipient shape this (not yet rebuilt) envelope transform reads. It is
 * the pre-rebuild guess, not a documented Foxit eSign shape; the documented
 * party object is RawFoxitESignParty in ./signer.
 */
interface RawFoxitESignEnvelopeRecipient {
  id?: string
  recipientId?: string
  signingOrder?: string | number
  [key: string]: unknown
}

export interface RawFoxitESignEnvelope {
  envelopeId: string
  status?: string
  emailSubject?: string
  subject?: string
  emailMessage?: string
  message?: string
  sender?: { id?: string; userId?: string; email?: string; name?: string }
  ownerEmail?: string
  ownerName?: string
  templateId?: string
  signingOrder?: string
  routingOrder?: string
  createdAt?: string
  createdDate?: string
  sentAt?: string
  sentDate?: string
  deliveredAt?: string
  completedAt?: string
  completedDate?: string
  declinedAt?: string
  declinedDate?: string
  voidedAt?: string
  voidedDate?: string
  voidReason?: string
  expiresAt?: string
  expirationDate?: string
  updatedAt?: string
  modifiedDate?: string
  /** Embedded Foxit recipient rows — the same shape `transformSigner` consumes. */
  recipients?: RawFoxitESignEnvelopeRecipient[]
  documents?: Array<{ id?: string; documentId?: string }>
  customFields?: Record<string, unknown> | Array<{ name: string; value: string }>
  [key: string]: unknown
}

function mapStatus(raw: string | undefined): EnvelopeStatus {
  const s = (raw ?? '').toLowerCase()
  if (s === 'sent' || s === 'in_progress' || s === 'in progress') return 'sent'
  if (s === 'delivered' || s === 'viewed') return 'delivered'
  if (s === 'completed' || s === 'signed') return 'completed'
  if (s === 'declined') return 'declined'
  if (s === 'voided' || s === 'canceled' || s === 'cancelled') return 'voided'
  if (s === 'expired') return 'expired'
  return 'draft'
}

function signingOrder(raw: RawFoxitESignEnvelope): 'parallel' | 'sequential' {
  const explicit = (raw.signingOrder ?? '').toString().toLowerCase()
  if (explicit === 'sequential') return 'sequential'
  if (explicit === 'parallel') return 'parallel'
  const orders = (raw.recipients ?? [])
    .map((r) => Number(r.signingOrder ?? 0))
    .filter((n) => Number.isFinite(n))
  if (orders.length === 0) return 'parallel'
  return new Set(orders).size > 1 ? 'sequential' : 'parallel'
}

function customFieldsToMap(
  cf: RawFoxitESignEnvelope['customFields'],
): Record<string, string> {
  if (!cf) return {}
  if (Array.isArray(cf)) {
    const out: Record<string, string> = {}
    for (const f of cf) {
      if (f && typeof f.name === 'string' && typeof f.value === 'string') {
        out[f.name] = f.value
      }
    }
    return out
  }
  return strMap(cf)
}

export function transformEnvelope(raw: RawFoxitESignEnvelope): Envelope {
  const recipients = raw.recipients ?? []
  return {
    id: raw.envelopeId,
    externalId: raw.envelopeId,
    status: mapStatus(raw.status),
    subject: pickStr(raw.emailSubject) ?? pickStr(raw.subject) ?? '',
    message: pickStr(raw.emailMessage) ?? pickStr(raw.message),
    senderId: pickStr(raw.sender?.id ?? raw.sender?.userId),
    senderEmail: pickStr(raw.sender?.email ?? raw.ownerEmail),
    senderName: pickStr(raw.sender?.name ?? raw.ownerName),
    signingOrder: signingOrder(raw),
    signerIds: recipients
      .map((r) => pickStr(r.id ?? r.recipientId))
      .filter((s): s is string => Boolean(s)),
    documentIds: (raw.documents ?? [])
      .map((d) => pickStr(d.id ?? d.documentId))
      .filter((s): s is string => Boolean(s)),
    templateId: pickStr(raw.templateId),
    createdAt: toIso(raw.createdAt ?? raw.createdDate),
    sentAt: toIso(raw.sentAt ?? raw.sentDate),
    deliveredAt: toIso(raw.deliveredAt),
    completedAt: toIso(raw.completedAt ?? raw.completedDate),
    declinedAt: toIso(raw.declinedAt ?? raw.declinedDate),
    voidedAt: toIso(raw.voidedAt ?? raw.voidedDate),
    expiresAt: toIso(raw.expiresAt ?? raw.expirationDate),
    updatedAt: toIso(raw.updatedAt ?? raw.modifiedDate),
    platform: 'foxit-esign',
    metadata: {
      ...customFieldsToMap(raw.customFields),
      ...(raw.voidReason ? { voidReason: String(raw.voidReason) } : {}),
    },
    raw,
  }
}
