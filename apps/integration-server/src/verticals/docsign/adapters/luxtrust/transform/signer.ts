import type { Signer, SignerStatus } from '../../../schema/signer'
import { pickStr, strMap, toIso } from './shared'

export interface RawLuxTrustSigner {
  id?: string
  email?: string
  name?: string
  order?: number
  status?: string
  signed_at?: string
  declined_at?: string
  delivered_at?: string
  authentication_method?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): SignerStatus {
  const v = (s ?? '').toUpperCase()
  if (v === 'SIGNED' || v === 'COMPLETED') return 'signed'
  if (v === 'DECLINED') return 'declined'
  if (v === 'VIEWED' || v === 'DELIVERED') return 'delivered'
  if (v === 'SENT') return 'sent'
  return 'created'
}

export function transformSigner(raw: RawLuxTrustSigner, envelopeId: string): Signer {
  return {
    id: raw.id ?? raw.email ?? '',
    externalId: raw.id ?? raw.email ?? '',
    envelopeId,
    email: pickStr(raw.email) ?? '',
    name: pickStr(raw.name) ?? '',
    role: 'signer',
    status: mapStatus(raw.status),
    routingOrder: raw.order,
    deliveredAt: toIso(raw.delivered_at),
    signedAt: toIso(raw.signed_at),
    declinedAt: toIso(raw.declined_at),
    platform: 'luxtrust',
    metadata: strMap({ authenticationMethod: raw.authentication_method }),
    raw,
  }
}
