import type { Signer, SignerStatus } from '../../../schema/signer'
import { toIso } from './shared'

/**
 * One item of `signersData` on DocHub's flat sign request
 * (`sign_request_flat_resource.signersData.items` in
 * https://dev.dochub.com/api-reference/openapi.yaml), returned by
 * GET /api/v2/sign-requests/{id} with `Accept: application/json` and
 * `include=signers.user`. Every field below is one the spec documents there.
 */
export interface RawDochubSignerData {
  id: string
  type?: 'signers'
  /** "Current status of the signer" — documented examples: `pending`, `finalized`, `EMAIL_READ`. */
  status?: string
  /** "Null for `in_person` signers created without an email." */
  email?: string | null
  name?: string | null
  /** "Position in signing queue (if queue mode enabled)" */
  queuePosition?: number | null
  finalizationMessage?: string | null
  phone?: string | null
  removed?: boolean | null
  createdAt?: string
  updatedAt?: string
  /** "Timestamp when the signer first viewed the document." */
  viewedAt?: string | null
  /** "Timestamp when the signer finalized their signing." */
  signedAt?: string | null
  user?: {
    id: string
    type?: 'users'
    name?: string | null
    email?: string
    companyName?: string | null
    url?: string | null
  }
}

/**
 * DocHub publishes no signer-status enum, only example values and prose.
 * Mapped are the states the spec gives a meaning to:
 * - `finalized`: signedAt is "Timestamp when the signer finalized their signing";
 * - `rejected`: the webhook event `signer.rejected`, and resend's rule
 *   "Signer must not have finalized or rejected the document";
 * - `EMAIL_READ`: the schema's own example value, the signer has read the
 *   invitation.
 * Anything else (`pending`, `BOUNCE`, ...) is `unknown`, with the raw value
 * kept in `metadata.status`, rather than guessed.
 */
function mapStatus(raw: string | undefined): SignerStatus {
  const s = (raw ?? '').toLowerCase()
  if (s === 'finalized') return 'signed'
  if (s === 'rejected') return 'declined'
  if (s === 'email_read') return 'delivered'
  return 'unknown'
}

export function transformSigner(raw: RawDochubSignerData, envelopeId: string): Signer {
  const metadata: Record<string, string> = {}
  if (typeof raw.status === 'string') metadata.status = raw.status
  if (typeof raw.removed === 'boolean') metadata.removed = String(raw.removed)
  if (typeof raw.finalizationMessage === 'string' && raw.finalizationMessage.length > 0) {
    metadata.finalizationMessage = raw.finalizationMessage
  }
  return {
    id: `${envelopeId}:${raw.id}`,
    externalId: raw.id,
    envelopeId,
    ...(typeof raw.email === 'string' && raw.email.length > 0 ? { email: raw.email } : {}),
    // `name` is documented nullable; the canonical field is a required string,
    // so a signer DocHub has no name for carries an empty one.
    name: typeof raw.name === 'string' ? raw.name : '',
    // Every participant on a DocHub sign request is a `signers` resource.
    role: 'signer',
    status: mapStatus(raw.status),
    ...(typeof raw.queuePosition === 'number' &&
    Number.isInteger(raw.queuePosition) &&
    raw.queuePosition >= 1
      ? { routingOrder: raw.queuePosition }
      : {}),
    deliveredAt: toIso(raw.viewedAt),
    signedAt: toIso(raw.signedAt),
    platform: 'dochub',
    metadata,
    raw,
  }
}
