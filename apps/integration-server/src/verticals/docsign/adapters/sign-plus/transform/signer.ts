import type { Signer, SignerRole, SignerStatus } from '../../../schema/signer'
import { pickStr, strMap } from './shared'

export interface RawSignPlusRecipient {
  id?: string
  uid?: string
  name?: string
  email?: string
  role?: string
  verification?: { type?: string; value?: string }
  [key: string]: unknown
}

/**
 * Sign.Plus recipient roles. There is no separate witness/editor/approver
 * concept; `RECEIVES_COPY` is the carbon-copy role and `SENDER` only appears on
 * template recipients.
 */
function mapRole(role: string | undefined): SignerRole {
  switch ((role ?? '').toUpperCase()) {
    case 'SIGNER':
      return 'signer'
    case 'RECEIVES_COPY':
      return 'cc'
    case 'IN_PERSON_SIGNER':
      return 'in_person_signer'
    case 'SENDER':
      return 'editor'
    default:
      return 'signer'
  }
}

/**
 * Sign.Plus does not expose per-recipient status or signing timestamps on the
 * envelope payload, so signer status is derived from the parent envelope's
 * coarse status. Terminal envelope states (completed/declined/voided/expired)
 * map to terminal signer states; an in-flight envelope means the recipient has
 * been sent the request.
 */
function mapStatus(envelopeStatus: string | undefined): SignerStatus {
  switch ((envelopeStatus ?? '').toUpperCase()) {
    case 'COMPLETED':
      return 'signed'
    case 'DECLINED':
      return 'declined'
    case 'PENDING':
    case 'IN_PROGRESS':
      return 'sent'
    default:
      return 'created'
  }
}

export function transformSigner(
  raw: RawSignPlusRecipient,
  envelopeId: string,
  routingOrder: number,
  envelopeStatus: string | undefined,
): Signer {
  return {
    id: raw.id ?? `${envelopeId}:${raw.email ?? routingOrder}`,
    externalId: raw.id ?? `${envelopeId}:${routingOrder}`,
    envelopeId,
    email: pickStr(raw.email) ?? '',
    name: pickStr(raw.name) ?? '',
    role: mapRole(raw.role),
    status: mapStatus(envelopeStatus),
    // Sign.Plus signing steps are 0-indexed; the canonical routingOrder is 1-indexed.
    routingOrder: routingOrder + 1,
    platform: 'sign-plus',
    metadata: strMap({
      uid: raw.uid,
      role: raw.role,
      verificationType: raw.verification?.type,
    }),
    raw,
  }
}
