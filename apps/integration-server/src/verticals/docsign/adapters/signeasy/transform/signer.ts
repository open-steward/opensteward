import type { Signer, SignerStatus } from '../../../schema/signer'
import { pickStr, requireId, strMap } from './shared'

/**
 * One entry of an envelope's documented `recipients[]`
 * (https://docs.signeasy.com/reference/fetch-envelope-rs-details.md).
 */
export interface RawSignEasyRecipient {
  recipient_id?: number
  recipient_user_id?: number
  first_name?: string
  last_name?: string
  email?: string
  status?: string
  order_id?: number
  decline_message?: string
  group_id?: number
  [key: string]: unknown
}

/**
 * Recipient `status` values seen in the documented responses and webhook
 * payloads: `not_viewed`, `viewed` (list-envelope-rs), `finalized`
 * (list-envelope-signed-documents, rs.signed) and `declined` (rs.declined).
 */
function mapStatus(s: string | undefined): SignerStatus {
  switch (s) {
    case 'finalized':
      return 'signed'
    case 'declined':
      return 'declined'
    case 'viewed':
      return 'delivered'
    case 'not_viewed':
      return 'sent'
    default:
      return 'unknown'
  }
}

export function transformSigner(raw: RawSignEasyRecipient, envelopeId: string): Signer {
  const id = requireId(raw.recipient_id, 'recipient_id')
  const order = raw.order_id
  return {
    id,
    externalId: id,
    envelopeId,
    email: pickStr(raw.email),
    name: [pickStr(raw.first_name), pickStr(raw.last_name)]
      .filter((s): s is string => Boolean(s))
      .join(' '),
    role: 'signer',
    status: mapStatus(raw.status),
    routingOrder:
      typeof order === 'number' && Number.isInteger(order) && order >= 1 ? order : undefined,
    // "decline_message: The reason provided by the recipient if they declined to sign."
    declineReason: pickStr(raw.decline_message),
    platform: 'signeasy',
    metadata: strMap({ recipientUserId: raw.recipient_user_id, groupId: raw.group_id }),
    raw,
  }
}
