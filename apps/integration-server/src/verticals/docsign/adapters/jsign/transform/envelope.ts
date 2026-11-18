import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIso } from './shared'

/**
 * Shape returned by GET /api/v2/envelopes/{envelopeId}/details and the
 * items array inside POST /api/v2/envelopes/list.
 *
 * jSign uses snake_case field names and its internal codebase is named
 * "Cygnature" (a Consensus Cloud Solutions product). IDs are UUIDs.
 * Status values observed: draft, sent, completed, declined, cancelled,
 * expired, voided.
 */
export interface RawJsignEnvelope {
  id?: string
  envelope_id?: string
  name?: string
  description?: string
  status?: string
  /** SigningFlowType: 0=sequential, 1=parallel, 2=other */
  sign_process_flow?: number
  created_at?: string
  sent_at?: string
  updated_at?: string
  completed_at?: string
  declined_at?: string
  cancelled_at?: string
  expired_at?: string
  due_date?: string
  expiration_days?: number
  categories?: string[]
  sender?: { id?: string; email?: string; name?: string }
  recipients?: {
    signers?: Array<{ id?: string; email?: string; name?: string; signing_order?: number }>
    observers?: Array<{ id?: string; email?: string; name?: string }>
  }
  documents?: Array<{ id?: string; name?: string }>
  template_id?: string
  cancel_reason?: string
  decline_reason?: string
  [key: string]: unknown
}

function mapStatus(raw: string | undefined): EnvelopeStatus {
  const s = (raw ?? '').toLowerCase()
  if (s === 'draft') return 'draft'
  if (s === 'sent' || s === 'in_progress' || s === 'inprogress') return 'sent'
  if (s === 'delivered') return 'delivered'
  if (s === 'completed' || s === 'signed') return 'completed'
  if (s === 'declined') return 'declined'
  if (s === 'cancelled' || s === 'canceled' || s === 'voided') return 'voided'
  if (s === 'expired') return 'expired'
  return 'draft'
}

function envelopeSignerIds(raw: RawJsignEnvelope): string[] {
  const signers = raw.recipients?.signers ?? []
  return signers
    .slice()
    .sort((a, b) => (a.signing_order ?? 0) - (b.signing_order ?? 0))
    .map((s) => s.id ?? s.email ?? '')
    .filter((id) => id.length > 0)
}

function signingOrder(raw: RawJsignEnvelope): 'parallel' | 'sequential' {
  // sign_process_flow: 0=sequential, 1=parallel
  if (raw.sign_process_flow === 0) return 'sequential'
  if (raw.sign_process_flow === 1) return 'parallel'
  // fall back to inspecting signing_order values
  const orders = (raw.recipients?.signers ?? []).map((s) => s.signing_order ?? 0)
  if (orders.length === 0) return 'parallel'
  const uniq = new Set(orders)
  return uniq.size > 1 ? 'sequential' : 'parallel'
}

export function transformEnvelope(raw: RawJsignEnvelope): Envelope {
  const id = pickStr(raw.id ?? raw.envelope_id) ?? ''
  return {
    id,
    externalId: id,
    status: mapStatus(raw.status),
    subject: pickStr(raw.name) ?? '',
    message: pickStr(raw.description),
    senderId: pickStr(raw.sender?.id),
    senderEmail: pickStr(raw.sender?.email),
    senderName: pickStr(raw.sender?.name),
    signingOrder: signingOrder(raw),
    signerIds: envelopeSignerIds(raw),
    documentIds: (raw.documents ?? []).map((d) => d.id ?? '').filter((x) => x.length > 0),
    templateId: pickStr(raw.template_id),
    createdAt: toIso(raw.created_at),
    sentAt: toIso(raw.sent_at),
    deliveredAt: undefined,
    completedAt: toIso(raw.completed_at),
    declinedAt: toIso(raw.declined_at),
    voidedAt: toIso(raw.cancelled_at),
    expiresAt: toIso(raw.due_date ?? raw.expired_at),
    updatedAt: toIso(raw.updated_at ?? raw.created_at),
    platform: 'jsign',
    metadata: strMap({
      categories: Array.isArray(raw.categories) ? raw.categories.join(',') : undefined,
      cancel_reason: raw.cancel_reason,
      decline_reason: raw.decline_reason,
    }),
    raw,
  }
}
