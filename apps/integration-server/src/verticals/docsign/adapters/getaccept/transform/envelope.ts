import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIso } from './shared'

/**
 * GetAccept "document" is the envelope analogue. Recipients are signers;
 * documents are single-document-per-envelope (the envelope IS the doc).
 */
export interface RawGetAcceptRecipient {
  id?: string
  email?: string
  first_name?: string
  last_name?: string
  full_name?: string
  status?: string
  role?: string
  signing_order?: number | string
  order_num?: number | string
  signed?: boolean
  thumb_url?: string
  is_signer?: boolean
  decline_reason?: string
  sent_at?: string
  viewed_at?: string
  signed_at?: string
  delivered_at?: string
  declined_at?: string
  [key: string]: unknown
}

export interface RawGetAcceptDocument {
  id?: string
  name?: string
  status?: string
  type?: string
  external_id?: string
  page_count?: number | string
  template_id?: string
  document_total_pages?: number | string
  description?: string
  email_send_subject?: string
  email_send_message?: string
  is_signing?: boolean
  is_sales?: boolean
  is_chat_active?: boolean
  is_template?: boolean
  sender?: {
    id?: string
    email?: string
    first_name?: string
    last_name?: string
    full_name?: string
  }
  recipients?: RawGetAcceptRecipient[]
  created_at?: string
  modified_at?: string
  send_date?: string
  sent_at?: string
  signed_at?: string
  rejected_at?: string
  expires_at?: string
  reviewed_at?: string
  recalled_at?: string
  is_signing_order?: boolean
  signing_order_type?: string
  size?: number | string
  [key: string]: unknown
}

function mapStatus(raw: string | undefined): EnvelopeStatus {
  const s = (raw ?? '').toLowerCase()
  if (s === 'draft') return 'draft'
  if (s === 'sent' || s === 'started') return 'sent'
  if (s === 'signed' || s === 'approved' || s === 'completed') return 'completed'
  if (s === 'rejected' || s === 'declined') return 'declined'
  if (s === 'expired') return 'expired'
  if (s === 'recalled' || s === 'voided' || s === 'cancelled' || s === 'canceled') return 'voided'
  if (s === 'reviewed' || s === 'viewed' || s === 'opened') return 'delivered'
  return 'draft'
}

export function transformEnvelope(raw: RawGetAcceptDocument): Envelope {
  const id = pickStr(raw.id) ?? ''
  const senderName =
    pickStr(raw.sender?.full_name) ??
    [pickStr(raw.sender?.first_name), pickStr(raw.sender?.last_name)]
      .filter(Boolean)
      .join(' ')
      .trim()
  const recipients = raw.recipients ?? []
  const sortedSigners = [...recipients]
    .map((r) => ({
      id: pickStr(r.id) ?? '',
      order: Number(r.signing_order ?? r.order_num ?? 0),
    }))
    .filter((r) => r.id)
    .sort((a, b) => a.order - b.order)
  const orders = recipients.map((r) => Number(r.signing_order ?? r.order_num ?? 0))
  const signingOrder: 'parallel' | 'sequential' =
    raw.is_signing_order === true || new Set(orders).size > 1 ? 'sequential' : 'parallel'

  return {
    id,
    externalId: id,
    status: mapStatus(raw.status),
    subject: pickStr(raw.email_send_subject) ?? pickStr(raw.name) ?? '',
    message: pickStr(raw.email_send_message) ?? pickStr(raw.description),
    senderId: pickStr(raw.sender?.id),
    senderEmail: pickStr(raw.sender?.email),
    senderName: senderName || undefined,
    signingOrder,
    signerIds: sortedSigners.map((s) => s.id),
    documentIds: [id],
    templateId: pickStr(raw.template_id),
    createdAt: toIso(raw.created_at),
    sentAt: toIso(raw.sent_at ?? raw.send_date),
    deliveredAt: toIso(raw.reviewed_at),
    completedAt: toIso(raw.signed_at),
    declinedAt: toIso(raw.rejected_at),
    voidedAt: toIso(raw.recalled_at),
    expiresAt: toIso(raw.expires_at),
    updatedAt: toIso(raw.modified_at),
    platform: 'getaccept',
    metadata: strMap({
      type: raw.type,
      isSales: raw.is_sales,
      isSigning: raw.is_signing,
      externalId: raw.external_id,
    }),
    raw,
  }
}
