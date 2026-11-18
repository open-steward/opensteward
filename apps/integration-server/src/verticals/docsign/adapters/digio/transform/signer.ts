import { z } from 'zod'
import type { Signer, SignerStatus } from '../../../schema/signer'
import { strMap } from './shared'

/**
 * One entry of `signing_parties[]` on Digio's "Get Document Details" reply —
 * `SigningPartyDetailsV2` in
 * https://documentation.digio.in/swagger/get_getDocumentObject.json.
 * Only the documented keys are read.
 */
export interface RawDigioSigningParty {
  /** "Name of the signing party" */
  name?: string
  /** enum ["requested","signed","expired","sequenced","cancelled","removed","failed","skipped"] */
  status?: string
  /** enum ["self","org","signatory"] */
  type?: string
  signature_type?: string
  signature_mode?: string
  /** "Email or mobile of the signing party" */
  identifier?: string
  /** "Reason to sign the document" */
  reason?: string
  /** "'yyyy-mm-dd hh:mm:ss': Timestamp of Sign Request expiry in IST, if set." */
  expire_on?: string
  [key: string]: unknown
}

/**
 * A signing party has no id of its own. Its documented `identifier` ("Email or
 * mobile of the signing party") is used as the key within a document, and the
 * document id makes it readable back through getSigner. The docs do not say an
 * identifier is unique within a document, so listSigners refuses a reply that
 * repeats one rather than emit duplicate ids.
 */
export function digioSignerId(docId: string, identifier: string): string {
  return `${docId}:${identifier}`
}

/**
 * SigningPartyDetailsV2.status:
 *   "'requested': pending signature from user
 *    'signed': signed by user
 *    'expired': user did not sign prior to request expiry"
 * `sequenced` is listed in the enum with no description. Mapping it to
 * `created` is an inference from the name (a party not yet requested in a
 * sequential flow), not a documented fact. The rest have no canonical
 * counterpart.
 */
function mapStatus(status: string | undefined): SignerStatus {
  switch (status) {
    case 'requested':
      return 'sent'
    case 'signed':
      return 'signed'
    case 'sequenced':
      return 'created'
    default:
      return 'unknown'
  }
}

const Email = z.email()

export function transformSigner(raw: RawDigioSigningParty, envelopeId: string): Signer {
  const identifier = typeof raw.identifier === 'string' ? raw.identifier : ''
  if (!identifier) {
    throw new Error(`Digio signing party on document ${envelopeId} has no identifier`)
  }
  if (typeof raw.name !== 'string' || !raw.name) {
    throw new Error(`Digio signing party ${identifier} on document ${envelopeId} has no name`)
  }
  const email = Email.safeParse(identifier).success ? identifier : undefined
  return {
    id: digioSignerId(envelopeId, identifier),
    externalId: identifier,
    envelopeId,
    ...(email ? { email } : {}),
    name: raw.name,
    role: 'signer',
    status: mapStatus(raw.status),
    platform: 'digio',
    metadata: strMap({
      identifier,
      type: raw.type,
      status: raw.status,
      signatureType: raw.signature_type,
      signatureMode: raw.signature_mode,
      reason: raw.reason,
      expireOn: raw.expire_on,
    }),
    raw,
  }
}
