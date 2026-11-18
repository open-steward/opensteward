import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIso } from './shared'

export interface RawOneflowParticipant {
  id?: string | number
  email?: string
  name?: string
  signing_order?: number
  state?: string
  signed_time?: string
  declined_time?: string
  delivered_time?: string
  viewed_time?: string
}

export interface RawOneflowContract {
  id: number | string
  name?: string
  state?: string
  message?: string
  created_time?: string
  updated_time?: string
  sent_time?: string
  signed_time?: string
  expire_date?: string
  parties?: Array<{
    id?: string | number
    name?: string
    participants?: RawOneflowParticipant[]
  }>
  template_id?: string | number
  [key: string]: unknown
}

function mapStatus(s: string | undefined): EnvelopeStatus {
  switch (s) {
    case 'draft':
      return 'draft'
    case 'pending':
      return 'sent'
    case 'signed':
    case 'completed':
      return 'completed'
    case 'declined':
      return 'declined'
    case 'cancelled':
    case 'terminated':
      return 'voided'
    case 'expired':
      return 'expired'
    default:
      return 'draft'
  }
}

export function transformEnvelope(raw: RawOneflowContract): Envelope {
  const id = String(raw.id)
  const participants = (raw.parties ?? []).flatMap((p) => p.participants ?? [])
  const orders = participants.map((p) => p.signing_order ?? 0)
  const signing: 'parallel' | 'sequential' = new Set(orders).size > 1 ? 'sequential' : 'parallel'
  return {
    id,
    externalId: id,
    status: mapStatus(raw.state),
    subject: pickStr(raw.name) ?? '',
    message: pickStr(raw.message),
    signingOrder: signing,
    signerIds: participants
      .map((p) => (p.id !== undefined ? String(p.id) : p.email ?? ''))
      .filter((s): s is string => Boolean(s)),
    documentIds: [id],
    templateId: raw.template_id !== undefined ? String(raw.template_id) : undefined,
    createdAt: toIso(raw.created_time),
    updatedAt: toIso(raw.updated_time),
    sentAt: toIso(raw.sent_time),
    completedAt: toIso(raw.signed_time),
    expiresAt: toIso(raw.expire_date),
    platform: 'oneflow',
    metadata: strMap({}),
    raw,
  }
}
