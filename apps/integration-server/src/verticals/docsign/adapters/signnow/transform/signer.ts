import type { Signer, SignerRole, SignerStatus } from '../../../schema/signer'
import { epochToIso, pickStr, strMap } from './shared'

export interface RawSignNowFieldInvite {
  id: string
  email?: string
  signer_id?: string
  status?: string
  role?: string
  order?: number
  created?: string | number
  expiration_time?: string | number
  signature?: { id?: string; created?: string | number }
  [key: string]: unknown
}

function mapRole(r: string | undefined): SignerRole {
  switch (r?.toLowerCase()) {
    case 'cc':
      return 'cc'
    case 'approver':
      return 'approver'
    case 'editor':
      return 'editor'
    case 'viewer':
      return 'cc'
    default:
      return 'signer'
  }
}

function mapStatus(s: string | undefined): SignerStatus {
  switch (s?.toLowerCase()) {
    case 'fulfilled':
    case 'signed':
      return 'signed'
    case 'declined':
      return 'declined'
    case 'pending':
      return 'sent'
    case 'created':
      return 'created'
    default:
      return 'sent'
  }
}

export function transformSigner(raw: RawSignNowFieldInvite, envelopeId: string): Signer {
  return {
    id: raw.id,
    externalId: raw.id,
    envelopeId,
    email: pickStr(raw.email) ?? '',
    name: '',
    role: mapRole(raw.role),
    status: mapStatus(raw.status),
    routingOrder: raw.order ?? undefined,
    sentAt: epochToIso(raw.created),
    signedAt: epochToIso(raw.signature?.created),
    platform: 'signnow',
    metadata: strMap({ signerId: raw.signer_id, expirationTime: raw.expiration_time }),
    raw,
  }
}
