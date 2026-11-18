import type { Signer, SignerStatus } from '../../../schema/signer'
import { pickStr, strMap, toIso } from './shared'
import type { RawValidatedIdSignerInfo } from './envelope'

/**
 * VIDsigner `SignerInfoDTO` → canonical Signer.
 *
 * The status DTO carries only non-biometric identity + outcome data:
 * SignerName, SignatureStatus, RejectionReason, TypeOfID, NumberID,
 * OperationTime. The signer's email is supplied at creation time and is
 * not echoed back in the info response, so `email` is undefined.
 *
 * The handwritten/biometric signature image is NEVER part of this DTO
 * and is never reflected.
 */
function mapStatus(s: string | undefined): SignerStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'signed':
      return 'signed'
    case 'rejected':
      return 'declined'
    case 'unsigned':
      return 'sent'
    default:
      return 'created'
  }
}

export function transformSigner(raw: RawValidatedIdSignerInfo, envelopeId: string): Signer {
  const id = pickStr(raw.SignerGUI) ?? ''
  const status = mapStatus(raw.SignatureStatus)
  const operationTime = toIso(raw.OperationTime)
  return {
    id,
    externalId: id,
    envelopeId,
    email: undefined,
    name: pickStr(raw.SignerName) ?? '',
    role: 'signer',
    status,
    signedAt: status === 'signed' ? operationTime : undefined,
    declinedAt: status === 'declined' ? operationTime : undefined,
    declineReason: pickStr(raw.RejectionReason),
    platform: 'validated-id',
    metadata: strMap({
      typeOfId: raw.TypeOfID,
      numberId: raw.NumberID,
      signatureStatus: raw.SignatureStatus,
    }),
    raw,
  }
}
