import type { Signer, SignerStatus } from '../../../schema/signer'
import { pickStr, strMap } from './shared'
import {
  STATUS_SIGNED,
  STATUS_REJECTED,
  STATUS_EXPIRED,
  STATUS_WITHDRAWN,
  STATUS_FAILED,
  STATUS_FAILED_FACE_RECOGNITION,
} from '../constants'

/**
 * Evrotrust signer derived from a single-transaction document status
 * (`/document/status`). Evrotrust is a 1-signer-per-transaction model: the
 * vendor sends one document to one identified Evrotrust mobile-app user whose
 * identity was verified at enrolment time. The signer's e-mail address and
 * display name are NOT returned by the status API (they are stored in the
 * Evrotrust identity register, not exposed to the vendor); only the signing
 * outcome is readable.
 *
 * The canonical `id` is the `transactionID` — the stable identifier for this
 * signing operation.  A placeholder e-mail on the `.invalid` TLD is used
 * because `email` is a required field in the Signer schema and Evrotrust
 * returns no signer e-mail.
 */

export interface RawEvrotrustSignerStatus {
  transactionID?: string
  threadID?: string
  status?: number
  isProcessing?: number
  rejectReason?: string
  automatedSignError?: string
  description?: string
  [key: string]: unknown
}

function mapStatus(code: number | undefined): SignerStatus {
  switch (code) {
    case STATUS_SIGNED:
      return 'signed'
    case STATUS_REJECTED:
      return 'declined'
    case STATUS_EXPIRED:
      return 'auto_responded'
    case STATUS_WITHDRAWN:
      return 'declined'
    case STATUS_FAILED:
    case STATUS_FAILED_FACE_RECOGNITION:
      return 'declined'
    default:
      return 'sent'
  }
}

export function transformSigner(
  raw: RawEvrotrustSignerStatus,
  envelopeId: string,
): Signer {
  const id = pickStr(raw.transactionID) ?? `${envelopeId}:signer`
  return {
    id,
    externalId: id,
    envelopeId,
    // Evrotrust does not expose signer e-mail or name via the status API.
    // The identity is held in the Evrotrust identity register.
    email: `${id.replace(/[^a-zA-Z0-9._-]/g, '_')}@evrotrust.invalid`,
    name: '',
    role: 'signer',
    status: mapStatus(raw.status),
    platform: 'evrotrust',
    metadata: strMap({
      status: raw.status,
      isProcessing: raw.isProcessing,
      rejectReason: raw.rejectReason,
      automatedSignError: raw.automatedSignError,
    }),
    raw,
  }
}
