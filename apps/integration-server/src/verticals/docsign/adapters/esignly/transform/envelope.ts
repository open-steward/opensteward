import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIso } from './shared'

/**
 * eSignly sign request — the platform's envelope-equivalent. A sign request
 * is created from a `template_key` and carries one or more signers
 * (`signer_email[]` / `signer_role[]`). The wire shape is snake_case.
 */
export interface RawEsignlySigner {
  signer_id?: string
  signer_email?: string
  signer_name?: string
  signer_role?: string
  signing_order?: string | number
  status?: string
  sent_at?: string
  viewed_at?: string
  signed_at?: string
  declined_at?: string
  decline_reason?: string
}

export interface RawEsignlyDocumentFile {
  document_id?: string
  doc_id?: string
  name?: string
}

export interface RawEsignlySignRequest {
  document_id?: string
  request_id?: string
  status?: string
  title?: string
  subject?: string
  message?: string
  sender_id?: string
  sender_email?: string
  sender_name?: string
  template_key?: string
  signing_type?: string
  signers?: RawEsignlySigner[]
  documents?: RawEsignlyDocumentFile[]
  created_at?: string
  sent_at?: string
  viewed_at?: string
  completed_at?: string
  declined_at?: string
  cancelled_at?: string
  expires_at?: string
  updated_at?: string
  decline_reason?: string
  cancel_reason?: string
  [key: string]: unknown
}

function mapStatus(raw: string | undefined): EnvelopeStatus {
  const s = (raw ?? '').toLowerCase()
  if (s === 'draft' || s === 'created') return 'draft'
  if (s === 'sent' || s === 'pending' || s === 'in_progress') return 'sent'
  if (s === 'viewed' || s === 'delivered' || s === 'opened') return 'delivered'
  if (s === 'completed' || s === 'signed' || s === 'finished') return 'completed'
  if (s === 'declined' || s === 'rejected') return 'declined'
  if (s === 'cancelled' || s === 'canceled' || s === 'voided') return 'voided'
  if (s === 'expired') return 'expired'
  return 'draft'
}

function signerId(s: RawEsignlySigner): string {
  return pickStr(s.signer_id) ?? pickStr(s.signer_email) ?? ''
}

function signingOrder(raw: RawEsignlySignRequest): 'parallel' | 'sequential' {
  if (pickStr(raw.signing_type)?.toLowerCase() === 'sequential') return 'sequential'
  const orders = (raw.signers ?? [])
    .map((s) => Number(s.signing_order ?? 0))
    .filter((n) => !Number.isNaN(n))
  return new Set(orders).size > 1 ? 'sequential' : 'parallel'
}

export function transformEnvelope(raw: RawEsignlySignRequest): Envelope {
  const id = pickStr(raw.document_id) ?? pickStr(raw.request_id) ?? ''
  const signerIds = (raw.signers ?? [])
    .slice()
    .sort((a, b) => Number(a.signing_order ?? 0) - Number(b.signing_order ?? 0))
    .map(signerId)
    .filter((v) => v.length > 0)
  const documentIds = (raw.documents ?? [])
    .map((d) => pickStr(d.document_id) ?? pickStr(d.doc_id))
    .filter((v): v is string => typeof v === 'string')

  return {
    id,
    externalId: id,
    status: mapStatus(raw.status),
    subject: pickStr(raw.title) ?? pickStr(raw.subject) ?? '',
    message: pickStr(raw.message),
    senderId: pickStr(raw.sender_id),
    senderEmail: pickStr(raw.sender_email),
    senderName: pickStr(raw.sender_name),
    signingOrder: signingOrder(raw),
    signerIds,
    documentIds: documentIds.length > 0 ? documentIds : id ? [id] : [],
    templateId: pickStr(raw.template_key),
    createdAt: toIso(raw.created_at),
    sentAt: toIso(raw.sent_at),
    deliveredAt: toIso(raw.viewed_at),
    completedAt: toIso(raw.completed_at),
    declinedAt: toIso(raw.declined_at),
    voidedAt: toIso(raw.cancelled_at),
    expiresAt: toIso(raw.expires_at),
    updatedAt: toIso(raw.updated_at),
    platform: 'esignly',
    metadata: strMap({
      subject: raw.subject,
      signingType: raw.signing_type,
      declineReason: raw.decline_reason,
      cancelReason: raw.cancel_reason,
    }),
    raw,
  }
}
