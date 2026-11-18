import type { Signer, SignerRole, SignerStatus } from '../../../schema/signer'
import { pickNum, pickStr, strMap, toIso } from './shared'

/**
 * GetAccept recipient — one entry of `document.recipients[]`.
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
  is_signer?: boolean
  decline_reason?: string
  sent_at?: string
  viewed_at?: string
  signed_at?: string
  delivered_at?: string
  declined_at?: string
  thumb_url?: string
  ip_address?: string
  [key: string]: unknown
}

function mapRole(role: string | undefined, isSigner: boolean | undefined): SignerRole {
  const r = (role ?? '').toLowerCase()
  if (r === 'signer' || isSigner) return 'signer'
  if (r === 'cc' || r === 'observer' || r === 'reviewer') return 'cc'
  if (r === 'approver') return 'approver'
  if (r === 'witness') return 'witness'
  if (r === 'editor') return 'editor'
  return 'signer'
}

function mapStatus(s: string | undefined): SignerStatus {
  const lower = (s ?? '').toLowerCase()
  if (lower === 'signed' || lower === 'completed' || lower === 'approved') return 'signed'
  if (lower === 'declined' || lower === 'rejected') return 'declined'
  if (lower === 'reviewed' || lower === 'viewed' || lower === 'opened' || lower === 'delivered')
    return 'delivered'
  if (lower === 'sent') return 'sent'
  return 'created'
}

export function transformSigner(
  raw: RawGetAcceptRecipient,
  envelopeId: string,
): Signer {
  const externalId = pickStr(raw.id) ?? ''
  const name =
    pickStr(raw.full_name) ??
    [pickStr(raw.first_name), pickStr(raw.last_name)].filter(Boolean).join(' ').trim()
  return {
    id: `${envelopeId}:${externalId}`,
    externalId,
    envelopeId,
    email: pickStr(raw.email) ?? '',
    name,
    role: mapRole(raw.role, raw.is_signer),
    status: mapStatus(raw.status),
    routingOrder: pickNum(raw.signing_order ?? raw.order_num),
    sentAt: toIso(raw.sent_at),
    deliveredAt: toIso(raw.delivered_at ?? raw.viewed_at),
    signedAt: toIso(raw.signed_at),
    declinedAt: toIso(raw.declined_at),
    declineReason: pickStr(raw.decline_reason),
    platform: 'getaccept',
    metadata: strMap({
      ipAddress: raw.ip_address,
    }),
    raw,
  }
}
