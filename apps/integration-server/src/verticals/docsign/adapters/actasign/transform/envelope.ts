import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIso } from './shared'

/**
 * actaSIGN signing process → canonical Envelope.
 *
 * A signing process bundles one or more documents, an ordered set of
 * signatories, and an audit trail. `signing_mode` is `sequential` or
 * `parallel`. `signature_level` is the eIDAS/ZertES assurance level
 * (`SES` / `AES` / `QES`).
 */
export interface RawActasignSignatory {
  id: string
  order?: number
  email?: string
  name?: string
  [key: string]: unknown
}

export interface RawActasignSigningProcess {
  id: string
  status?: string
  title?: string
  subject?: string
  message?: string
  signing_mode?: string
  signature_level?: string
  creator?: { id?: string; email?: string; name?: string }
  template_id?: string
  signatories?: RawActasignSignatory[]
  documents?: Array<{ id: string }>
  created_at?: string
  sent_at?: string
  viewed_at?: string
  completed_at?: string
  rejected_at?: string
  cancelled_at?: string
  expires_at?: string
  updated_at?: string
  reject_reason?: string
  metadata?: Record<string, unknown>
  [key: string]: unknown
}

function mapStatus(raw: string | undefined): EnvelopeStatus {
  switch ((raw ?? '').toLowerCase()) {
    case 'draft':
      return 'draft'
    case 'pending':
    case 'sent':
    case 'in_progress':
      return 'sent'
    case 'viewed':
      return 'delivered'
    case 'completed':
    case 'signed':
      return 'completed'
    case 'rejected':
    case 'declined':
      return 'declined'
    case 'cancelled':
    case 'canceled':
    case 'voided':
      return 'voided'
    case 'expired':
      return 'expired'
    default:
      return 'draft'
  }
}

function signingOrder(raw: RawActasignSigningProcess): 'parallel' | 'sequential' {
  const mode = (raw.signing_mode ?? '').toLowerCase()
  if (mode === 'sequential' || mode === 'parallel') return mode
  const orders = (raw.signatories ?? []).map((s) => Number(s.order ?? 0))
  return new Set(orders).size > 1 ? 'sequential' : 'parallel'
}

export function transformEnvelope(raw: RawActasignSigningProcess): Envelope {
  const signatories = [...(raw.signatories ?? [])].sort(
    (a, b) => Number(a.order ?? 0) - Number(b.order ?? 0),
  )
  return {
    id: raw.id,
    externalId: raw.id,
    status: mapStatus(raw.status),
    subject: raw.subject ?? raw.title ?? '',
    message: pickStr(raw.message),
    senderId: pickStr(raw.creator?.id),
    senderEmail: pickStr(raw.creator?.email),
    senderName: pickStr(raw.creator?.name),
    signingOrder: signingOrder(raw),
    signerIds: signatories.map((s) => s.id),
    documentIds: (raw.documents ?? []).map((d) => d.id),
    templateId: pickStr(raw.template_id),
    createdAt: toIso(raw.created_at),
    sentAt: toIso(raw.sent_at),
    deliveredAt: toIso(raw.viewed_at),
    completedAt: toIso(raw.completed_at),
    declinedAt: toIso(raw.rejected_at),
    voidedAt: toIso(raw.cancelled_at),
    expiresAt: toIso(raw.expires_at),
    updatedAt: toIso(raw.updated_at),
    platform: 'actasign',
    metadata: strMap({
      ...(raw.metadata ?? {}),
      signatureLevel: raw.signature_level,
      signingMode: raw.signing_mode,
      rejectReason: raw.reject_reason,
    }),
    raw,
  }
}
