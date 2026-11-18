import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIso } from './shared'

export interface RawLealosSigner {
  id?: string
  email?: string
  name?: string
  role?: string
  status?: string
  signed_at?: string
  declined_at?: string
  declined_reason?: string
  sent_at?: string
  delivered_at?: string
  order?: number
  [key: string]: unknown
}

export interface RawLealosDocument {
  id: string
  title?: string
  name?: string
  status?: string
  sender_id?: string
  sender_email?: string
  sender_name?: string
  created_at?: string
  updated_at?: string
  completed_at?: string
  cancelled_at?: string
  expires_at?: string
  signers?: RawLealosSigner[]
  template_id?: string
  metadata?: Record<string, unknown>
  [key: string]: unknown
}

/**
 * Best-guess status mapping. Lealos public docs do not exhaustively
 * enumerate status values — anything unrecognised falls back to `draft`
 * rather than silently mis-coding a completed contract.
 */
function mapStatus(raw: RawLealosDocument): EnvelopeStatus {
  const s = (raw.status ?? '').toLowerCase()
  if (s === 'completed' || s === 'signed' || s === 'done') return 'completed'
  if (s === 'sent' || s === 'in_progress' || s === 'pending') return 'sent'
  if (s === 'delivered') return 'delivered'
  if (s === 'declined' || s === 'rejected') return 'declined'
  if (s === 'cancelled' || s === 'canceled' || s === 'voided') return 'voided'
  if (s === 'expired') return 'expired'
  return 'draft'
}

export function transformEnvelope(raw: RawLealosDocument): Envelope {
  const signers = raw.signers ?? []
  const orders = signers.map((s) => s.order ?? 0)
  const signing: 'parallel' | 'sequential' = new Set(orders).size > 1 ? 'sequential' : 'parallel'
  return {
    id: raw.id,
    externalId: raw.id,
    status: mapStatus(raw),
    subject: pickStr(raw.title) ?? pickStr(raw.name) ?? '',
    senderId: pickStr(raw.sender_id),
    senderEmail: pickStr(raw.sender_email),
    senderName: pickStr(raw.sender_name),
    signingOrder: signing,
    signerIds: signers
      .map((s) => s.id)
      .filter((k): k is string => typeof k === 'string'),
    documentIds: [raw.id],
    templateId: pickStr(raw.template_id),
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.updated_at),
    completedAt: toIso(raw.completed_at),
    voidedAt: toIso(raw.cancelled_at),
    expiresAt: toIso(raw.expires_at),
    platform: 'lealos',
    metadata: strMap(raw.metadata),
    raw,
  }
}
