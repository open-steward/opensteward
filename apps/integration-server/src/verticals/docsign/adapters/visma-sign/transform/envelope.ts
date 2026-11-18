import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { strMap } from './shared'

/**
 * One invitation as `GET /api/v1/document/{uuid}` returns it
 * (https://sign.visma.net/api/docs/v1/, "Get document status"):
 *
 *     "invitations": [{ "uuid": "2076…", "status": "new", "passphrase": "989c687b",
 *                       "email": "kumppanit.sign+invitee@visma.com", "sms": "+358408269139" }]
 *
 * `name` and `order` are the invitation's own fields from "Create invitations
 * for document" (`"name": "Test Person", // Optional`, `"order": { "index": 1,
 * "require_before_sending_next_invitations": false }`); the status response
 * "may contain additional information", so they are read when present and
 * never assumed.
 */
export interface RawVismaSignInvitation {
  uuid: string
  status?: string
  passphrase?: string
  email?: string
  sms?: string
  name?: string
  order?: {
    index?: number
    require_before_sending_next_invitations?: boolean
  }
}

/** `files` entry of the document status response: `{ "filename": "0959….pdf" }`. */
export interface RawVismaSignFile {
  filename?: string
}

/**
 * A document from "Get document status" (`GET /api/v1/document/{uuid}`), and
 * each row of "Search documents" (`GET /api/v1/document/?…`), whose response is
 * `"documents": [ ... documents like in get document status ]`.
 */
export interface RawVismaSignDocument {
  uuid: string
  name: string
  status?: string
  files?: RawVismaSignFile[]
  invitations?: RawVismaSignInvitation[]
}

/**
 * Document statuses, verbatim from the docs:
 *   new       "no invitations have been created for it"
 *   pending   "The document has unfulfilled invitations."
 *   signed    "All the invitations have been fulfilled and the document is complete."
 *   deleted   "The document was deleted before any invitations were created for it."
 *   cancelled "The document and related invitations have been cancelled."
 * `deleted` has no canonical counterpart, so it is `unknown` with the raw
 * status kept in metadata.
 */
function mapStatus(s: string | undefined): EnvelopeStatus {
  switch (s) {
    case 'new':
      return 'draft'
    case 'pending':
      return 'sent'
    case 'signed':
      return 'completed'
    case 'cancelled':
      return 'voided'
    default:
      return 'unknown'
  }
}

/**
 * "If you want to sign the document in a specified order, this value must be
 * true" (`order.require_before_sending_next_invitations`, "Create invitations
 * for document"). The `order` object is optional; without it no order is
 * enforced.
 */
export function isSequential(invitations: readonly RawVismaSignInvitation[]): boolean {
  return invitations.some((i) => i.order?.require_before_sending_next_invitations === true)
}

/**
 * A file is addressed by its document and position — "Get document file" is
 * `GET /api/v1/document/{uuid}/files/0` — so that pair is its id.
 */
export function documentFileId(documentUuid: string, index: number): string {
  return `${documentUuid}:${index}`
}

/**
 * The invitation passphrase opens the invitation and fetches its file
 * ("the file can be fetched by using an invitation uuid and passphrase"), so
 * it never leaves the adapter in `raw`.
 */
export function scrubInvitation(
  inv: RawVismaSignInvitation,
): Omit<RawVismaSignInvitation, 'passphrase'> {
  const { passphrase: _passphrase, ...rest } = inv
  return rest
}

export function scrubDocument(raw: RawVismaSignDocument): RawVismaSignDocument {
  return raw.invitations ? { ...raw, invitations: raw.invitations.map(scrubInvitation) } : raw
}

export function transformEnvelope(raw: RawVismaSignDocument): Envelope {
  const invitations = raw.invitations ?? []
  return {
    id: raw.uuid,
    externalId: raw.uuid,
    status: mapStatus(raw.status),
    subject: raw.name,
    signingOrder: isSequential(invitations) ? 'sequential' : 'parallel',
    signerIds: invitations.map((i) => i.uuid),
    documentIds: (raw.files ?? []).map((_f, i) => documentFileId(raw.uuid, i)),
    platform: 'visma-sign',
    metadata: strMap({ status: raw.status }),
    raw: scrubDocument(raw),
  }
}
