import type { Signer, SignerStatus } from '../../../schema/signer'
import { pickStr, strMap } from './shared'
import { scrubInvitation, type RawVismaSignInvitation } from './envelope'

export type { RawVismaSignInvitation } from './envelope'

/**
 * Invitation statuses, verbatim from the docs ("Invitation statuses"):
 *   waiting-for-send "The invitation has not been sent yet, and cannot be opened or fulfilled."
 *   sending          "The invitation messages are being sent. The invitation can be opened."
 *   new              "The invitation has been sent, and is waiting to be fulfilled."
 *   opened           "… is waiting to be fulfilled, and has been opened."
 *   signed           "The invitation has been fulfilled."
 *   cancelled        "The invitation and related transaction / document have been cancelled."
 * `cancelled` has no canonical signer counterpart, so it is `unknown` with the
 * raw status kept in metadata.
 */
function mapStatus(s: string | undefined): SignerStatus {
  switch (s) {
    case 'waiting-for-send':
    case 'sending':
      return 'created'
    case 'new':
      return 'sent'
    case 'opened':
      return 'delivered'
    case 'signed':
      return 'signed'
    default:
      return 'unknown'
  }
}

export function transformSigner(raw: RawVismaSignInvitation, envelopeId: string): Signer {
  const index = raw.order?.index
  return {
    id: raw.uuid,
    externalId: raw.uuid,
    envelopeId,
    email: pickStr(raw.email),
    // `name` is optional on the invitation ("name": "Test Person", // Optional).
    name: pickStr(raw.name) ?? '',
    role: 'signer',
    status: mapStatus(raw.status),
    routingOrder:
      typeof index === 'number' && Number.isInteger(index) && index >= 1 ? index : undefined,
    platform: 'visma-sign',
    metadata: strMap({ status: raw.status }),
    raw: scrubInvitation(raw),
  }
}
