import type { Signer, SignerRole, SignerStatus } from '../../../schema/signer'
import { fullName, pickStr, strMap, toIso, type RawSproofMember } from './shared'

export type { RawSproofMember } from './shared'

/** `_Member.isSigner` / `isApprover` / `isViewer`. */
export function memberRole(m: RawSproofMember): SignerRole {
  if (m.isSigner) return 'signer'
  if (m.isApprover) return 'approver'
  if (m.isViewer) return 'cc'
  return 'unknown'
}

/**
 * From the documented per-member `_Member` timestamps. `approvedAt` ("Date and
 * time when the member was approved") completes an approver's action, as
 * `signedAt` does a signer's; `viewedAt` is set "Only if isViewer is true".
 * `_Member.signed` is not read: the spec describes it as "Indicates whether
 * the document was signed by the owner", which says nothing about this
 * member. The spec records no invitation time, so an open member of a
 * non-draft document is `unknown` rather than guessed `sent`.
 */
function mapStatus(m: RawSproofMember, documentState: string | undefined): SignerStatus {
  if (m.declinedAt) return 'declined'
  if (m.signedAt || m.approvedAt) return 'signed'
  if (m.viewedAt) return 'delivered'
  if (documentState === 'draft') return 'created'
  return 'unknown'
}

export function transformSigner(
  raw: RawSproofMember,
  envelopeId: string,
  documentState: string | undefined,
): Signer {
  const memberId = pickStr(raw.id)
  if (!memberId) throw new Error('sproof-sign: member has no member id')
  const order = raw.signingOrder
  return {
    id: `${envelopeId}:${memberId}`,
    externalId: memberId,
    envelopeId,
    email: pickStr(raw.email),
    name: fullName(raw) ?? '',
    role: memberRole(raw),
    status: mapStatus(raw, documentState),
    routingOrder: typeof order === 'number' && Number.isInteger(order) && order >= 1 ? order : undefined,
    deliveredAt: toIso(raw.viewedAt),
    signedAt: toIso(raw.signedAt) ?? toIso(raw.approvedAt),
    declinedAt: toIso(raw.declinedAt),
    platform: 'sproof-sign',
    metadata: strMap({
      isSigner: raw.isSigner,
      isApprover: raw.isApprover,
      isViewer: raw.isViewer,
      isAdmin: raw.isAdmin,
      lastActivityAt: raw.lastActivityAt,
    }),
    raw,
  }
}
