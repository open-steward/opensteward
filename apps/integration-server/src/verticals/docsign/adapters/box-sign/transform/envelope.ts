import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIso } from './shared'

/**
 * Box Sign "sign_request" — the envelope analogue. `signers[]` carries
 * recipients; `source_files[]` carries inputs (folder/files in the user's
 * Box drive that are stitched into the signed PDF).
 */
export interface RawBoxSignSigner {
  id?: number | string
  email?: string
  name?: string
  role?: string
  order?: number | string
  is_in_person?: boolean
  embed_url_external_user_id?: string
  has_viewed_document?: boolean
  has_signed?: boolean
  signer_decision?: { type?: string; finalized_at?: string; additional_info?: string }
  inputs?: Array<unknown>
  signer_group_id?: string
  iframeable_embed_url?: string
  redirect_url?: string
  decline_redirect_url?: string
  login_required?: boolean
  password?: string
  signed_at?: string
  declined_at?: string
  email_sent_at?: string
  delivered_at?: string
  viewed_at?: string
  [key: string]: unknown
}

export interface RawBoxSignSourceFile {
  type?: 'file'
  id?: string
  name?: string
  size?: number | string
  [key: string]: unknown
}

export interface RawBoxSignRequest {
  id?: string
  type?: 'sign-request'
  status?: string
  is_document_preparation_needed?: boolean
  redirect_url?: string
  declined_redirect_url?: string
  prefill_tags?: Array<unknown>
  days_valid?: number
  external_id?: string
  is_phone_verification_required_to_view?: boolean
  email_subject?: string
  email_message?: string
  reminders_enabled?: boolean
  prepare_url?: string
  signing_log?: { id?: string; type?: string }
  signers?: RawBoxSignSigner[]
  source_files?: RawBoxSignSourceFile[]
  parent_folder?: { type?: string; id?: string; name?: string }
  sign_files?: { files?: RawBoxSignSourceFile[]; is_ready_for_download?: boolean }
  signed_documents?: Array<{ id?: string }>
  template_id?: string
  created_at?: string
  modified_at?: string
  expired_at?: string
  is_signature_collected?: boolean
  is_signature_collected_at?: string
  sender_email?: string
  sender_id?: string
  [key: string]: unknown
}

function mapStatus(raw: string | undefined): EnvelopeStatus {
  const s = (raw ?? '').toLowerCase()
  if (s === 'created' || s === 'converting' || s === 'pending') return 'draft'
  if (s === 'sent') return 'sent'
  if (s === 'viewed') return 'delivered'
  if (s === 'signed') return 'completed'
  if (s === 'declined') return 'declined'
  if (s === 'cancelled' || s === 'canceled') return 'voided'
  if (s === 'expired') return 'expired'
  if (s.startsWith('error_')) return 'expired'
  return 'draft'
}

export function transformEnvelope(raw: RawBoxSignRequest): Envelope {
  const id = pickStr(raw.id) ?? ''
  const signers = raw.signers ?? []
  const sortedSigners = [...signers]
    .map((s) => ({ id: pickStr(s.id) ?? '', order: Number(s.order ?? 0) }))
    .filter((s) => s.id)
    .sort((a, b) => a.order - b.order)
  const orders = signers.map((s) => Number(s.order ?? 0))
  const signingOrder: 'parallel' | 'sequential' =
    new Set(orders).size > 1 ? 'sequential' : 'parallel'

  return {
    id,
    externalId: id,
    status: mapStatus(raw.status),
    subject: pickStr(raw.email_subject) ?? '',
    message: pickStr(raw.email_message),
    senderId: pickStr(raw.sender_id),
    senderEmail: pickStr(raw.sender_email),
    senderName: undefined,
    signingOrder,
    signerIds: sortedSigners.map((s) => s.id),
    documentIds: (raw.source_files ?? [])
      .map((f) => pickStr(f.id))
      .filter((s): s is string => !!s),
    templateId: pickStr(raw.template_id),
    createdAt: toIso(raw.created_at),
    completedAt: toIso(raw.is_signature_collected_at),
    expiresAt: toIso(raw.expired_at),
    updatedAt: toIso(raw.modified_at),
    platform: 'box-sign',
    metadata: strMap({
      parentFolderId: raw.parent_folder?.id,
      remindersEnabled: raw.reminders_enabled,
      externalId: raw.external_id,
    }),
    raw,
  }
}
