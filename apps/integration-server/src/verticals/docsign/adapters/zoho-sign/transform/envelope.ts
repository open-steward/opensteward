import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIso } from './shared'

/**
 * Zoho Sign's `request` resource. `actions[]` are the signer steps; each
 * step may have multiple `recipients[]` (for in-person signing). The
 * top-level `document_ids[]` is a flat list of document records carried
 * inside the request payload.
 */
export interface RawZohoSignRecipient {
  recipient_id?: string
  recipient_email?: string
  recipient_name?: string
  recipient_phonenumber?: string
  recipient_countrycode?: string
  [key: string]: unknown
}

export interface RawZohoSignAction {
  action_id?: string
  action_type?: string
  recipient_email?: string
  recipient_name?: string
  signing_order?: number | string
  recipient_phonenumber?: string
  recipient_countrycode?: string
  recipients?: RawZohoSignRecipient[]
  is_signing_order_set?: boolean
  [key: string]: unknown
}

export interface RawZohoSignDocumentEntry {
  document_id?: string
  document_name?: string
  document_size?: string | number
  total_pages?: string | number
  document_order?: string | number
  image_string?: string
  [key: string]: unknown
}

export interface RawZohoSignRequest {
  request_id?: string
  request_name?: string
  request_status?: string
  request_type_name?: string
  request_subject?: string
  notes?: string
  description?: string
  owner_id?: string
  owner_email?: string
  owner_first_name?: string
  owner_last_name?: string
  created_time?: number | string
  modified_time?: number | string
  action_time?: number | string
  expiration_days?: number | string
  expire_by?: number | string
  sent_time?: number | string
  delivered_time?: number | string
  completed_time?: number | string
  declined_time?: number | string
  recalled_time?: number | string
  is_sequential?: boolean
  is_signing_order_set?: boolean
  templates_used?: string
  template_id?: string
  actions?: RawZohoSignAction[]
  document_ids?: RawZohoSignDocumentEntry[]
  [key: string]: unknown
}

function mapStatus(raw: string | undefined): EnvelopeStatus {
  const s = (raw ?? '').toLowerCase()
  if (s === 'inprogress' || s === 'in_progress') return 'sent'
  if (s === 'completed' || s === 'signed') return 'completed'
  if (s === 'declined' || s === 'rejected') return 'declined'
  if (s === 'expired') return 'expired'
  if (s === 'recalled' || s === 'voided') return 'voided'
  if (s === 'draft') return 'draft'
  return 'draft'
}

function envelopeSignerIds(raw: RawZohoSignRequest): string[] {
  const out: Array<{ id: string; order: number }> = []
  for (const a of raw.actions ?? []) {
    const order = Number(a.signing_order ?? 0)
    if (a.action_id) out.push({ id: a.action_id, order })
    for (const r of a.recipients ?? []) {
      if (r.recipient_id) out.push({ id: r.recipient_id, order })
    }
  }
  return out.sort((a, b) => a.order - b.order).map((x) => x.id)
}

function signingOrder(raw: RawZohoSignRequest): 'parallel' | 'sequential' {
  if (raw.is_sequential === true) return 'sequential'
  if (raw.is_signing_order_set === true) return 'sequential'
  const orders = (raw.actions ?? []).map((a) => Number(a.signing_order ?? 0))
  if (orders.length === 0) return 'parallel'
  return new Set(orders).size > 1 ? 'sequential' : 'parallel'
}

export function transformEnvelope(raw: RawZohoSignRequest): Envelope {
  const id = pickStr(raw.request_id) ?? ''
  const senderName = [pickStr(raw.owner_first_name), pickStr(raw.owner_last_name)]
    .filter(Boolean)
    .join(' ')
    .trim()
  return {
    id,
    externalId: id,
    status: mapStatus(raw.request_status),
    subject: pickStr(raw.request_subject) ?? pickStr(raw.request_name) ?? '',
    message: pickStr(raw.notes) ?? pickStr(raw.description),
    senderId: pickStr(raw.owner_id),
    senderEmail: pickStr(raw.owner_email),
    senderName: senderName || undefined,
    signingOrder: signingOrder(raw),
    signerIds: envelopeSignerIds(raw),
    documentIds: (raw.document_ids ?? [])
      .map((d) => pickStr(d.document_id))
      .filter((s): s is string => !!s),
    templateId: pickStr(raw.template_id),
    createdAt: toIso(raw.created_time),
    sentAt: toIso(raw.sent_time),
    deliveredAt: toIso(raw.delivered_time),
    completedAt: toIso(raw.completed_time),
    declinedAt: toIso(raw.declined_time),
    voidedAt: toIso(raw.recalled_time),
    expiresAt: toIso(raw.expire_by),
    updatedAt: toIso(raw.modified_time ?? raw.action_time),
    platform: 'zoho-sign',
    metadata: strMap({
      requestTypeName: raw.request_type_name,
      templatesUsed: raw.templates_used,
    }),
    raw,
  }
}
