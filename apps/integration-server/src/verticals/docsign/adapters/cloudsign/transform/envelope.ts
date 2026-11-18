import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIso } from './shared'

export interface RawCloudSignDocument {
  id: string
  title?: string
  status?: string
  message?: string
  sender?: { id?: string; email?: string; name?: string }
  participants?: Array<{ id?: string; email?: string; name?: string; order?: number }>
  created_at?: string
  sent_at?: string
  completed_at?: string
  declined_at?: string
  cancelled_at?: string
  expires_at?: string
  updated_at?: string
  template_id?: string
  metadata?: Record<string, unknown>
  [key: string]: unknown
}

function mapStatus(s: string | undefined): EnvelopeStatus {
  switch (s) {
    case 'draft':
      return 'draft'
    case 'sent':
      return 'sent'
    case 'signed':
    case 'completed':
      return 'completed'
    case 'declined':
      return 'declined'
    case 'cancelled':
    case 'canceled':
      return 'voided'
    case 'expired':
      return 'expired'
    default:
      return 'draft'
  }
}

export function transformEnvelope(raw: RawCloudSignDocument): Envelope {
  const participants = raw.participants ?? []
  const orders = participants.map((p) => p.order ?? 0)
  const signing: 'parallel' | 'sequential' = new Set(orders).size > 1 ? 'sequential' : 'parallel'
  return {
    id: raw.id,
    externalId: raw.id,
    status: mapStatus(raw.status),
    subject: pickStr(raw.title) ?? '',
    message: pickStr(raw.message),
    senderId: pickStr(raw.sender?.id),
    senderEmail: pickStr(raw.sender?.email),
    senderName: pickStr(raw.sender?.name),
    signingOrder: signing,
    signerIds: participants.map((p) => p.id ?? p.email ?? '').filter((s): s is string => Boolean(s)),
    documentIds: [raw.id],
    templateId: pickStr(raw.template_id),
    createdAt: toIso(raw.created_at),
    sentAt: toIso(raw.sent_at),
    completedAt: toIso(raw.completed_at),
    declinedAt: toIso(raw.declined_at),
    voidedAt: toIso(raw.cancelled_at),
    expiresAt: toIso(raw.expires_at),
    updatedAt: toIso(raw.updated_at),
    platform: 'cloudsign',
    metadata: strMap(raw.metadata),
    raw,
  }
}
