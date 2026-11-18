import type { Signer, SignerStatus } from '../../../schema/signer'
import { pickStr, strMap } from './shared'
import { juroSignatureId, type RawJuroSignature, type RawJuroSigningSide } from './envelope'

/**
 * A Juro signatory is one `signature` object nested inside a `signingSide`.
 * Internal parties carry a `username`; external counterparties carry
 * `email` + `name`. The signing status of an individual signature is not
 * surfaced in the contract response (it is delivered via webhooks), so we
 * derive a coarse status from the parent contract status.
 */
export function mapSignerStatus(contractStatus: string | undefined): SignerStatus {
  switch ((contractStatus ?? '').toLowerCase()) {
    case 'fully signed':
      return 'signed'
    case 'rejected':
      return 'declined'
    case 'sent for signing':
    case 'signed by us':
    case 'signed by them':
      return 'sent'
    default:
      return 'created'
  }
}

export function transformSigner(
  side: RawJuroSigningSide,
  sig: RawJuroSignature,
  envelopeId: string,
  contractStatus?: string,
): Signer {
  const id = juroSignatureId(side, sig)
  const email = pickStr(sig.email)
  return {
    id,
    externalId: id,
    envelopeId,
    email: email ?? undefined,
    name: pickStr(sig.name) ?? pickStr(sig.username) ?? pickStr(side.name) ?? '',
    role: 'signer',
    status: mapSignerStatus(contractStatus),
    platform: 'juro',
    metadata: strMap({
      signingSideUid: side.uid,
      signingSideName: side.name,
      username: sig.username,
      signatureUid: sig.uid,
    }),
    raw: sig,
  }
}
