import type { Signer, SignerRole, SignerStatus } from '../../../schema/signer'
import { pickStr, strMap, toIso } from './shared'
import type { RawD4SignSigner } from './envelope'

function mapRole(act: string | undefined): SignerRole {
  const a = (act ?? '').toLowerCase()
  if (a.includes('test') || a.includes('witness')) return 'witness'
  if (a.includes('approv')) return 'approver'
  if (a.includes('cc') || a.includes('observ')) return 'cc'
  return 'signer'
}

function mapStatus(raw: RawD4SignSigner): SignerStatus {
  if (raw.signed_at || raw.user_signed === '1' || raw.user_signed === 'true') return 'signed'
  if (raw.refused_at) return 'declined'
  return 'sent'
}

export function transformSigner(raw: RawD4SignSigner, envelopeId: string): Signer {
  const id = raw.uuid ?? raw.uuid_signer ?? `${envelopeId}:${raw.email_signer ?? raw.email ?? ''}`
  return {
    id,
    externalId: id,
    envelopeId,
    email: pickStr(raw.email_signer) ?? pickStr(raw.email) ?? '',
    name: pickStr(raw.name_signer) ?? pickStr(raw.name) ?? '',
    role: mapRole(raw.act),
    status: mapStatus(raw),
    routingOrder: typeof raw.order === 'number' ? raw.order : undefined,
    signedAt: toIso(raw.signed_at),
    declinedAt: toIso(raw.refused_at),
    declineReason: pickStr(raw.refused_reason),
    platform: 'd4sign',
    metadata: strMap({ signatureType: raw.signature_type, act: raw.act }),
    raw,
  }
}
