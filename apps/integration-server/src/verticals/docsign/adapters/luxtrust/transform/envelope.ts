import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIso } from './shared'

export interface RawLuxTrustDocument {
  id: string
  name?: string
  status?: string
  description?: string
  sender?: { id?: string; email?: string; name?: string }
  signers?: Array<{
    id?: string
    email?: string
    name?: string
    order?: number
    status?: string
    signed_at?: string
    declined_at?: string
  }>
  documents?: Array<{ id?: string; name?: string; pages?: number }>
  template_id?: string
  created_at?: string
  expires_at?: string
  completed_at?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): EnvelopeStatus {
  switch (s) {
    case 'DRAFT':
    case 'draft':
      return 'draft'
    case 'PENDING':
    case 'pending':
      return 'sent'
    case 'COMPLETED':
    case 'completed':
      return 'completed'
    case 'DECLINED':
    case 'declined':
      return 'declined'
    case 'CANCELLED':
    case 'cancelled':
      return 'voided'
    case 'EXPIRED':
    case 'expired':
      return 'expired'
    default:
      return 'draft'
  }
}

export function transformEnvelope(raw: RawLuxTrustDocument): Envelope {
  const signers = raw.signers ?? []
  const orders = signers.map((s) => s.order ?? 0)
  return {
    id: raw.id,
    externalId: raw.id,
    status: mapStatus(raw.status),
    subject: pickStr(raw.name) ?? '',
    message: pickStr(raw.description),
    senderId: pickStr(raw.sender?.id),
    senderEmail: pickStr(raw.sender?.email),
    senderName: pickStr(raw.sender?.name),
    signingOrder: new Set(orders).size > 1 ? 'sequential' : 'parallel',
    signerIds: signers.map((s) => s.id ?? s.email ?? '').filter((s): s is string => Boolean(s)),
    documentIds: (raw.documents ?? [])
      .map((d) => d.id ?? '')
      .filter((s): s is string => Boolean(s)),
    templateId: pickStr(raw.template_id),
    createdAt: toIso(raw.created_at),
    completedAt: toIso(raw.completed_at),
    expiresAt: toIso(raw.expires_at),
    platform: 'luxtrust',
    metadata: strMap({}),
    raw,
  }
}
