import type { Signer, SignerStatus } from '../../../schema/signer'
import { pickStr, strMap, toIso } from './shared'

/**
 * A signatory on an e-Signature.eu request. Delivered as a value in the
 * request's `signers` object, keyed by 1-indexed signing position.
 *
 * Signature artefacts (handwritten image, eID attributes beyond the verified
 * name) are never surfaced — only lifecycle metadata crosses the firewall.
 */
export interface RawESignatureEuSigner {
  firstname?: string
  lastname?: string
  email?: string
  phone?: string
  sign_first?: boolean
  status?: string
  signing_time?: string
  signing_method?: string
  verified_firstname?: string
  verified_lastname?: string
  // signature_link is a time-limited signing URL — surfaced under metadata
  // only while pending; never treated as document content.
  signature_link?: string
  [key: string]: unknown
}

/**
 * Signatory status → canonical signer status.
 *   pending → sent     (invited, awaiting their signature)
 *   signed  → signed
 *   skipped → auto_responded (group terminated before they signed)
 */
function mapStatus(s: string | undefined): SignerStatus {
  switch (s) {
    case 'pending':
      return 'sent'
    case 'signed':
      return 'signed'
    case 'declined':
      return 'declined'
    case 'skipped':
      return 'auto_responded'
    default:
      return 'created'
  }
}

export function transformSigner(
  raw: RawESignatureEuSigner,
  envelopeId: string,
  position: string,
): Signer {
  const id = `${envelopeId}:${position}`
  const order = Number(position)
  const name = [raw.firstname, raw.lastname].filter(Boolean).join(' ')
  return {
    id,
    externalId: id,
    envelopeId,
    email: pickStr(raw.email) ?? '',
    name: name || '',
    role: 'signer',
    status: mapStatus(raw.status),
    routingOrder: Number.isInteger(order) && order >= 1 ? order : undefined,
    signedAt: toIso(raw.signing_time),
    platform: 'e-signature-eu',
    metadata: strMap({
      phone: raw.phone,
      signFirst: raw.sign_first,
      signingMethod: raw.signing_method,
      verifiedFirstname: raw.verified_firstname,
      verifiedLastname: raw.verified_lastname,
      signatureLink: raw.signature_link,
    }),
    raw,
  }
}
