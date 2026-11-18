import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIso } from './shared'
import { documentFileIds } from './document'

/**
 * A signatory field, per the "Signatory" definition at
 * https://apidocs.scrive.com/ ("SignatoryFieldName": type "name", order 1|2,
 * value; "SignatoryFieldEmailMobile": type "email" | "mobile", value).
 */
export interface RawScriveField {
  type?: string
  order?: number
  value?: string
  [key: string]: unknown
}

/** A party ("Signatory" definition) as returned inside a Document. */
export interface RawScriveParty {
  id: string
  user_id?: string | null
  is_author?: boolean
  is_signatory?: boolean
  signatory_role?: string
  fields?: RawScriveField[]
  sign_order?: number
  sign_time?: string | null
  seen_time?: string | null
  read_invitation_time?: string | null
  rejected_time?: string | null
  rejection_reason?: string | null
  authentication_method_to_view?: string
  authentication_method_to_sign?: string
  [key: string]: unknown
}

/** `file` / `sealed_file`: "The file object has the following properties: id, name". */
export interface RawScriveFileRef {
  id: string
  name?: string
}

/** An `author_attachments` element: name, description, required, add_to_sealed_file, file_id. */
export interface RawScriveAuthorAttachment {
  name?: string
  description?: string
  required?: boolean
  add_to_sealed_file?: boolean
  file_id?: string
}

/** The "Document" definition at https://apidocs.scrive.com/ (fields this adapter reads). */
export interface RawScriveDocument {
  id: string
  title?: string
  status?: string
  invitation_message?: string
  parties?: RawScriveParty[]
  file?: RawScriveFileRef | null
  sealed_file?: RawScriveFileRef | null
  author_attachments?: RawScriveAuthorAttachment[]
  ctime?: string
  mtime?: string
  timeout_time?: string | null
  is_template?: boolean
  [key: string]: unknown
}

/**
 * Document `status` enum: "preparation" "awaiting_start" "pending" "closed"
 * "canceled" "timedout" "rejected" "document_error".
 */
function mapStatus(s: string | undefined): EnvelopeStatus {
  switch (s) {
    case 'preparation':
      return 'draft'
    case 'pending':
      return 'sent'
    case 'closed':
      return 'completed'
    case 'canceled':
      return 'voided'
    case 'rejected':
      return 'declined'
    case 'timedout':
      return 'expired'
    default:
      // "awaiting_start" (bulk send queued) and "document_error" have no
      // canonical equivalent.
      return 'unknown'
  }
}

/** The value of the party's field of `type` (and `order`, for names). */
export function fieldValue(
  fields: RawScriveField[] | undefined,
  type: string,
  order?: number,
): string | undefined {
  const f = (fields ?? []).find(
    (x) => x.type === type && (order === undefined || x.order === order),
  )
  return typeof f?.value === 'string' && f.value !== '' ? f.value : undefined
}

/** First name (order 1) and last name (order 2), joined. */
export function partyName(fields: RawScriveField[] | undefined): string | undefined {
  const parts = [fieldValue(fields, 'name', 1), fieldValue(fields, 'name', 2)].filter(
    (s): s is string => s !== undefined,
  )
  return parts.length > 0 ? parts.join(' ') : undefined
}

/**
 * Document "title (string) The title of the document." A document without a
 * string title is not a documented Document, so this throws rather than
 * inventing one. An empty title is the vendor's own value and is kept.
 */
export function documentTitle(raw: RawScriveDocument): string {
  if (typeof raw.title !== 'string') {
    throw new Error(`scrive document ${raw.id} has no "title"`)
  }
  return raw.title
}

export function transformEnvelope(raw: RawScriveDocument): Envelope {
  const parties = raw.parties ?? []
  const orders = parties.map((p) => p.sign_order)
  const signing: 'parallel' | 'sequential' = new Set(orders).size > 1 ? 'sequential' : 'parallel'
  // "is_author (boolean, read only) Whether this party is the author of the document."
  const author = parties.find((p) => p.is_author === true)
  return {
    id: raw.id,
    externalId: raw.id,
    status: mapStatus(raw.status),
    subject: documentTitle(raw),
    message: pickStr(raw.invitation_message),
    senderId: pickStr(author?.id),
    senderEmail: fieldValue(author?.fields, 'email'),
    senderName: partyName(author?.fields),
    signingOrder: signing,
    signerIds: parties.map((p) => p.id),
    documentIds: documentFileIds(raw),
    createdAt: toIso(raw.ctime),
    updatedAt: toIso(raw.mtime),
    expiresAt: toIso(raw.timeout_time),
    platform: 'scrive',
    metadata: strMap({ status: raw.status }),
    raw,
  }
}
