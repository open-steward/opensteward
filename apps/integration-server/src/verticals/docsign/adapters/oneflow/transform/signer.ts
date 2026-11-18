import type { Signer, SignerStatus } from '../../../schema/signer'
import { pickStr, strMap, toIso } from './shared'
import type { RawOneflowParticipant } from './envelope'

function mapStatus(raw: RawOneflowParticipant): SignerStatus {
  if (raw.signed_time) return 'signed'
  if (raw.declined_time) return 'declined'
  if (raw.viewed_time) return 'delivered'
  if (raw.delivered_time) return 'sent'
  return 'created'
}

export function transformSigner(raw: RawOneflowParticipant, envelopeId: string): Signer {
  const id = raw.id !== undefined ? String(raw.id) : raw.email ?? ''
  return {
    id,
    externalId: id,
    envelopeId,
    email: pickStr(raw.email) ?? '',
    name: pickStr(raw.name) ?? '',
    role: 'signer',
    status: mapStatus(raw),
    routingOrder: raw.signing_order,
    sentAt: toIso(raw.delivered_time),
    deliveredAt: toIso(raw.viewed_time),
    signedAt: toIso(raw.signed_time),
    declinedAt: toIso(raw.declined_time),
    platform: 'oneflow',
    metadata: strMap({}),
    raw,
  }
}
