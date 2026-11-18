import type { Signer, SignerRole, SignerStatus } from '../../../schema/signer'
import { pickStr, strMap } from './shared'

/**
 * Secured Signing `Signer` (nested inside a `Document`). Identity is the
 * `SignerReference`; signing state is conveyed by both `HasSigned` (bool)
 * and the richer `SignedStatus` enum string. There is no per-signer routing
 * ordinal or signing timestamp on the wire — Secured Signing drives order
 * through the signing workflow, not an explicit recipient order field.
 */
export interface RawSecuredSigningSigner {
  SignerReference?: string
  FirstName?: string
  LastName?: string
  Email?: string
  MobileNumber?: string
  MobileCountry?: string
  SignerType?: string
  HasSigned?: boolean
  SignedStatus?: string
  DeclinedReason?: string
  ClientReference?: string
  IDCheckStatus?: string
  IDVerificationStatus?: string
  IDVerificationResult?: string
  [key: string]: unknown
}

/**
 * `SignerType` is a free-text role label on Secured Signing (e.g. "Signer",
 * "Witness", "Approver"). Map the common ones; anything else is a signer.
 */
function mapRole(signerType: string | undefined): SignerRole {
  switch ((signerType ?? '').toLowerCase()) {
    case 'witness':
      return 'witness'
    case 'approver':
      return 'approver'
    case 'editor':
      return 'editor'
    case 'cc':
    case 'copy':
    case 'carboncopy':
      return 'cc'
    case 'inpersonsigner':
    case 'in_person_signer':
      return 'in_person_signer'
    default:
      return 'signer'
  }
}

/**
 * Maps the Secured Signing `SignedStatus` enum to the canonical signer
 * status. Enum values: Initialized, Invitation, Reminder1/2, Reminder,
 * AutoExtend, Expired, Signed, Complete, Archived, Pending, Deleted,
 * Rejected, Declined.
 */
function mapStatus(raw: RawSecuredSigningSigner): SignerStatus {
  const s = (raw.SignedStatus ?? '').toLowerCase()
  if (s === 'signed' || s === 'complete' || s === 'archived') return 'signed'
  if (s === 'declined' || s === 'rejected') return 'declined'
  if (s === 'expired' || s === 'autoextend') return 'auto_responded'
  if (s === 'invitation' || s.startsWith('reminder')) return 'sent'
  if (s === 'pending' || s === 'initialized') return 'created'
  // Fall back to the boolean when the enum is absent.
  if (raw.HasSigned) return 'signed'
  return 'created'
}

export function transformSigner(
  raw: RawSecuredSigningSigner,
  envelopeId: string,
): Signer {
  const name = [pickStr(raw.FirstName), pickStr(raw.LastName)].filter(Boolean).join(' ')
  return {
    id: `${envelopeId}:${raw.SignerReference ?? ''}`,
    externalId: pickStr(raw.SignerReference) ?? '',
    envelopeId,
    email: pickStr(raw.Email) ?? '',
    name,
    role: mapRole(raw.SignerType),
    status: mapStatus(raw),
    declineReason: pickStr(raw.DeclinedReason),
    platform: 'secured-signing',
    metadata: strMap({
      signerType: raw.SignerType,
      signedStatus: raw.SignedStatus,
      hasSigned: raw.HasSigned,
      mobileNumber: raw.MobileNumber,
      mobileCountry: raw.MobileCountry,
      clientReference: raw.ClientReference,
      idCheckStatus: raw.IDCheckStatus,
      idVerificationStatus: raw.IDVerificationStatus,
      idVerificationResult: raw.IDVerificationResult,
    }),
    raw,
  }
}
