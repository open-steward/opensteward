import type { Signer, SignerStatus } from '../../../schema/signer'
import { strMap, toIso } from './shared'
import type { RawSignicatSigningSession } from './envelope'

/**
 * Signicat does not expose addressable signer records. Instead a signing
 * session carries a `signingSetup[]` array — one entry per signing slot,
 * describing the permitted identity providers and signing flow. We
 * synthesise a canonical Signer per setup entry, deriving signer status from
 * the session lifecycle. Email/name are not known until the signer
 * authenticates through their eID, so they are left empty (the schema
 * requires the keys; the wire simply has no value to surface pre-signing).
 */
export interface RawSignicatSigningSetup {
  identityProviders?: Array<{ idpName?: string }>
  signingFlow?: string
  additionalParameters?: Record<string, unknown>
}

function mapStatus(lifecycleState: string | undefined): SignerStatus {
  switch ((lifecycleState ?? '').toUpperCase()) {
    case 'SIGNED':
    case 'COMPLETED':
      return 'signed'
    case 'REJECTED':
    case 'DECLINED':
      return 'declined'
    case 'IN_PROGRESS':
    case 'STARTED':
      return 'delivered'
    case 'READY':
      return 'sent'
    default:
      return 'created'
  }
}

export function transformSigner(
  setup: RawSignicatSigningSetup,
  session: RawSignicatSigningSession,
  index: number,
): Signer {
  const state = session.lifecycle?.state
  const status = mapStatus(state)
  const idps = (setup.identityProviders ?? [])
    .map((p) => p.idpName)
    .filter((n): n is string => typeof n === 'string')

  return {
    id: `${session.id}:${index}`,
    externalId: `${session.id}:${index}`,
    envelopeId: session.id,
    email: undefined,
    name: '',
    role: 'signer',
    status,
    routingOrder: index + 1,
    sentAt: status !== 'created' ? toIso(session.createdAt) : undefined,
    deliveredAt: undefined,
    signedAt: status === 'signed' ? toIso(session.updatedAt) : undefined,
    declinedAt: status === 'declined' ? toIso(session.updatedAt) : undefined,
    declineReason: undefined,
    platform: 'signicat',
    metadata: strMap({
      signingFlow: setup.signingFlow,
      identityProviders: idps.join(','),
    }),
    raw: setup,
  }
}
