import type { Signer, SignerRole, SignerStatus } from '../../../schema/signer'
import type { RawSignorityInvitation } from './envelope'
import { pickNum, pickStr, strMap, toIso } from './shared'

export type { RawSignorityInvitation } from './envelope'

/**
 * Signority invitation `actionType` codes.
 *   15 = Signer (must sign), 16 = Viewer/CC (receives a copy, no signature).
 * Unknown codes fall back to `signer`.
 */
function mapRole(actionType: number | string | undefined): SignerRole {
  const code = typeof actionType === 'string' ? Number(actionType) : actionType
  switch (code) {
    case 15:
      return 'signer'
    case 16:
      return 'cc'
    default:
      return 'signer'
  }
}

/**
 * Signority invitation `status` codes.
 *   60 = NOT_SENT (created), 61 = SENT/PENDING, 62 = VIEWED/DELIVERED,
 *   63 = SIGNED/COMPLETED, 64 = DECLINED/REJECTED.
 * Unknown codes fall back to `created`.
 */
function mapStatus(status: number | string | undefined): SignerStatus {
  const code = typeof status === 'string' ? Number(status) : status
  switch (code) {
    case 60:
      return 'created'
    case 61:
      return 'sent'
    case 62:
      return 'delivered'
    case 63:
      return 'signed'
    case 64:
      return 'declined'
    default:
      return 'created'
  }
}

export function transformSigner(
  raw: RawSignorityInvitation,
  envelopeId: string,
): Signer {
  const externalId = pickStr(raw.GUID) ?? pickStr(raw.id) ?? ''
  return {
    id: pickStr(raw.GUID) ?? `${envelopeId}:${pickStr(raw.id) ?? ''}`,
    externalId,
    envelopeId,
    email: pickStr(raw.recipientEmail) ?? '',
    name: pickStr(raw.recipientName) ?? '',
    role: mapRole(raw.actionType),
    status: mapStatus(raw.status),
    routingOrder: pickNum(raw.sequence),
    signedAt: toIso(raw.signedTime),
    declinedAt: toIso(raw.declinedTime),
    platform: 'signority',
    metadata: strMap({
      actionType: raw.actionType,
      status: raw.status,
      canSignTags: raw.canSignTags,
    }),
    raw,
  }
}
