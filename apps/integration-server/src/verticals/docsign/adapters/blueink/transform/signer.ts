import type { Signer, SignerStatus } from '../../../schema/signer'
import { pickNum, pickStr, strMap, toIsoDatetime } from './shared'
import type { RawBlueinkPacket } from './envelope'

/**
 * Blueink Packet → canonical Signer. A packet is a single signer on a bundle.
 * Blueink has no recipient-role taxonomy (cc/witness/editor); every packet is
 * a signer, so `role` is always 'signer'. `deliver_via` (email/embed/phone)
 * is surfaced in metadata.
 *
 * Packet status codes:
 *   ne=new, re=ready, se=sent, st=started, ca=cancelled, ex=expired,
 *   co=complete, fa=failed.
 */
function mapStatus(s: string | undefined): SignerStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'co':
      return 'signed'
    case 'fa':
      return 'declined'
    case 'st':
      return 'delivered'
    case 'se':
      return 'sent'
    case 'ex':
    case 'ca':
      return 'auto_responded'
    case 'ne':
    case 're':
    default:
      return 'created'
  }
}

export function transformSigner(raw: RawBlueinkPacket, envelopeId: string): Signer {
  const externalId = raw.id ?? raw.key ?? ''
  return {
    id: externalId || `${envelopeId}:${raw.key ?? ''}`,
    externalId,
    envelopeId,
    email: pickStr(raw.email) ?? '',
    name: pickStr(raw.name) ?? '',
    role: 'signer',
    status: mapStatus(raw.status),
    routingOrder: pickNum(raw.order),
    signedAt: toIsoDatetime(raw.completed_at),
    platform: 'blueink',
    metadata: strMap({
      key: raw.key,
      phone: raw.phone,
      deliverVia: raw.deliver_via,
      personId: raw.person_id,
      lastAccessedAt: raw.last_accessed_at,
      authSms: raw.auth_sms,
      authSelfie: raw.auth_selfie,
      authId: raw.auth_id,
    }),
    raw,
  }
}
