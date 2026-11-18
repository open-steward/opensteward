import type { Signer, SignerStatus } from '../../../schema/signer'
import { pickNum, pickStr, strMap, toIso } from './shared'
import type { RawMekariSignSigner } from './envelope'

/**
 * Mekari Sign exposes signers nested on the document object. Each signer
 * carries an email, name, signing order, per-signer status, and the
 * timestamps for the points it has reached in the flow.
 */
function mapStatus(s: string | undefined): SignerStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'signed':
    case 'completed':
      return 'signed'
    case 'declined':
      return 'declined'
    case 'viewed':
    case 'opened':
    case 'delivered':
      return 'delivered'
    case 'sent':
    case 'in_progress':
    case 'pending':
      return 'sent'
    default:
      return 'created'
  }
}

export function transformSigner(
  raw: RawMekariSignSigner,
  envelopeId: string,
  index: number,
): Signer {
  const externalId = pickStr(raw.id) ?? pickStr(raw.email) ?? String(index)
  const order = pickNum(raw.order) ?? pickNum(raw.signing_order)
  return {
    id: `${envelopeId}:${externalId}`,
    externalId,
    envelopeId,
    email: pickStr(raw.email) ?? '',
    name: pickStr(raw.name) ?? pickStr(raw.full_name) ?? '',
    role: 'signer',
    status: mapStatus(raw.status ?? raw.signing_status),
    routingOrder: order != null && order >= 1 ? order : undefined,
    sentAt: toIso(raw.sent_at),
    deliveredAt: toIso(raw.viewed_at),
    signedAt: toIso(raw.signed_at),
    declinedAt: toIso(raw.declined_at),
    declineReason: pickStr(raw.decline_reason),
    platform: 'mekari-sign',
    metadata: strMap({ rawStatus: raw.status ?? raw.signing_status }),
    raw,
  }
}
