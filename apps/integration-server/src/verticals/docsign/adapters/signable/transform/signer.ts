import type { Signer, SignerRole, SignerStatus } from '../../../schema/signer'
import { pickStr, strMap } from './shared'
import type { RawSignableEnvelopeParty } from './envelope'

/**
 * Signers are the `envelope_parties` of a Signable envelope. Only the
 * envelope-detail endpoint returns the rich party fields (contact_email,
 * party_status, party_role); the list summary returns name only. A party is
 * addressed within an envelope by its `party_id`.
 */

/** `signer` actively signs; `copy` is CC'd a read-only copy. */
function mapRole(role: string | undefined): SignerRole {
  return (role ?? '').toLowerCase() === 'copy' ? 'cc' : 'signer'
}

/** Signable party statuses: pending → sent, in progress → delivered, signed. */
function mapStatus(status: string | undefined): SignerStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'signed':
      return 'signed'
    case 'in progress':
      return 'delivered'
    case 'pending':
      return 'sent'
    default:
      return 'created'
  }
}

export function transformSigner(
  raw: RawSignableEnvelopeParty,
  envelopeId: string,
  index: number,
): Signer {
  return {
    id: `${envelopeId}:${raw.party_id}`,
    externalId: raw.party_id,
    envelopeId,
    email: pickStr(raw.contact_email) || undefined,
    name: pickStr(raw.party_title) ?? '',
    role: mapRole(raw.party_role),
    status: mapStatus(raw.party_status),
    // Parties are returned in signing order; expose a 1-indexed routing order.
    routingOrder: index + 1,
    platform: 'signable',
    metadata: strMap({
      partyStatus: raw.party_status,
      partyRole: raw.party_role,
      partySignatureType: raw.party_signature_type,
      contactId: raw.contact_id,
    }),
    raw,
  }
}
