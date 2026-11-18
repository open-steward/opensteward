import type { Signer, SignerStatus } from '../../../schema/signer'
import { strMap } from './shared'

/**
 * One element of `document.recipients[]` in `GET /public/v1/documents/:id`
 * (https://api.rightsignature.com/documentation/resources/v1/documents, show
 * example). Only the fields that example carries are declared:
 *
 *   "role_name": "signer2", "name": "Susie Orange", "email": "susie@citrix.com",
 *   "status": "pending", "id": "c76fad94-...", "sign_url": "...",
 *   "remind_url": "...", "message": "Please sign.", "sequence": 1
 */
export interface RawRightSignatureRecipient {
  id: string
  role_name?: string
  name?: string
  email?: string
  status?: string
  message?: string
  sequence?: number
  sign_url?: string
  remind_url?: string
}

/**
 * Recipient `status` values the vendor documents: `pending` (documents show
 * example, the only value that example's `recipients[]` carries) and `signed`.
 * `signed` is BORROWED from a different resource: the `signers[]` element of
 * archived_documents find_by_original_guid
 * (https://api.rightsignature.com/documentation/resources/v1), which has
 * `"status": "signed"`. Nothing documents that v1 `recipients[]` itself ever
 * reports `signed`; it is mapped because it is the same vendor's recipient
 * status vocabulary, and the raw value is always kept in `metadata.status`.
 * `pending` is not mapped: the show example has two `pending` recipients of a
 * sent document while `current_signer_id` names only one of them, so it does
 * not say whether a pending recipient has been notified. Anything unmapped is
 * `unknown`, with the platform's value kept in `metadata.status`.
 */
function mapStatus(status: string | undefined): SignerStatus {
  if (status === 'signed') return 'signed'
  return 'unknown'
}

export function transformSigner(raw: RawRightSignatureRecipient, envelopeId: string): Signer {
  if (typeof raw.id !== 'string' || raw.id === '') {
    throw new Error(`RightSignature recipient on document ${envelopeId} has no id`)
  }
  // `name` is documented on every recipient and required by the canonical
  // Signer; a missing one is an error, not an empty string.
  if (typeof raw.name !== 'string' || raw.name === '') {
    throw new Error(`RightSignature recipient ${raw.id} on document ${envelopeId} has no name`)
  }
  return {
    id: `${envelopeId}:${raw.id}`,
    externalId: raw.id,
    envelopeId,
    email: raw.email ? raw.email : undefined,
    name: raw.name,
    // The send_document `roles` parameter is documented as "Document signers",
    // and every recipient carries a `sign_url`.
    role: 'signer',
    status: mapStatus(raw.status),
    platform: 'rightsignature',
    metadata: strMap({
      status: raw.status,
      role_name: raw.role_name,
      sequence: raw.sequence,
    }),
    // `sign_url` carries a signer access token; neither URL is copied out.
    raw: {
      id: raw.id,
      role_name: raw.role_name,
      name: raw.name,
      email: raw.email,
      status: raw.status,
      message: raw.message,
      sequence: raw.sequence,
    },
  }
}
