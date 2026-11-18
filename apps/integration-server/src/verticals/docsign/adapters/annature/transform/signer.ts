/**
 * Annature recipient → canonical Signer.
 *
 * Fields per "The recipient object"
 * (https://docs.annature.com.au/api-reference/recipients/recipient-object.md):
 * `id`, `name`, `email`, `mobile`, `type` ("`signer`, `viewer`, or
 * `carbon-copy`"), `status` ("Possible values: `created`, `pending`, `sent`,
 * `failed`, `completed`, `declined`."), `message`, `password`, `muted`,
 * `order`, `declined_reason`, `created`, `sent`, `declined`, `completed`,
 * `redirects`.
 *
 * "Carbon copy recipients do not have a `status`", so theirs maps to unknown.
 */
import type { Signer, SignerRole, SignerStatus } from '../../../schema/signer'
import { pickStr, strMap, toIso } from './shared'

export interface RawAnnatureRecipient {
  id: string
  name: string
  email?: string | null
  mobile?: string | null
  type?: string
  status?: string | null
  message?: string | null
  password?: boolean
  muted?: boolean
  order?: number | null
  declined_reason?: string | null
  created?: string | null
  sent?: string | null
  declined?: string | null
  completed?: string | null
  redirects?: { session_completed?: string | null; session_declined?: string | null } | null
}

function mapRole(t: string | undefined): SignerRole {
  switch (t) {
    case 'signer':
      return 'signer'
    case 'carbon-copy':
      return 'cc'
    default:
      // `viewer` ("must open the envelope and click a confirmation button")
      // has no canonical role.
      return 'unknown'
  }
}

function mapStatus(s: string | null | undefined): SignerStatus {
  // "`pending` — Recipient is not yet eligible to sign, usually due to
  // signing order constraints." Not yet sent, so it reads as created.
  switch (s) {
    case 'created':
    case 'pending':
      return 'created'
    case 'sent':
      return 'sent'
    case 'completed':
      return 'signed'
    case 'declined':
      return 'declined'
    default:
      return 'unknown'
  }
}

export function transformSigner(raw: RawAnnatureRecipient, envelopeId: string): Signer {
  return {
    id: raw.id,
    externalId: raw.id,
    envelopeId,
    email: pickStr(raw.email),
    name: raw.name,
    role: mapRole(raw.type),
    status: mapStatus(raw.status),
    routingOrder: raw.order ?? undefined,
    sentAt: toIso(raw.sent),
    signedAt: toIso(raw.completed),
    declinedAt: toIso(raw.declined),
    declineReason: pickStr(raw.declined_reason),
    platform: 'annature',
    metadata: strMap({ type: raw.type, muted: raw.muted }),
    raw,
  }
}
