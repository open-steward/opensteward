import type { Signer, SignerRole, SignerStatus } from '../../../schema/signer'
import { participationPriority, partyEmail, type RawAutentiProcessParty } from './party'
import { pickStr, strMap } from './shared'

/**
 * `DocumentProcessPartyRole`: SIGNER, SENDER, APPROVER, REVIEWER, VIEWER,
 * UNSPECIFIED_DOCUMENT_PARTY_ROLE (open enum). SENDER never reaches here: the
 * adapter keeps the sender out of the signer list.
 */
function mapRole(role: string | undefined): SignerRole {
  switch (role) {
    case 'SIGNER':
      return 'signer'
    case 'APPROVER':
      return 'approver'
    case 'VIEWER':
      return 'cc'
    default:
      return 'unknown'
  }
}

/** `ParticipationStatus`: NONE, PENDING, COMPLETED, OBSOLETE, FAILED (open enum). */
function mapStatus(s: string | undefined): SignerStatus {
  switch (s) {
    case 'NONE':
      return 'created'
    case 'PENDING':
      return 'sent'
    case 'COMPLETED':
      return 'signed'
    default:
      return 'unknown'
  }
}

export function transformSigner(raw: RawAutentiProcessParty, envelopeId: string): Signer {
  const id = pickStr(raw.party.id)
  if (!id) throw new Error(`Autenti party of document process ${envelopeId} has no id`)
  const name = pickStr(raw.party.name)
  if (name === undefined) throw new Error(`Autenti party ${id} has no name`)
  return {
    id,
    externalId: id,
    envelopeId,
    email: partyEmail(raw.party),
    name,
    role: mapRole(raw.role),
    status: mapStatus(raw.participationStatus),
    routingOrder: participationPriority(raw),
    platform: 'autenti',
    metadata: strMap({ role: raw.role, participationStatus: raw.participationStatus }),
    raw,
  }
}
