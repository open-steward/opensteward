import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { epochToIso, pickStr, strMap } from './shared'

export interface RawDropboxSignSignatureRequest {
  signature_request_id: string
  title?: string
  subject?: string
  message?: string
  is_complete?: boolean
  is_declined?: boolean
  has_error?: boolean
  requester_email_address?: string
  signatures?: Array<{
    signature_id: string
    signer_email_address?: string
    signer_name?: string
    order?: number
    status_code?: string
    signed_at?: number
    last_viewed_at?: number
    last_reminded_at?: number
    decline_reason?: string
    error?: string
  }>
  files_url?: string
  signing_url?: string
  details_url?: string
  custom_fields?: Array<{ name: string; value?: string }>
  created_at?: number
  template_ids?: string[]
  expires_at?: number
  signing_options?: { draw?: boolean; type?: boolean; upload?: boolean }
  // Used by us to compute documentIds
  metadata?: Record<string, unknown>
  [key: string]: unknown
}

function mapStatus(raw: RawDropboxSignSignatureRequest): EnvelopeStatus {
  if (raw.is_complete) return 'completed'
  if (raw.is_declined) return 'declined'
  if (raw.has_error) return 'expired'
  const anySent = (raw.signatures ?? []).some((s) => s.status_code === 'awaiting_signature' || s.status_code === 'signed')
  return anySent ? 'sent' : 'draft'
}

function envelopeSigningOrder(raw: RawDropboxSignSignatureRequest): 'parallel' | 'sequential' {
  const orders = (raw.signatures ?? []).map((s) => Number(s.order ?? 0))
  return new Set(orders).size > 1 ? 'sequential' : 'parallel'
}

export function transformEnvelope(raw: RawDropboxSignSignatureRequest): Envelope {
  const sortedSigs = [...(raw.signatures ?? [])].sort(
    (a, b) => Number(a.order ?? 0) - Number(b.order ?? 0),
  )
  return {
    id: raw.signature_request_id,
    externalId: raw.signature_request_id,
    status: mapStatus(raw),
    subject: raw.subject ?? raw.title ?? '',
    message: pickStr(raw.message),
    senderEmail: pickStr(raw.requester_email_address),
    signingOrder: envelopeSigningOrder(raw),
    signerIds: sortedSigs.map((s) => s.signature_id),
    // Dropbox Sign exposes a single zipped file via `files_url`; documents
    // aren't individually addressable on the list endpoint. We surface them
    // as the request id with sub-zero suffix when the detail endpoint is hit.
    documentIds: [],
    templateId: raw.template_ids?.[0],
    createdAt: epochToIso(raw.created_at),
    expiresAt: epochToIso(raw.expires_at),
    completedAt: raw.is_complete ? epochToIso(raw.created_at) : undefined,
    declinedAt: raw.is_declined ? epochToIso(raw.created_at) : undefined,
    platform: 'dropbox-sign',
    metadata: strMap({
      ...(raw.custom_fields ?? []).reduce<Record<string, string>>((acc, f) => {
        if (f.name && f.value != null) acc[f.name] = String(f.value)
        return acc
      }, {}),
      filesUrl: raw.files_url,
      signingUrl: raw.signing_url,
      detailsUrl: raw.details_url,
    }),
    raw,
  }
}
