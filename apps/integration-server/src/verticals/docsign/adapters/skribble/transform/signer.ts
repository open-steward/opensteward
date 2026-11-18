import type { Signer, SignerStatus } from '../../../schema/signer'
import { pickStr, strMap, toIso } from './shared'

export interface RawSkribbleSignature {
  sid?: string
  account_email?: string
  signer_identity_data?: {
    email_address?: string
    first_name?: string
    last_name?: string
    mobile_number?: string
    language?: string
  }
  status_code?: string
  signed_at?: string
  notified_at?: string
  viewed_at?: string
  declined_at?: string
  decline_reason?: string
  order?: number
  visual_signature?: unknown
  [key: string]: unknown
}

function mapStatus(s: string | undefined): SignerStatus {
  switch (s) {
    case 'OPEN':
      return 'sent'
    case 'SIGNED':
      return 'signed'
    case 'DECLINED':
      return 'declined'
    case 'WITHDRAWN':
      return 'auto_responded'
    case 'VIEWED':
      return 'delivered'
    default:
      return 'created'
  }
}

export function transformSigner(raw: RawSkribbleSignature, envelopeId: string): Signer {
  const id = pickStr(raw.sid) ?? ''
  const email =
    pickStr(raw.signer_identity_data?.email_address) ?? pickStr(raw.account_email) ?? ''
  const name = [
    raw.signer_identity_data?.first_name,
    raw.signer_identity_data?.last_name,
  ]
    .filter(Boolean)
    .join(' ')
  return {
    id,
    externalId: id,
    envelopeId,
    email,
    name: name || '',
    role: 'signer',
    status: mapStatus(raw.status_code),
    routingOrder: raw.order ?? undefined,
    sentAt: toIso(raw.notified_at),
    deliveredAt: toIso(raw.viewed_at),
    signedAt: toIso(raw.signed_at),
    declinedAt: toIso(raw.declined_at),
    declineReason: pickStr(raw.decline_reason),
    platform: 'skribble',
    metadata: strMap({ language: raw.signer_identity_data?.language }),
    // Strip visual_signature before returning raw — eIDAS-qualified visual
    // signatures may be legally-distinct biometric attestations.
    raw: { ...raw, visual_signature: undefined },
  }
}
