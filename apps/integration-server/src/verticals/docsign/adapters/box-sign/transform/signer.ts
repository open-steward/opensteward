import type { Signer, SignerRole, SignerStatus } from '../../../schema/signer'
import { pickNum, pickStr, strMap, toIso } from './shared'

/**
 * Box Sign signer — one entry of `sign_request.signers[]`. `role` carries
 * the classification; `signer_decision.type` carries the final action.
 */
export interface RawBoxSignSigner {
  id?: number | string
  email?: string
  name?: string
  role?: string
  order?: number | string
  is_in_person?: boolean
  has_viewed_document?: boolean
  has_signed?: boolean
  signer_decision?: {
    type?: 'signed' | 'declined' | string
    finalized_at?: string
    additional_info?: string
  }
  email_sent_at?: string
  delivered_at?: string
  viewed_at?: string
  signed_at?: string
  declined_at?: string
  signer_group_id?: string
  login_required?: boolean
  [key: string]: unknown
}

function mapRole(role: string | undefined, isInPerson: boolean | undefined): SignerRole {
  if (isInPerson) return 'in_person_signer'
  const r = (role ?? '').toLowerCase()
  if (r === 'signer') return 'signer'
  if (r === 'approver') return 'approver'
  if (r === 'final_copy_reader' || r === 'cc' || r === 'reviewer') return 'cc'
  if (r === 'witness') return 'witness'
  return 'signer'
}

function mapStatus(raw: RawBoxSignSigner): SignerStatus {
  if (raw.has_signed) return 'signed'
  if (raw.signer_decision?.type === 'signed') return 'signed'
  if (raw.signer_decision?.type === 'declined') return 'declined'
  if (raw.has_viewed_document || raw.viewed_at || raw.delivered_at) return 'delivered'
  if (raw.email_sent_at) return 'sent'
  return 'created'
}

export function transformSigner(
  raw: RawBoxSignSigner,
  envelopeId: string,
): Signer {
  const externalId = pickStr(raw.id) ?? ''
  return {
    id: `${envelopeId}:${externalId}`,
    externalId,
    envelopeId,
    email: pickStr(raw.email) ?? '',
    name: pickStr(raw.name) ?? '',
    role: mapRole(raw.role, raw.is_in_person),
    status: mapStatus(raw),
    routingOrder: pickNum(raw.order),
    sentAt: toIso(raw.email_sent_at),
    deliveredAt: toIso(raw.viewed_at ?? raw.delivered_at),
    signedAt: toIso(raw.signed_at ?? raw.signer_decision?.finalized_at),
    declinedAt: toIso(raw.declined_at),
    declineReason: pickStr(raw.signer_decision?.additional_info),
    platform: 'box-sign',
    metadata: strMap({
      signerGroupId: raw.signer_group_id,
      loginRequired: raw.login_required,
    }),
    raw,
  }
}
