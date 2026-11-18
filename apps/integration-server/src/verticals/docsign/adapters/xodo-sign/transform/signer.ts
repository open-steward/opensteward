import type { Signer, SignerStatus } from '../../../schema/signer'
import { pickNum, pickStr, strMap, toIso } from './shared'
import type { RawXodoSignSigner } from './envelope'

export type { RawXodoSignSigner } from './envelope'

const truthy = (v: unknown): boolean => v === true || v === 1 || v === '1'

/**
 * Xodo Sign reports signer state through booleans + an optional `status`
 * label rather than a single enum. We derive from the strongest signal:
 * signed → declined → viewed (delivered) → sent.
 */
function mapStatus(raw: RawXodoSignSigner): SignerStatus {
  if (truthy(raw.signed)) return 'signed'
  if (truthy(raw.declined)) return 'declined'
  if (truthy(raw.viewed)) return 'delivered'
  if (truthy(raw.sent)) return 'sent'
  const label = (raw.status ?? '').toLowerCase()
  if (label === 'signed' || label === 'completed') return 'signed'
  if (label === 'declined') return 'declined'
  if (label === 'viewed' || label === 'delivered') return 'delivered'
  if (label === 'sent') return 'sent'
  return 'created'
}

export function transformSigner(
  raw: RawXodoSignSigner,
  envelopeId: string,
  index: number,
): Signer {
  const externalId = String(raw.id ?? raw.order ?? index + 1)
  const order = pickNum(raw.order)
  return {
    id: `${envelopeId}:${externalId}`,
    externalId,
    envelopeId,
    // Xodo Sign signers are always signing roles (CCs are "recipients", a
    // separate concept we don't surface here).
    email: pickStr(raw.email) ?? '',
    name: pickStr(raw.name) ?? '',
    role: 'signer',
    status: mapStatus(raw),
    routingOrder: order != null && order >= 1 ? order : undefined,
    signedAt: truthy(raw.signed) ? toIso(raw.signed_timestamp) : undefined,
    declinedAt: truthy(raw.declined) ? toIso(raw.declined_timestamp) : undefined,
    declineReason: pickStr(raw.declined_reason),
    platform: 'xodo-sign',
    metadata: strMap({
      role: raw.role,
      language: raw.language,
      required: truthy(raw.required) ? 'true' : undefined,
      bounced: truthy(raw.bounced) ? 'true' : undefined,
      removed: truthy(raw.removed) ? 'true' : undefined,
      status: raw.status,
    }),
    raw,
  }
}
