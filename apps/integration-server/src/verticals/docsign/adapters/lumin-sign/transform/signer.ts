import type { Signer, SignerStatus } from '../../../schema/signer'
import { pickStr, strMap } from './shared'
import type { RawLuminSignEmbeddedSigner } from './envelope'

/**
 * Map a Lumin signer status to the canonical signer status.
 *
 *   NEED_TO_SIGN / WAITING_FOR_OTHERS / WAITING_FOR_PROCESSING → sent
 *   APPROVED                                                   → signed
 *   REJECTED / FAILED                                          → declined
 */
function mapStatus(raw: string | undefined): SignerStatus {
  switch ((raw ?? '').toUpperCase()) {
    case 'APPROVED':
      return 'signed'
    case 'REJECTED':
    case 'FAILED':
      return 'declined'
    case 'NEED_TO_SIGN':
    case 'WAITING_FOR_OTHERS':
    case 'WAITING_FOR_PROCESSING':
      return 'sent'
    default:
      return 'created'
  }
}

export function transformSigner(
  raw: RawLuminSignEmbeddedSigner,
  envelopeId: string,
): Signer {
  const email = pickStr(raw.email_address) ?? ''
  return {
    // Lumin signers have no stable id of their own — address them by email
    // within the parent signature request.
    id: `${envelopeId}:${email}`,
    externalId: email,
    envelopeId,
    email,
    name: pickStr(raw.name) ?? '',
    // Lumin only models ordinary signers (with an optional signing group);
    // there are no cc / witness / editor roles on the API surface.
    role: 'signer',
    status: mapStatus(raw.status),
    // `group` is Lumin's 1-indexed signing-order group when signing_type=ORDER.
    routingOrder: typeof raw.group === 'number' && raw.group >= 1 ? raw.group : undefined,
    platform: 'lumin-sign',
    metadata: strMap({
      group: raw.group,
      isApproved: raw.is_approved,
      luminStatus: raw.status,
    }),
    raw,
  }
}
