import type { Signer, SignerRole, SignerStatus } from '../../../schema/signer'
import { pickNum, pickStr, strMap, toIso } from './shared'

/**
 * A FPT.eContract *recipient* (người ký) on a contract. Recipients carry a
 * role (signer / approver / reviewer / cc), a sign order, a per-recipient
 * status, and the relevant lifecycle timestamps.
 */
export interface RawFptEcontractRecipient {
  id?: string | number
  recipientId?: string | number
  email?: string
  name?: string
  fullName?: string
  phone?: string
  role?: string
  recipientType?: string
  status?: string
  signOrder?: number | string
  order?: number | string
  signType?: string
  sentAt?: string
  sentDate?: string
  viewedAt?: string
  deliveredAt?: string
  signedAt?: string
  signedDate?: string
  rejectedAt?: string
  declinedAt?: string
  rejectReason?: string
  declineReason?: string
  [key: string]: unknown
}

function mapRole(raw: string | undefined): SignerRole {
  const r = (raw ?? '').toLowerCase().replace(/[\s-]+/g, '_')
  if (r === 'signer' || r === 'sign') return 'signer'
  if (r === 'approver' || r === 'approval' || r === 'approve') return 'approver'
  if (r === 'reviewer' || r === 'review' || r === 'editor') return 'editor'
  if (r === 'witness') return 'witness'
  if (r === 'cc' || r === 'carbon_copy' || r === 'receiver' || r === 'observer') return 'cc'
  if (r === 'in_person_signer' || r === 'in_person') return 'in_person_signer'
  return 'signer'
}

function mapStatus(raw: string | undefined): SignerStatus {
  const s = (raw ?? '').toLowerCase().replace(/[\s-]+/g, '_')
  if (s === 'signed' || s === 'completed' || s === 'approved' || s === 'done') return 'signed'
  if (s === 'rejected' || s === 'declined' || s === 'denied') return 'declined'
  if (s === 'viewed' || s === 'opened' || s === 'delivered') return 'delivered'
  if (s === 'sent' || s === 'pending' || s === 'waiting' || s === 'processing') return 'sent'
  return 'created'
}

export function transformSigner(raw: RawFptEcontractRecipient, envelopeId: string): Signer {
  const externalId = pickStr(raw.recipientId ?? raw.id) ?? pickStr(raw.email) ?? ''
  return {
    id: `${envelopeId}:${externalId}`,
    externalId,
    envelopeId,
    email: pickStr(raw.email) ?? '',
    name: pickStr(raw.fullName ?? raw.name) ?? '',
    role: mapRole(raw.role ?? raw.recipientType),
    status: mapStatus(raw.status),
    routingOrder: pickNum(raw.signOrder ?? raw.order),
    sentAt: toIso(raw.sentAt ?? raw.sentDate),
    deliveredAt: toIso(raw.deliveredAt ?? raw.viewedAt),
    signedAt: toIso(raw.signedAt ?? raw.signedDate),
    declinedAt: toIso(raw.rejectedAt ?? raw.declinedAt),
    declineReason: pickStr(raw.rejectReason ?? raw.declineReason),
    platform: 'fpt-econtract',
    metadata: strMap({ phone: raw.phone, signType: raw.signType }),
    raw,
  }
}
