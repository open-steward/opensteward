import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import type { RawEversignSigner } from './signer'
import { pickStr, strMap, toIso } from './shared'

/**
 * eversign treats a "document" as the envelope-equivalent. We re-use the
 * canonical Envelope shape and map eversign's integer status field.
 */
export interface RawEversignDocument {
  document_hash: string
  documentHash?: string
  title?: string
  message?: string
  status?: number | string
  is_draft?: number | boolean
  is_completed?: number | boolean
  is_declined?: number | boolean
  is_voided?: number | boolean
  is_expired?: number | boolean
  is_cancelled?: number | boolean
  embedded_signing_enabled?: number | boolean
  use_signer_order?: number | boolean
  signer?: { id?: number; email?: string; name?: string }
  client?: string
  sender?: { id?: string | number; email?: string; name?: string }
  /** Embedded eversign signer rows — the same shape `transformSigner` consumes. */
  signers?: RawEversignSigner[]
  files?: Array<{ name?: string; file_id?: string | number; file_url?: string }>
  template_id?: string
  custom_requester_email?: string
  custom_requester_name?: string
  created_at?: number | string
  updated_at?: number | string
  sent_at?: number | string
  completed_at?: number | string
  declined_at?: number | string
  voided_at?: number | string
  expires?: number | string
  expiration_date?: number | string
  meta?: Record<string, unknown>
  [key: string]: unknown
}

function mapStatus(raw: RawEversignDocument): EnvelopeStatus {
  // The eversign list endpoint returns explicit booleans/ints per terminal
  // state; the `type` filter encodes the same information. We honour
  // `is_*` first, then fall back to the numeric `status` field.
  if (raw.is_voided || raw.is_cancelled) return 'voided'
  if (raw.is_expired) return 'expired'
  if (raw.is_declined) return 'declined'
  if (raw.is_completed) return 'completed'
  if (raw.is_draft) return 'draft'
  const s = typeof raw.status === 'string' ? Number(raw.status) : raw.status
  if (typeof s === 'number') {
    if (s === 0) return 'draft'
    if (s === 1) return 'sent'
    if (s === 2) return 'completed'
    if (s === -1) return 'declined'
    if (s === -2) return 'expired'
    if (s === -3) return 'voided'
  }
  return 'sent'
}

export function transformEnvelope(raw: RawEversignDocument): Envelope {
  const id = pickStr(raw.document_hash) ?? pickStr(raw.documentHash) ?? ''
  const signers = raw.signers ?? []
  const orders = signers
    .map((s) => Number(s.routing_order ?? 0))
    .filter((n) => Number.isFinite(n))
  const signingOrder: 'parallel' | 'sequential' =
    raw.use_signer_order || (orders.length > 0 && new Set(orders).size > 1)
      ? 'sequential'
      : 'parallel'
  return {
    id,
    externalId: id,
    status: mapStatus(raw),
    subject: pickStr(raw.title) ?? '',
    message: pickStr(raw.message),
    senderId: pickStr(raw.sender?.id),
    senderEmail: pickStr(raw.sender?.email ?? raw.custom_requester_email),
    senderName: pickStr(raw.sender?.name ?? raw.custom_requester_name),
    signingOrder,
    signerIds: signers
      .map((s) => pickStr(s.id ?? s.signer_id))
      .filter((s): s is string => Boolean(s)),
    documentIds: (raw.files ?? [])
      .map((f) => pickStr(f.file_id))
      .filter((s): s is string => Boolean(s)),
    templateId: pickStr(raw.template_id),
    createdAt: toIso(raw.created_at),
    sentAt: toIso(raw.sent_at),
    deliveredAt: undefined,
    completedAt: toIso(raw.completed_at),
    declinedAt: toIso(raw.declined_at),
    voidedAt: toIso(raw.voided_at),
    expiresAt: toIso(raw.expires ?? raw.expiration_date),
    updatedAt: toIso(raw.updated_at),
    platform: 'eversign',
    metadata: strMap({
      ...(raw.meta ?? {}),
      client: raw.client,
    }),
    raw,
  }
}
