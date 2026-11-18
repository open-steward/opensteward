import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import type { SigningOrder } from '../../../schema/shared'
import { pickStr, strMap, toIso } from './shared'

/**
 * A ZorroSign "document package" — the unit a sender routes for signature.
 * Maps to the canonical Envelope. ZorroSign returns snake_case JSON and
 * tracks per-package status (draft / in_progress / completed / declined /
 * expired / cancelled) plus an embedded recipient and document manifest.
 */
export interface RawZorrosignPackage {
  package_id: string
  title?: string
  message?: string
  status?: string
  sender?: { user_id?: string; email?: string; name?: string }
  sender_email?: string
  sender_name?: string
  template_id?: string
  signing_order?: string
  created_at?: string
  sent_at?: string
  delivered_at?: string
  completed_at?: string
  declined_at?: string
  cancelled_at?: string
  expires_at?: string
  updated_at?: string
  decline_reason?: string
  cancel_reason?: string
  recipients?: Array<{ recipient_id?: string; signing_order?: number }>
  documents?: Array<{ document_id?: string }>
  custom_fields?: Array<{ name?: string; value?: string }>
  [key: string]: unknown
}

function mapStatus(raw: string | undefined): EnvelopeStatus {
  const s = (raw ?? '').toLowerCase()
  if (s === 'draft' || s === 'created') return 'draft'
  if (s === 'sent' || s === 'pending' || s === 'in_progress') return 'sent'
  if (s === 'delivered' || s === 'viewed') return 'delivered'
  if (s === 'completed' || s === 'signed' || s === 'finished') return 'completed'
  if (s === 'declined' || s === 'rejected') return 'declined'
  if (s === 'cancelled' || s === 'canceled' || s === 'voided' || s === 'revoked') return 'voided'
  if (s === 'expired') return 'expired'
  return 'draft'
}

function signingOrderFlag(raw: RawZorrosignPackage): SigningOrder {
  const declared = (raw.signing_order ?? '').toLowerCase()
  if (declared === 'sequential' || declared === 'ordered') return 'sequential'
  if (declared === 'parallel' || declared === 'unordered') return 'parallel'
  const orders = (raw.recipients ?? [])
    .map((r) => r.signing_order)
    .filter((o): o is number => typeof o === 'number')
  if (orders.length === 0) return 'parallel'
  return new Set(orders).size > 1 ? 'sequential' : 'parallel'
}

function recipientIds(raw: RawZorrosignPackage): string[] {
  return (raw.recipients ?? [])
    .map((r) => ({ id: pickStr(r.recipient_id), order: r.signing_order ?? 0 }))
    .filter((r): r is { id: string; order: number } => typeof r.id === 'string')
    .sort((a, b) => a.order - b.order)
    .map((r) => r.id)
}

export function transformEnvelope(raw: RawZorrosignPackage): Envelope {
  return {
    id: raw.package_id,
    externalId: raw.package_id,
    status: mapStatus(raw.status),
    subject: raw.title ?? '',
    message: pickStr(raw.message),
    senderId: pickStr(raw.sender?.user_id),
    senderEmail: pickStr(raw.sender?.email ?? raw.sender_email),
    senderName: pickStr(raw.sender?.name ?? raw.sender_name),
    signingOrder: signingOrderFlag(raw),
    signerIds: recipientIds(raw),
    documentIds: (raw.documents ?? [])
      .map((d) => pickStr(d.document_id))
      .filter((d): d is string => typeof d === 'string'),
    templateId: pickStr(raw.template_id),
    createdAt: toIso(raw.created_at),
    sentAt: toIso(raw.sent_at),
    deliveredAt: toIso(raw.delivered_at),
    completedAt: toIso(raw.completed_at),
    declinedAt: toIso(raw.declined_at),
    voidedAt: toIso(raw.cancelled_at),
    expiresAt: toIso(raw.expires_at),
    updatedAt: toIso(raw.updated_at),
    platform: 'zorrosign',
    metadata: {
      ...strMap(
        Object.fromEntries(
          (raw.custom_fields ?? [])
            .filter((f) => typeof f.name === 'string')
            .map((f) => [f.name as string, f.value ?? '']),
        ),
      ),
      ...(raw.decline_reason ? { declineReason: raw.decline_reason } : {}),
      ...(raw.cancel_reason ? { cancelReason: raw.cancel_reason } : {}),
    },
    raw,
  }
}
