import type { Signer, SignerRole, SignerStatus } from '../../../schema/signer'
import { pickStr, toIsoDatetime, strMap } from './shared'
import type { RawSignRequestSigner } from './envelope'

/**
 * SignRequest signers live inline on `document.signrequest.signers`. Role is
 * derived from the boolean flags `approve_only` / `notify_only` (a signer is
 * the default), and status from the lifecycle booleans + timestamps.
 *
 * `order` is 0-indexed on the wire; the canonical `routingOrder` is 1-indexed
 * and only meaningful when the envelope is sequential, so we add 1.
 */
function mapRole(raw: RawSignRequestSigner): SignerRole {
  if (raw.notify_only) return 'cc'
  if (raw.approve_only) return 'approver'
  return 'signer'
}

function mapStatus(raw: RawSignRequestSigner): SignerStatus {
  if (raw.declined) return 'declined'
  if (raw.signed) return 'signed'
  if (raw.viewed) return 'delivered'
  if (raw.emailed) return 'sent'
  return 'created'
}

function signerName(raw: RawSignRequestSigner): string {
  if (raw.display_name && raw.display_name.length > 0) return raw.display_name
  const joined = [raw.first_name, raw.last_name].filter(Boolean).join(' ')
  return joined
}

export function transformSigner(raw: RawSignRequestSigner, envelopeId: string): Signer {
  const order = typeof raw.order === 'number' ? raw.order : undefined
  return {
    id: raw.uuid ?? `${envelopeId}:${raw.email ?? ''}`,
    externalId: raw.uuid ?? raw.email ?? '',
    envelopeId,
    email: pickStr(raw.email) ?? '',
    name: signerName(raw),
    role: mapRole(raw),
    status: mapStatus(raw),
    routingOrder: order !== undefined ? order + 1 : undefined,
    signedAt: toIsoDatetime(raw.signed_on),
    declinedAt: toIsoDatetime(raw.declined_on),
    declineReason: pickStr(raw.declined_reason),
    platform: 'signrequest',
    metadata: strMap({
      needsToSign: raw.needs_to_sign,
      approveOnly: raw.approve_only,
      notifyOnly: raw.notify_only,
      viewed: raw.viewed,
      viewedOn: raw.viewed_on,
      emailed: raw.emailed,
    }),
    raw,
  }
}
