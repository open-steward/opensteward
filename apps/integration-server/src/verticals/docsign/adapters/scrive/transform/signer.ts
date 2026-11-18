import type { Signer, SignerRole, SignerStatus } from '../../../schema/signer'
import { pickStr, strMap, toIso } from './shared'
import { fieldValue, partyName, type RawScriveParty } from './envelope'

export type { RawScriveParty } from './envelope'

/**
 * "signatory_role (string, enum) ... viewer, approver, or signing_party" and
 * "is_signatory (boolean) Deprecated ... If both is_signatory and
 * signatory_role are present, is_signatory takes precedence if their values
 * are inconsistent".
 */
function mapRole(raw: RawScriveParty): SignerRole {
  if (raw.signatory_role === 'approver') return 'approver'
  if (raw.is_signatory === true) return 'signer'
  if (raw.is_signatory === false) return 'cc'
  switch (raw.signatory_role) {
    case 'viewer':
      return 'cc'
    case 'signing_party':
      return 'signer'
    default:
      return 'unknown'
  }
}

/**
 * From the party's documented timestamps: sign_time, rejected_time,
 * seen_time, read_invitation_time. Before any of those, the document's own
 * status says whether invitations went out: "preparation" has not started.
 */
function mapStatus(raw: RawScriveParty, documentStatus: string | undefined): SignerStatus {
  if (raw.sign_time) return 'signed'
  if (raw.rejected_time) return 'declined'
  if (raw.seen_time || raw.read_invitation_time) return 'delivered'
  if (documentStatus === 'preparation') return 'created'
  if (documentStatus === 'pending') return 'sent'
  return 'unknown'
}

export function transformSigner(
  raw: RawScriveParty,
  envelopeId: string,
  documentStatus?: string,
): Signer {
  const email = fieldValue(raw.fields, 'email')
  return {
    id: raw.id,
    externalId: raw.id,
    envelopeId,
    ...(email ? { email } : {}),
    name: partyName(raw.fields) ?? '',
    role: mapRole(raw),
    status: mapStatus(raw, documentStatus),
    ...(typeof raw.sign_order === 'number' && raw.sign_order >= 1
      ? { routingOrder: raw.sign_order }
      : {}),
    deliveredAt: toIso(raw.read_invitation_time),
    signedAt: toIso(raw.sign_time),
    declinedAt: toIso(raw.rejected_time),
    declineReason: pickStr(raw.rejection_reason),
    platform: 'scrive',
    metadata: strMap({
      authMethodView: raw.authentication_method_to_view,
      authMethodSign: raw.authentication_method_to_sign,
      isAuthor: raw.is_author,
    }),
    raw,
  }
}
