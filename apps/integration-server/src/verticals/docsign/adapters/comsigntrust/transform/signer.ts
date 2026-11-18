import type { Signer, SignerStatus } from '../../../schema/signer'
import { pickStr, strMap, weSignDate } from './shared'

/**
 * `SignerResponseDTO` from the WeSign v3 OpenAPI
 * (https://wse.comsigntrust.com/api/swagger/v3/swagger.json), the element of
 * `DocumentCollectionResposneDTO.signers`. Only the fields read here are
 * typed; `attachments[].base64File`, `contact.seals[].base64Image` and
 * `signerAuthentication.otpDetails` (which carries the OTP `code`) are
 * dropped from `raw` by {@link redactSigner}.
 */
export interface RawWeSignSigner {
  id?: string
  name?: string | null
  status?: number
  timeSent?: string | null
  timeViewed?: string
  timeSigned?: string
  timeRejected?: string
  sendingMethod?: number
  contact?: { id?: string; name?: string | null; email?: string | null; [key: string]: unknown }
  [key: string]: unknown
}

/**
 * The list endpoint's description:
 *   "SignerStatus:  Sent = 1, Viewed = 2, Signed = 3, Rejected = 4"
 */
function mapStatus(s: number | undefined): SignerStatus {
  switch (s) {
    case 1:
      return 'sent'
    case 2:
      return 'delivered'
    case 3:
      return 'signed'
    case 4:
      return 'declined'
    default:
      return 'unknown'
  }
}

/** "SendingMethod: SMS = 1, Email = 2, Tablet = 3, WhatsApp = 4" */
const SENDING_METHOD: Record<number, string> = { 1: 'sms', 2: 'email', 3: 'tablet', 4: 'whatsapp' }

/** A signer with its seal images, attachment bytes and OTP details removed. */
export function redactSigner(raw: RawWeSignSigner): Record<string, unknown> {
  const { attachments: _a, signerAuthentication: _s, contact, ...rest } = raw
  if (!contact) return rest
  const { seals: _seals, ...contactRest } = contact
  return { ...rest, contact: contactRest }
}

/** Canonical id of a WeSign signer: signers are only addressable within their collection. */
export function signerId(collectionId: string, id: string): string {
  return `${collectionId}:${id}`
}

export function transformSigner(raw: RawWeSignSigner, envelopeId: string): Signer {
  const externalId = pickStr(raw.id)
  if (!externalId) throw new Error(`WeSign signer on collection ${envelopeId} has no id`)
  const method = raw.sendingMethod === undefined ? undefined : SENDING_METHOD[raw.sendingMethod]
  return {
    id: signerId(envelopeId, externalId),
    externalId,
    envelopeId,
    email: pickStr(raw.contact?.email),
    // `name` is nullable in the spec; a signer without one has no name to show.
    name: pickStr(raw.name) ?? '',
    // Every SignerResponseDTO is a signer: WeSign has no cc/viewer recipient type.
    role: 'signer',
    status: mapStatus(raw.status),
    sentAt: weSignDate(raw.timeSent),
    deliveredAt: weSignDate(raw.timeViewed),
    signedAt: weSignDate(raw.timeSigned),
    declinedAt: weSignDate(raw.timeRejected),
    platform: 'comsigntrust',
    metadata: strMap({ sendingMethod: method }),
    raw: redactSigner(raw),
  }
}
