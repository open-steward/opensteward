import type { Signer, SignerStatus } from '../../../schema/signer'
import { pickStr, strMap, toIso } from './shared'

export interface RawAutentiqueSignature {
  public_id?: string
  name?: string
  email?: string
  action?: { name?: string }
  user?: { id?: string; name?: string; email?: string }
  user_data?: { name?: string; email?: string }
  signed?: { ip?: string; created_at?: string }
  rejected?: { reason?: string; created_at?: string }
  viewed?: { created_at?: string }
  created_at?: string
}

function mapStatus(raw: RawAutentiqueSignature): SignerStatus {
  if (raw.signed) return 'signed'
  if (raw.rejected) return 'declined'
  if (raw.viewed) return 'delivered'
  return 'sent'
}

export function transformSigner(raw: RawAutentiqueSignature, envelopeId: string): Signer {
  return {
    id: raw.public_id ?? raw.email ?? '',
    externalId: raw.public_id ?? raw.email ?? '',
    envelopeId,
    email: pickStr(raw.user?.email ?? raw.user_data?.email ?? raw.email) ?? '',
    name: pickStr(raw.user?.name ?? raw.user_data?.name ?? raw.name) ?? '',
    role: 'signer',
    status: mapStatus(raw),
    sentAt: toIso(raw.created_at),
    deliveredAt: toIso(raw.viewed?.created_at),
    signedAt: toIso(raw.signed?.created_at),
    declinedAt: toIso(raw.rejected?.created_at),
    declineReason: pickStr(raw.rejected?.reason),
    platform: 'autentique',
    metadata: strMap({ action: raw.action?.name, ip: raw.signed?.ip }),
    raw,
  }
}
