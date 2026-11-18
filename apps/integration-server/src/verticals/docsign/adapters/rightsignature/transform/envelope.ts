import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIso } from './shared'

export interface RawRightSignatureDocument {
  id: string
  document_id?: string
  name?: string
  subject?: string
  message?: string
  status?: string
  state?: string
  sender?: { id?: string; email?: string; name?: string }
  sender_email?: string
  sender_name?: string
  signing_type?: string
  signing_order?: string
  signers?: Array<{ id?: string; signer_id?: string; signing_order?: number | string }>
  recipients?: Array<{ id?: string; recipient_id?: string; signing_order?: number | string }>
  template_id?: string
  source_template_id?: string
  created_at?: string
  sent_at?: string
  viewed_at?: string
  executed_at?: string
  completed_at?: string
  declined_at?: string
  voided_at?: string
  cancelled_at?: string
  expires_on?: string
  expires_at?: string
  updated_at?: string
  void_reason?: string
  decline_reason?: string
  tags?: Record<string, string> | Array<{ name?: string; value?: string }>
  [key: string]: unknown
}

function mapStatus(raw: string | undefined): EnvelopeStatus {
  const s = (raw ?? '').toLowerCase()
  if (s === 'draft') return 'draft'
  if (s === 'pending' || s === 'sent' || s === 'pending_signature') return 'sent'
  if (s === 'viewed') return 'delivered'
  if (s === 'executed' || s === 'completed' || s === 'signed') return 'completed'
  if (s === 'voided' || s === 'cancelled' || s === 'canceled') return 'voided'
  if (s === 'expired') return 'expired'
  if (s === 'declined') return 'declined'
  return 'draft'
}

function tagsToMap(
  tags: RawRightSignatureDocument['tags'],
): Record<string, string> {
  if (!tags) return {}
  if (Array.isArray(tags)) {
    const out: Record<string, string> = {}
    for (const t of tags) {
      if (t && typeof t.name === 'string') out[t.name] = String(t.value ?? '')
    }
    return out
  }
  return strMap(tags)
}

export function transformEnvelope(raw: RawRightSignatureDocument): Envelope {
  const id = pickStr(raw.id) ?? pickStr(raw.document_id) ?? ''
  // RightSignature documents come back with either `signers[]` or
  // `recipients[]`. We project both keys when present so downstream
  // consumers don't have to care which shape the API returned.
  type LooseSigner = {
    id?: string
    signer_id?: string
    recipient_id?: string
    signing_order?: number | string
  }
  const rawSigners: LooseSigner[] = (raw.signers ?? raw.recipients ?? []) as LooseSigner[]
  const signerEntries = rawSigners
    .map((s) => ({
      id: pickStr(s.id ?? s.signer_id ?? s.recipient_id),
      order: Number(s.signing_order ?? 0),
    }))
    .filter((e): e is { id: string; order: number } => Boolean(e.id))
  const orders = signerEntries.map((s) => s.order).filter((n) => Number.isFinite(n))
  const explicitOrder = (raw.signing_order ?? raw.signing_type ?? '').toLowerCase()
  const signingOrder: 'parallel' | 'sequential' =
    explicitOrder === 'sequential'
      ? 'sequential'
      : explicitOrder === 'parallel'
        ? 'parallel'
        : orders.length > 0 && new Set(orders).size > 1
          ? 'sequential'
          : 'parallel'
  return {
    id,
    externalId: id,
    status: mapStatus(raw.status ?? raw.state),
    subject: pickStr(raw.subject) ?? pickStr(raw.name) ?? '',
    message: pickStr(raw.message),
    senderId: pickStr(raw.sender?.id),
    senderEmail: pickStr(raw.sender?.email ?? raw.sender_email),
    senderName: pickStr(raw.sender?.name ?? raw.sender_name),
    signingOrder,
    signerIds: signerEntries
      .sort((a, b) => a.order - b.order)
      .map((s) => s.id),
    documentIds: [id],
    templateId: pickStr(raw.template_id ?? raw.source_template_id),
    createdAt: toIso(raw.created_at),
    sentAt: toIso(raw.sent_at),
    deliveredAt: toIso(raw.viewed_at),
    completedAt: toIso(raw.executed_at ?? raw.completed_at),
    declinedAt: toIso(raw.declined_at),
    voidedAt: toIso(raw.voided_at ?? raw.cancelled_at),
    expiresAt: toIso(raw.expires_on ?? raw.expires_at),
    updatedAt: toIso(raw.updated_at),
    platform: 'rightsignature',
    metadata: {
      ...tagsToMap(raw.tags),
      ...(raw.void_reason ? { void_reason: String(raw.void_reason) } : {}),
      ...(raw.decline_reason ? { decline_reason: String(raw.decline_reason) } : {}),
    },
    raw,
  }
}
