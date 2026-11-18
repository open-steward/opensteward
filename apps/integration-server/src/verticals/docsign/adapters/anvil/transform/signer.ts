import type { Signer, SignerRole, SignerStatus } from '../../../schema/signer'
import { pickStr, strMap, toIsoDatetime } from './shared'
import type { RawAnvilSigner } from './envelope'

export type { RawAnvilSigner } from './envelope'

/**
 * Anvil signer statuses: `sent` (notified, not opened), `viewed` (opened the
 * signing page), `completed` (signed everything). Anvil has no explicit
 * decline status on the signer object.
 *
 * Docs: https://www.useanvil.com/docs/api/e-signatures/
 */
function mapStatus(s: string | undefined): SignerStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'completed':
      return 'signed'
    case 'viewed':
      return 'delivered'
    case 'sent':
      return 'sent'
    default:
      return 'created'
  }
}

/** Anvil signers are e-sign recipients; `signerType` is a delivery channel,
 *  not a canonical role, so every Anvil signer maps to the `signer` role. */
function mapRole(_signerType: string | undefined): SignerRole {
  return 'signer'
}

export function transformSigner(raw: RawAnvilSigner, envelopeId: string): Signer {
  return {
    id: raw.eid,
    externalId: raw.eid,
    envelopeId,
    email: pickStr(raw.email) || undefined,
    name: pickStr(raw.name) ?? '',
    role: mapRole(raw.signerType),
    status: mapStatus(raw.status),
    routingOrder: typeof raw.routingOrder === 'number' ? raw.routingOrder : undefined,
    signedAt: toIsoDatetime(raw.completedAt),
    platform: 'anvil',
    metadata: strMap({
      aliasId: raw.aliasId,
      signerType: raw.signerType,
      signActionType: raw.signActionType,
      signatureExperience: raw.signatureExperience,
      provider: raw.provider,
      status: raw.status,
    }),
    raw,
  }
}
