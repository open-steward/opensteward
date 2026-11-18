import type { Signer, SignerRole, SignerStatus } from '../../../schema/signer'
import { pickNum, pickStr, strMap, toIso } from './shared'

/**
 * A ZorroSign recipient on a document package. ZorroSign distinguishes
 * `role` (signer / approver / cc / viewer) and tracks per-recipient status
 * and timestamps. snake_case on the wire.
 */
export interface RawZorrosignRecipient {
  recipient_id: string
  email?: string
  name?: string
  role?: string
  status?: string
  signing_order?: number
  sent_at?: string
  delivered_at?: string
  viewed_at?: string
  signed_at?: string
  declined_at?: string
  decline_reason?: string
  [key: string]: unknown
}

function mapRole(role: string | undefined): SignerRole {
  switch ((role ?? '').toLowerCase()) {
    case 'signer':
    case 'signee':
      return 'signer'
    case 'approver':
      return 'approver'
    case 'cc':
    case 'carbon_copy':
    case 'viewer':
    case 'observer':
      return 'cc'
    case 'in_person_signer':
    case 'in_person':
      return 'in_person_signer'
    case 'witness':
      return 'witness'
    case 'editor':
      return 'editor'
    default:
      return 'signer'
  }
}

function mapStatus(s: string | undefined): SignerStatus {
  const lower = (s ?? '').toLowerCase()
  if (lower === 'completed' || lower === 'signed' || lower === 'approved') return 'signed'
  if (lower === 'declined' || lower === 'rejected') return 'declined'
  if (lower === 'delivered' || lower === 'viewed' || lower === 'opened') return 'delivered'
  if (lower === 'sent' || lower === 'pending') return 'sent'
  return 'created'
}

export function transformSigner(raw: RawZorrosignRecipient, envelopeId: string): Signer {
  return {
    id: `${envelopeId}:${raw.recipient_id}`,
    externalId: raw.recipient_id,
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
    platform: 'zorrosign',
    metadata: strMap({ role: raw.role, status: raw.status }),
    raw,
  }
}
