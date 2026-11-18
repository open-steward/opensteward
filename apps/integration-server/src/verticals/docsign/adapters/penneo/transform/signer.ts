import type { Signer, SignerStatus } from '../../../schema/signer'
import { pickStr, strMap, toIso } from './shared'

export interface RawPenneoSigner {
  id: number | string
  name?: string
  socialSecurityNumber?: string
  vatin?: string
  signed?: boolean
  signedAt?: string
  declined?: boolean
  declinedAt?: string
  declineReason?: string
  hasViewedDocuments?: boolean
  viewedAt?: string
  email?: string
  [key: string]: unknown
}

function mapStatus(raw: RawPenneoSigner): SignerStatus {
  if (raw.signed) return 'signed'
  if (raw.declined) return 'declined'
  if (raw.hasViewedDocuments) return 'delivered'
  return 'sent'
}

export function transformSigner(raw: RawPenneoSigner, envelopeId: string): Signer {
  const id = String(raw.id)
  return {
    id,
    externalId: id,
    envelopeId,
    email: pickStr(raw.email) ?? '',
    name: pickStr(raw.name) ?? '',
    role: 'signer',
    status: mapStatus(raw),
    signedAt: toIso(raw.signedAt),
    declinedAt: toIso(raw.declinedAt),
    deliveredAt: toIso(raw.viewedAt),
    declineReason: pickStr(raw.declineReason),
    platform: 'penneo',
    metadata: strMap({}),
    raw,
  }
}
