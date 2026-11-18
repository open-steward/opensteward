import type { Signer, SignerRole, SignerStatus } from '../../../schema/signer'
import { pickStr, strMap, toIso } from './shared'

/**
 * Conga Sign recipient. The signconnector `packageRecipients` array and the
 * OneSpan `roles[].signers` array both surface here; `role` / `signingOrder`
 * are folded in from the enclosing role when present.
 */
export interface RawCongaSignRecipient {
  id?: string
  email?: string
  firstName?: string
  lastName?: string
  name?: string
  company?: string
  status?: string
  role?: string
  signingOrder?: number
  index?: number
  signedOn?: string
  signedDate?: string
  declinedOn?: string
  declineReason?: string
  deliveredOn?: string
  sentOn?: string
  [key: string]: unknown
}

function mapRole(s: string | undefined): SignerRole {
  switch ((s ?? '').toUpperCase()) {
    case 'SIGNER':
      return 'signer'
    case 'CC':
    case 'REVIEWER':
      return 'cc'
    case 'IN_PERSON':
    case 'IN_PERSON_SIGNER':
      return 'in_person_signer'
    case 'WITNESS':
      return 'witness'
    case 'EDITOR':
      return 'editor'
    case 'APPROVER':
      return 'approver'
    default:
      return 'signer'
  }
}

function mapStatus(s: string | undefined): SignerStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'SIGNED':
    case 'COMPLETED':
    case 'COMPLETE':
      return 'signed'
    case 'DECLINED':
      return 'declined'
    case 'DELIVERED':
    case 'VIEWED':
    case 'OPENED':
      return 'delivered'
    case 'SENT':
    case 'ACTIVE':
      return 'sent'
    case 'OPTED_OUT':
      return 'auto_responded'
    default:
      return 'created'
  }
}

function fullName(raw: RawCongaSignRecipient): string {
  if (pickStr(raw.name)) return raw.name as string
  const joined = `${raw.firstName ?? ''} ${raw.lastName ?? ''}`.trim()
  return joined
}

export function transformSigner(raw: RawCongaSignRecipient, envelopeId: string): Signer {
  const id = pickStr(raw.id) ?? pickStr(raw.email) ?? ''
  return {
    id,
    externalId: id,
    envelopeId,
    email: pickStr(raw.email) ?? '',
    name: fullName(raw),
    role: mapRole(raw.role),
    status: mapStatus(raw.status),
    routingOrder: raw.signingOrder ?? raw.index,
    sentAt: toIso(raw.sentOn),
    deliveredAt: toIso(raw.deliveredOn),
    signedAt: toIso(raw.signedOn ?? raw.signedDate),
    declinedAt: toIso(raw.declinedOn),
    declineReason: pickStr(raw.declineReason),
    platform: 'conga-sign',
    metadata: strMap({ company: raw.company }),
    raw,
  }
}
