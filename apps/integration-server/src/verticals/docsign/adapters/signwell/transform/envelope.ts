import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIso } from './shared'

/**
 * SignWell "document" is the envelope analogue — there is no separate
 * envelopes resource. Recipients are signers; metadata + timestamps live
 * on the document.
 */
export interface RawSignWellRecipient {
  id?: string
  email?: string
  name?: string
  status?: string
  message?: string
  signing_order?: number | string
  delivery_method?: string
  decline_reason?: string
  signed_at?: string
  declined_at?: string
  delivered_at?: string
  sent_at?: string
  [key: string]: unknown
}

export interface RawSignWellDocument {
  id?: string
  name?: string
  subject?: string
  message?: string
  status?: string
  test_mode?: boolean
  embedded_signing?: boolean
  reminders_enabled?: boolean
  with_signature_page?: boolean
  account_id?: string
  api_application_id?: string
  user_id?: string
  user_email?: string
  user_name?: string
  draft?: boolean
  archived?: boolean
  signing_order?: 'parallel' | 'sequential' | string
  number_of_pages?: number | string
  number_of_documents?: number | string
  size?: number | string
  page_count?: number | string
  template_id?: string
  recipients?: RawSignWellRecipient[]
  created_at?: string
  updated_at?: string
  sent_at?: string
  signed_at?: string
  declined_at?: string
  expired_at?: string
  expires_in?: number | string
  expires_at?: string
  cancelled_at?: string
  files?: Array<{ name?: string; file_size?: number; pages?: number }>
  [key: string]: unknown
}

function mapStatus(raw: string | undefined): EnvelopeStatus {
  const s = (raw ?? '').toLowerCase()
  if (s === 'sent') return 'sent'
  if (s === 'completed') return 'completed'
  if (s === 'declined') return 'declined'
  if (s === 'voided' || s === 'cancelled' || s === 'canceled') return 'voided'
  if (s === 'expired') return 'expired'
  if (s === 'draft') return 'draft'
  if (s === 'viewed' || s === 'delivered') return 'delivered'
  return 'draft'
}

export function transformEnvelope(raw: RawSignWellDocument): Envelope {
  const id = pickStr(raw.id) ?? ''
  const recipients = raw.recipients ?? []
  const sortedSigners = [...recipients]
    .map((r) => ({ id: r.id ?? '', order: Number(r.signing_order ?? 0) }))
    .filter((s) => s.id)
    .sort((a, b) => a.order - b.order)
  const orderField = (raw.signing_order ?? '').toString().toLowerCase()
  const orders = recipients.map((r) => Number(r.signing_order ?? 0))
  const signingOrder: 'parallel' | 'sequential' =
    orderField === 'sequential' || new Set(orders).size > 1 ? 'sequential' : 'parallel'

  return {
    id,
    externalId: id,
    status: mapStatus(raw.status),
    subject: pickStr(raw.subject) ?? pickStr(raw.name) ?? '',
    message: pickStr(raw.message),
    senderId: pickStr(raw.user_id),
    senderEmail: pickStr(raw.user_email),
    senderName: pickStr(raw.user_name),
    signingOrder,
    signerIds: sortedSigners.map((s) => s.id),
    documentIds: [id],
    templateId: pickStr(raw.template_id),
    createdAt: toIso(raw.created_at),
    sentAt: toIso(raw.sent_at),
    completedAt: toIso(raw.signed_at),
    declinedAt: toIso(raw.declined_at),
    voidedAt: toIso(raw.cancelled_at),
    expiresAt: toIso(raw.expired_at ?? raw.expires_at),
    updatedAt: toIso(raw.updated_at),
    platform: 'signwell',
    metadata: strMap({
      testMode: raw.test_mode,
      apiApplicationId: raw.api_application_id,
      remindersEnabled: raw.reminders_enabled,
    }),
    raw,
  }
}
