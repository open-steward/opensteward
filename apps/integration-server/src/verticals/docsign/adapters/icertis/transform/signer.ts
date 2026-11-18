import type { Signer, SignerRole, SignerStatus } from '../../../schema/signer'
import type { RawIcertisSignatory } from './envelope'
import { pickStr, strMap, toIso } from './shared'

export type { RawIcertisSignatory } from './envelope'

function mapStatus(s: string | undefined): SignerStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'signed':
    case 'executed':
    case 'completed':
      return 'signed'
    case 'declined':
    case 'rejected':
      return 'declined'
    case 'delivered':
    case 'viewed':
    case 'opened':
      return 'delivered'
    case 'sent':
    case 'sent for signature':
    case 'awaiting signature':
    case 'pending':
      return 'sent'
    default:
      return 'created'
  }
}

// ICI's first-class signing party is the signer; external vs internal is
// surfaced via metadata rather than a distinct canonical role.
const SIGNER_ROLE: SignerRole = 'signer'

export function transformSigner(raw: RawIcertisSignatory, envelopeId: string): Signer {
  const id = raw.ICMId ?? raw.Id ?? raw.Email ?? raw.EmailId ?? ''
  return {
    id,
    externalId: id,
    envelopeId,
    email: pickStr(raw.Email) || pickStr(raw.EmailId) || undefined,
    name: pickStr(raw.Name) ?? '',
    role: SIGNER_ROLE,
    status: mapStatus(raw.Status),
    routingOrder: raw.SequenceNumber ?? raw.SigningOrder,
    signedAt: toIso(raw.SignedOn),
    declinedAt: toIso(raw.DeclinedOn),
    platform: 'icertis',
    metadata: strMap({ isExternal: raw.IsExternal }),
    raw,
  }
}
