import type { Signer, SignerStatus } from '../../../schema/signer'
import { pickStr, strMap, toIso } from './shared'

export interface RawCloudSignParticipant {
  id?: string
  email?: string
  name?: string
  order?: number
  status?: string
  signed_at?: string
  declined_at?: string
  delivered_at?: string
  sent_at?: string
  decline_reason?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): SignerStatus {
  switch (s) {
    case 'signed':
    case 'completed':
      return 'signed'
    case 'declined':
      return 'declined'
    case 'viewed':
    case 'delivered':
      return 'delivered'
    case 'sent':
      return 'sent'
    default:
      return 'created'
  }
}

export function transformSigner(raw: RawCloudSignParticipant, envelopeId: string): Signer {
  return {
    id: raw.id ?? raw.email ?? '',
    externalId: raw.id ?? raw.email ?? '',
    envelopeId,
    email: pickStr(raw.email) ?? '',
    name: pickStr(raw.name) ?? '',
    role: 'signer',
    status: mapStatus(raw.status),
    routingOrder: raw.order,
    sentAt: toIso(raw.sent_at),
    deliveredAt: toIso(raw.delivered_at),
    signedAt: toIso(raw.signed_at),
    declinedAt: toIso(raw.declined_at),
    declineReason: pickStr(raw.decline_reason),
    platform: 'cloudsign',
    metadata: strMap({}),
    raw,
  }
}
