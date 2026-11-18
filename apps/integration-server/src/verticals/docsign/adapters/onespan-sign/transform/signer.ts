import type { Signer, SignerRole, SignerStatus } from '../../../schema/signer'
import { pickNum, pickStr, strMap, toIso } from './shared'

/**
 * OneSpan Sign signer = one entry in `role.signers[]` inside a package.
 * The role's `type` and `name` carry the role classification.
 */
export interface RawOneSpanSignerFlat {
  // signer fields
  id?: string
  email?: string
  firstName?: string
  lastName?: string
  signed?: boolean
  signedDate?: string
  delivered?: boolean
  deliveredDate?: string
  declined?: boolean
  declinedDate?: string
  declinedReason?: string
  sentDate?: string
  language?: string
  // role fields (lifted onto the signer via flattening)
  roleId?: string
  roleName?: string
  roleType?: string
  roleIndex?: number | string
  [key: string]: unknown
}

function mapRole(roleType: string | undefined): SignerRole {
  const t = (roleType ?? '').toUpperCase()
  if (t === 'SIGNER') return 'signer'
  if (t === 'CC' || t === 'REVIEWER') return 'cc'
  if (t === 'APPROVER') return 'approver'
  if (t === 'WITNESS') return 'witness'
  if (t === 'EDITOR' || t === 'AGENT') return 'editor'
  if (t === 'IN_PERSON_SIGNER') return 'in_person_signer'
  return 'signer'
}

function mapStatus(raw: RawOneSpanSignerFlat): SignerStatus {
  if (raw.signed === true) return 'signed'
  if (raw.declined === true) return 'declined'
  if (raw.delivered === true) return 'delivered'
  if (raw.sentDate) return 'sent'
  return 'created'
}

export function transformSigner(
  raw: RawOneSpanSignerFlat,
  envelopeId: string,
): Signer {
  const externalId = pickStr(raw.id) ?? ''
  const name = [pickStr(raw.firstName), pickStr(raw.lastName)]
    .filter(Boolean)
    .join(' ')
    .trim()
  return {
    id: `${envelopeId}:${externalId}`,
    externalId,
    envelopeId,
    email: pickStr(raw.email) ?? '',
    name,
    role: mapRole(raw.roleType),
    status: mapStatus(raw),
    routingOrder: pickNum(raw.roleIndex),
    sentAt: toIso(raw.sentDate),
    deliveredAt: toIso(raw.deliveredDate),
    signedAt: toIso(raw.signedDate),
    declinedAt: toIso(raw.declinedDate),
    declineReason: pickStr(raw.declinedReason),
    platform: 'onespan-sign',
    metadata: strMap({
      roleId: raw.roleId,
      roleName: raw.roleName,
      language: raw.language,
    }),
    raw,
  }
}
