import type { Signer, SignerRole, SignerStatus } from '../../../schema/signer'
import { pickNum, pickStr, strMap, toIso } from './shared'

/**
 * SignWell recipient — sole signer record. The `delivery_method` field
 * doubles as a role classifier (`embedded`, `email`, `link`).
 */
export interface RawSignWellRecipient {
  id?: string
  email?: string
  name?: string
  status?: string
  message?: string
  signing_order?: number | string
  delivery_method?: string
  role?: string
  decline_reason?: string
  signed_at?: string
  declined_at?: string
  delivered_at?: string
  sent_at?: string
  viewed_at?: string
  ip_address?: string
  [key: string]: unknown
}

function mapRole(role: string | undefined): SignerRole {
  const r = (role ?? '').toLowerCase()
  if (r === 'cc' || r === 'observer') return 'cc'
  if (r === 'approver') return 'approver'
  if (r === 'witness') return 'witness'
  if (r === 'editor') return 'editor'
  if (r === 'in_person_signer') return 'in_person_signer'
  return 'signer'
}

function mapStatus(s: string | undefined): SignerStatus {
  const lower = (s ?? '').toLowerCase()
  if (lower === 'signed' || lower === 'completed') return 'signed'
  if (lower === 'declined') return 'declined'
  if (lower === 'viewed' || lower === 'delivered') return 'delivered'
  if (lower === 'sent') return 'sent'
  return 'created'
}

export function transformSigner(
  raw: RawSignWellRecipient,
  envelopeId: string,
): Signer {
  const externalId = pickStr(raw.id) ?? ''
  return {
    id: `${envelopeId}:${externalId}`,
    externalId,
    envelopeId,
    email: pickStr(raw.email) ?? '',
    name: pickStr(raw.name) ?? '',
    role: mapRole(raw.role),
    status: mapStatus(raw.status),
    routingOrder: pickNum(raw.signing_order),
    sentAt: toIso(raw.sent_at),
    deliveredAt: toIso(raw.delivered_at ?? raw.viewed_at),
    signedAt: toIso(raw.signed_at),
    declinedAt: toIso(raw.declined_at),
    declineReason: pickStr(raw.decline_reason),
    platform: 'signwell',
    metadata: strMap({
      deliveryMethod: raw.delivery_method,
      ipAddress: raw.ip_address,
    }),
    raw,
  }
}
