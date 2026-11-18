import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { epochSecondsToIso, pickStr, requireId, requireStr, strMap } from './shared'
import type { RawSignEasyRecipient } from './signer'
import type { RawSignEasySource } from './document'

/**
 * A pending envelope as documented by "Fetch an envelope"
 * (GET /rs/envelope/{pending_file_id}) and "Fetch all envelopes"
 * (GET /rs/envelope/), and as the `pending_file` of a "Fetch all signed
 * envelopes" item (GET /rs/envelope/signed/). Only documented fields are read.
 * https://docs.signeasy.com/reference/fetch-envelope-rs-details.md
 */
export interface RawSignEasyEnvelope {
  id?: number
  status?: string
  name?: string
  subject?: string
  message?: string
  owner_user_id?: number
  owner_email?: string
  owner_first_name?: string
  owner_last_name?: string
  is_ordered?: number
  created_time?: number
  last_modified_time?: number
  expiry_time?: number
  recipients?: RawSignEasyRecipient[]
  sources?: RawSignEasySource[]
  request_info?: Record<string, unknown>
  [key: string]: unknown
}

/**
 * Envelope `status` values the docs name: "irrespective of whether the
 * envelope's `status` is `complete`, `incomplete`, `canceled` or
 * `recipient_declined`" (fetch-envelope-rs-details), and `"status": "expired"`
 * in the rs.expired payload (https://docs.signeasy.com/reference/rsexpired.md).
 */
function mapStatus(s: string | undefined): EnvelopeStatus {
  switch (s) {
    case 'complete':
      return 'completed'
    case 'incomplete':
      return 'sent'
    case 'canceled':
      return 'voided'
    case 'recipient_declined':
      return 'declined'
    case 'expired':
      return 'expired'
    default:
      return 'unknown'
  }
}

/**
 * `is_ordered` is an integer flag in every documented envelope response
 * (`"is_ordered": 0` in list-envelope-rs, `"is_ordered": 1` in
 * fetch-envelope-rs-details). Any other value has no documented meaning.
 */
function signingOrder(v: unknown): 'sequential' | 'parallel' {
  if (v === 1) return 'sequential'
  if (v === 0) return 'parallel'
  throw new Error(`SignEasy envelope is_ordered is not the documented 0 or 1: ${String(v)}`)
}

function fullName(first: unknown, last: unknown): string {
  return [pickStr(first), pickStr(last)].filter((s): s is string => Boolean(s)).join(' ')
}

/**
 * Which documented field holds the envelope's title in this response.
 * - 'name': the list endpoints. GET /rs/envelope/ items and the `pending_file`
 *   of GET /rs/envelope/signed/ items carry `"name": "Employment Agreement -
 *   Prashanth.pdf"` and no `subject`.
 * - 'subject': the detail. GET /rs/envelope/{pending_file_id} documents
 *   `"subject": { "type": "string", "example": "" }` and no envelope `name`,
 *   so an empty subject there is the documented value, not a default.
 */
export type EnvelopeSubjectField = 'name' | 'subject'

function subjectOf(raw: RawSignEasyEnvelope, field: EnvelopeSubjectField): string {
  if (field === 'name') return requireStr(raw.name, 'envelope name')
  if (typeof raw.subject !== 'string') throw new Error('SignEasy envelope subject is missing')
  return raw.subject
}

export function transformEnvelope(
  raw: RawSignEasyEnvelope,
  subjectField: EnvelopeSubjectField,
): Envelope {
  const id = requireId(raw.id, 'envelope')
  const senderName = fullName(raw.owner_first_name, raw.owner_last_name)
  return {
    id,
    externalId: id,
    status: mapStatus(raw.status),
    subject: subjectOf(raw, subjectField),
    message: pickStr(raw.message),
    senderId: pickStr(raw.owner_user_id),
    senderEmail: pickStr(raw.owner_email),
    senderName: senderName || undefined,
    signingOrder: signingOrder(raw.is_ordered),
    signerIds: (raw.recipients ?? []).map((r) => requireId(r.recipient_id, 'recipient')),
    documentIds: (raw.sources ?? []).map((s) => requireId(s.id, 'source')),
    createdAt: epochSecondsToIso(raw.created_time),
    updatedAt: epochSecondsToIso(raw.last_modified_time),
    expiresAt: epochSecondsToIso(raw.expiry_time),
    platform: 'signeasy',
    // "request_info: Custom metadata specific to you, returned as-is from the request."
    metadata: strMap(raw.request_info),
    raw,
  }
}
