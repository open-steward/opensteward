import type { Signer, SignerStatus } from '../../../schema/signer'
import { pickStr, strMap } from './shared'

/**
 * A signer entry from a workflow's sign-status. Ironclad does not surface
 * per-signer signed/declined timestamps on this endpoint — only a status —
 * so the canonical signer carries no timestamps and the optional ones are
 * left undefined.
 */
export interface RawIroncladSigner {
  name?: string
  email?: string
  roleName?: string
  status?: string
  type?: string
  routingOrder?: number
  isWetSigned?: boolean
  userId?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): SignerStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'signed':
      return 'signed'
    case 'declined':
      return 'declined'
    case 'viewed':
      return 'delivered'
    case 'sent':
      return 'sent'
    case 'pending':
      return 'created'
    default:
      return 'created'
  }
}

export function transformSigner(raw: RawIroncladSigner, envelopeId: string): Signer {
  const externalId = raw.userId ?? raw.email ?? ''
  // routingOrder is 1-indexed in the canonical schema; Ironclad uses -1 for
  // wet signatures and may emit 0, so only forward strictly-positive values.
  const routingOrder =
    typeof raw.routingOrder === 'number' && raw.routingOrder >= 1 ? raw.routingOrder : undefined

  return {
    id: externalId,
    externalId,
    envelopeId,
    email: pickStr(raw.email) || undefined,
    name: pickStr(raw.name) ?? '',
    role: 'signer',
    status: mapStatus(raw.status),
    routingOrder,
    platform: 'ironclad',
    metadata: strMap({
      roleName: raw.roleName,
      type: raw.type,
      isWetSigned: raw.isWetSigned,
      userId: raw.userId,
    }),
    raw,
  }
}
