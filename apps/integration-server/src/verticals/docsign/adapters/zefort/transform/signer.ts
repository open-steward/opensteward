import type { Signer, SignerRole, SignerStatus } from '../../../schema/signer'
import { pickStr, strMap, toIso } from './shared'

/**
 * A Zefort party (id prefix `sgnr_`) maps to the canonical Signer. Parties
 * carry a `role` (signer / approver / cc), an `authentication_type` (email,
 * sms, finnish_trust_network, strong_auth_sweden, …), and a 1-indexed
 * `ordinal` describing position in a consecutive signing order.
 */
export interface RawZefortParty {
  id?: string
  name?: string
  email?: string
  phone_number?: string
  user?: string
  role?: string
  status?: string
  ordinal?: number
  authentication_type?: string
  personal_id?: string
  language?: string
  signed?: string
  declined?: string
  [key: string]: unknown
}

function mapRole(role: string | undefined): SignerRole {
  switch ((role ?? '').toLowerCase()) {
    case 'cc':
      return 'cc'
    case 'approver':
      return 'approver'
    default:
      return 'signer'
  }
}

function mapStatus(status: string | undefined): SignerStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'completed':
    case 'signed':
      return 'signed'
    case 'declined':
      return 'declined'
    case 'pending':
      return 'sent'
    default:
      return 'created'
  }
}

export function transformSigner(raw: RawZefortParty, envelopeId: string): Signer {
  const externalId = raw.id ?? raw.email ?? ''
  return {
    id: externalId,
    externalId,
    envelopeId,
    email: pickStr(raw.email) ?? '',
    name: pickStr(raw.name) ?? '',
    role: mapRole(raw.role),
    status: mapStatus(raw.status),
    routingOrder:
      typeof raw.ordinal === 'number' && raw.ordinal >= 1 ? raw.ordinal : undefined,
    signedAt: toIso(raw.signed),
    declinedAt: toIso(raw.declined),
    platform: 'zefort',
    metadata: strMap({
      authenticationType: raw.authentication_type,
      language: raw.language,
      phoneNumber: raw.phone_number,
      user: raw.user,
      rawStatus: raw.status,
    }),
    raw,
  }
}
