import type { Signer, SignerRole, SignerStatus } from '../../../schema/signer'
import { pickNum, pickStr, strMap, toIso } from './shared'

/**
 * Shape of a recipient/signer item as returned inside
 * GET /api/v2/envelopes/{envelopeId}/details under `recipients.signers`.
 */
export interface RawJsignSigner {
  id?: string
  name?: string
  email?: string
  phone_number?: string
  country_code?: number
  signing_order?: number
  status?: string
  signed_at?: string
  declined_at?: string
  decline_reason?: string
  sent_at?: string
  viewed_at?: string
  /** signer_title comes from template-based envelopes */
  signer_title?: string
  private_note?: string
  [key: string]: unknown
}

function mapRole(raw: RawJsignSigner): SignerRole {
  const title = (raw.signer_title ?? '').toLowerCase()
  if (title.includes('observer') || title.includes('cc')) return 'cc'
  if (title.includes('witness')) return 'witness'
  if (title.includes('approver')) return 'approver'
  return 'signer'
}

function mapStatus(s: string | undefined): SignerStatus {
  const lower = (s ?? '').toLowerCase()
  if (lower === 'completed' || lower === 'signed') return 'signed'
  if (lower === 'declined') return 'declined'
  if (lower === 'delivered' || lower === 'viewed') return 'delivered'
  if (lower === 'sent') return 'sent'
  return 'created'
}

export function transformSigner(
  raw: RawJsignSigner,
  envelopeId: string,
): Signer {
  const id = pickStr(raw.id) ?? `${envelopeId}:${raw.email ?? ''}`
  return {
    id,
    externalId: pickStr(raw.id) ?? pickStr(raw.email) ?? '',
    envelopeId,
    email: pickStr(raw.email) ?? '',
    name: pickStr(raw.name) ?? '',
    role: mapRole(raw),
    status: mapStatus(raw.status),
    routingOrder: pickNum(raw.signing_order),
    sentAt: toIso(raw.sent_at),
    deliveredAt: toIso(raw.viewed_at),
    signedAt: toIso(raw.signed_at),
    declinedAt: toIso(raw.declined_at),
    declineReason: pickStr(raw.decline_reason),
    platform: 'jsign',
    metadata: strMap({
      signer_title: raw.signer_title,
      phone_number: raw.phone_number,
    }),
    raw,
  }
}
