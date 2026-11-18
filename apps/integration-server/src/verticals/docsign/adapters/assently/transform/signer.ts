import type { Signer, SignerStatus } from '../../../schema/signer'
import { pickNum, pickStr, strMap, toIso } from './shared'

/**
 * Assently PartyModel → canonical Signer.
 *
 * A party is a person on the case who signs (or is invited to sign). Assently
 * has no separate "viewed" event on the read API, so signer status is derived
 * from `signedOn` plus the e-mail `notificationStatus`.
 */
export interface RawAssentlyParty {
  id?: string
  name?: string
  groupName?: string
  emailAddress?: string
  mobilePhone?: string
  signedOn?: string
  signsAs?: number
  signatureType?: string
  provider?: string
  culture?: string
  reviewed?: boolean
  anyoneCanSign?: boolean
  ipAddress?: string
  notificationStatus?: { email?: string }
  [key: string]: unknown
}

function mapStatus(raw: RawAssentlyParty): SignerStatus {
  if (raw.signedOn) return 'signed'
  const email = (raw.notificationStatus?.email ?? '').toLowerCase()
  if (email === 'delivered') return 'delivered'
  if (email === 'undeliverable') return 'auto_responded'
  if (email === 'sent') return 'sent'
  return 'created'
}

export function transformSigner(raw: RawAssentlyParty, envelopeId: string): Signer {
  const partyId = pickStr(raw.id) ?? ''
  // Assently `signsAs` is a 0-indexed signing-order group; the canonical
  // routingOrder is 1-indexed and only meaningful for sequential signing.
  const order = pickNum(raw.signsAs)
  return {
    id: `${envelopeId}:${partyId}`,
    externalId: partyId,
    envelopeId,
    email: pickStr(raw.emailAddress) || undefined,
    name: pickStr(raw.name) ?? '',
    role: 'signer',
    status: mapStatus(raw),
    routingOrder: order !== undefined ? order + 1 : undefined,
    signedAt: toIso(raw.signedOn),
    platform: 'assently',
    metadata: strMap({
      groupName: raw.groupName,
      mobilePhone: raw.mobilePhone,
      signatureType: raw.signatureType,
      provider: raw.provider,
      culture: raw.culture,
      reviewed: raw.reviewed,
      ipAddress: raw.ipAddress,
      emailNotificationStatus: raw.notificationStatus?.email,
    }),
    raw,
  }
}
