import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIso } from './shared'

export interface RawJuroSignature {
  uid?: string
  username?: string
  email?: string
  name?: string
  signingUrl?: string
  [key: string]: unknown
}

export interface RawJuroSigningSide {
  uid?: string
  name?: string
  signatures?: RawJuroSignature[]
  [key: string]: unknown
}

export interface RawJuroContract {
  id: string
  name?: string
  status?: string
  createdDate?: string
  updatedDate?: string
  teamId?: string
  template?: { id?: string; name?: string }
  owner?: { name?: string; username?: string }
  signingSides?: RawJuroSigningSide[]
  internalUrl?: string
  sharingUrl?: string
  [key: string]: unknown
}

/**
 * Map Juro contract status → canonical EnvelopeStatus.
 *
 * Juro states: draft · sent for approval · approved · rejected ·
 * sent for signing · signed by us · signed by them · fully signed.
 */
function mapStatus(s: string | undefined): EnvelopeStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'draft':
      return 'draft'
    case 'sent for approval':
    case 'approved':
    case 'sent for signing':
    case 'signed by us':
    case 'signed by them':
      return 'sent'
    case 'fully signed':
      return 'completed'
    case 'rejected':
      return 'declined'
    default:
      return 'draft'
  }
}

/** Stable per-signature id: `<signingSideUid>:<signatureKey>`. */
export function juroSignatureId(
  side: RawJuroSigningSide,
  sig: RawJuroSignature,
): string {
  const sigKey = sig.uid ?? sig.email ?? sig.username ?? ''
  return side.uid ? `${side.uid}:${sigKey}` : sigKey
}

export function transformEnvelope(raw: RawJuroContract): Envelope {
  const sides = raw.signingSides ?? []
  const signerIds: string[] = []
  for (const side of sides) {
    for (const sig of side.signatures ?? []) {
      const id = juroSignatureId(side, sig)
      if (id) signerIds.push(id)
    }
  }
  return {
    id: raw.id,
    externalId: raw.id,
    status: mapStatus(raw.status),
    subject: pickStr(raw.name) ?? '',
    senderId: pickStr(raw.owner?.username),
    senderName: pickStr(raw.owner?.name),
    // Juro signing sides sign in sequence (your side, then the counterparty).
    signingOrder: sides.length > 1 ? 'sequential' : 'parallel',
    signerIds,
    // A Juro contract IS the document; expose one synthetic document per contract.
    documentIds: [raw.id],
    templateId: pickStr(raw.template?.id),
    createdAt: toIso(raw.createdDate),
    updatedAt: toIso(raw.updatedDate),
    platform: 'juro',
    metadata: strMap({
      teamId: raw.teamId,
      templateName: raw.template?.name,
      internalUrl: raw.internalUrl,
      sharingUrl: raw.sharingUrl,
    }),
    raw,
  }
}
