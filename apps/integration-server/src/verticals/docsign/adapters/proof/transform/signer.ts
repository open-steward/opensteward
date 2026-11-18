import type { Signer, SignerStatus } from '../../../schema/signer'
import { pickNum, pickStr, strMap } from './shared'
import type { RawProofSigner } from './envelope'

/**
 * Map Proof's signer `signing_status` onto the canonical SignerStatus. Proof
 * does not publish a closed enum for this field, so we match leniently and
 * fall back to `created`. Transforms never throw.
 */
function mapStatus(s: string | undefined): SignerStatus {
  const lower = (s ?? '').toLowerCase()
  if (lower === 'complete' || lower === 'completed' || lower === 'signed') return 'signed'
  if (lower === 'declined' || lower === 'rejected') return 'declined'
  if (lower === 'viewed' || lower === 'opened') return 'delivered'
  if (lower === 'sent' || lower === 'sent_to_signer') return 'sent'
  if (lower === 'incomplete' || lower === 'in_progress' || lower === 'attempted') return 'delivered'
  return 'created'
}

function fullName(raw: RawProofSigner): string {
  return [raw.first_name, raw.middle_name, raw.last_name]
    .map((p) => pickStr(p))
    .filter((p): p is string => typeof p === 'string')
    .join(' ')
}

export function transformSigner(raw: RawProofSigner, transactionId: string): Signer {
  const externalId = pickStr(raw.signer_id) ?? pickStr(raw.external_id) ?? pickStr(raw.email) ?? ''
  return {
    id: `${transactionId}:${externalId}`,
    externalId,
    envelopeId: transactionId,
    email: pickStr(raw.email) ?? '',
    name: fullName(raw),
    role: 'signer',
    status: mapStatus(raw.signing_status),
    routingOrder: pickNum(raw.order),
    platform: 'proof',
    metadata: strMap({
      vestingType: raw.vesting_type,
      notaryId: raw.notary_id,
      linkExpired: typeof raw.link_expired === 'boolean' ? String(raw.link_expired) : undefined,
      phoneNumber: raw.phone_number,
    }),
    raw,
  }
}
