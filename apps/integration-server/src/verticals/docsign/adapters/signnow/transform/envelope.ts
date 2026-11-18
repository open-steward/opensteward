import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { epochToIso, pickStr, strMap } from './shared'

export interface RawSignNowDocument {
  id: string
  document_name?: string
  page_count?: number
  origin_document_id?: string
  origin_user_id?: string
  created?: string | number
  updated?: string | number
  thumbnail?: unknown
  owner?: string
  owner_email?: string
  is_template?: boolean
  template?: boolean
  template_name?: string
  inviter?: string
  signing_status?: string
  status?: string
  field_invites?: Array<{
    id: string
    email?: string
    status?: string
    signer_id?: string
    role?: string
    order?: number
    created?: string | number
    expiration_time?: string | number
  }>
  requests?: Array<{ id: string; user_id?: string }>
  metadata?: Record<string, unknown>
  [key: string]: unknown
}

function mapStatus(raw: RawSignNowDocument): EnvelopeStatus {
  const s = (raw.signing_status ?? raw.status ?? '').toLowerCase()
  if (s === 'completed' || s === 'signed') return 'completed'
  if (s === 'declined') return 'declined'
  if (s === 'expired') return 'expired'
  if (s === 'voided' || s === 'cancelled' || s === 'canceled') return 'voided'
  if ((raw.field_invites ?? []).length > 0) return 'sent'
  return 'draft'
}

export function transformEnvelope(raw: RawSignNowDocument): Envelope {
  const orders = (raw.field_invites ?? []).map((i) => i.order ?? 0)
  const signing: 'parallel' | 'sequential' = new Set(orders).size > 1 ? 'sequential' : 'parallel'
  return {
    id: raw.id,
    externalId: raw.id,
    status: mapStatus(raw),
    subject: pickStr(raw.document_name) ?? '',
    senderId: pickStr(raw.owner) ?? pickStr(raw.inviter),
    senderEmail: pickStr(raw.owner_email),
    signingOrder: signing,
    signerIds: (raw.field_invites ?? [])
      .map((i) => i.id)
      .filter((s): s is string => typeof s === 'string'),
    documentIds: [raw.id],
    createdAt: epochToIso(raw.created),
    updatedAt: epochToIso(raw.updated),
    platform: 'signnow',
    metadata: strMap(raw.metadata),
    raw,
  }
}
