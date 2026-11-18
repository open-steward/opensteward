import type { Signer, SignerRole, SignerStatus } from '../../../schema/signer'
import { pickStr, strMap, toIso } from './shared'
import type { RawClicksignSigner } from './envelope'

function mapRole(raw: string | undefined): SignerRole {
  switch ((raw ?? '').toLowerCase()) {
    case 'witness':
      return 'witness'
    case 'approver':
    case 'approve':
      return 'approver'
    case 'cc':
    case 'observer':
      return 'cc'
    case 'editor':
      return 'editor'
    default:
      return 'signer'
  }
}

function mapStatus(raw: RawClicksignSigner): SignerStatus {
  const s = (raw.status ?? '').toLowerCase()
  if (raw.signed_at || s === 'signed') return 'signed'
  if (raw.refused_at || s === 'refused' || s === 'declined') return 'declined'
  if (s === 'delivered' || raw.delivered_at) return 'delivered'
  if (s === 'sent' || raw.sent_at) return 'sent'
  return 'created'
}

export function transformSigner(raw: RawClicksignSigner, envelopeId: string): Signer {
  return {
    id: raw.key ?? `${envelopeId}:${raw.email ?? ''}`,
    externalId: raw.key ?? `${envelopeId}:${raw.email ?? ''}`,
    envelopeId,
    email: pickStr(raw.email) ?? '',
    name: pickStr(raw.name) ?? '',
    role: mapRole(raw.sign_as),
    status: mapStatus(raw),
    routingOrder: typeof raw.sign_order === 'number' ? raw.sign_order : undefined,
    sentAt: toIso(raw.sent_at),
    deliveredAt: toIso(raw.delivered_at),
    signedAt: toIso(raw.signed_at),
    declinedAt: toIso(raw.refused_at),
    declineReason: pickStr(raw.refusal_reason),
    platform: 'clicksign',
    metadata: strMap({ signAs: raw.sign_as }),
    raw,
  }
}
