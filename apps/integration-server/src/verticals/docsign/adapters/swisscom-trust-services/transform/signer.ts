import type { Signer, SignerStatus } from '../../../schema/signer'
import { pickStr, splitClaimedIdentity, strMap, toIso } from './shared'
import type { RawSwisscomSignResponse } from './envelope'
import {
  RESULT_MAJOR_PENDING,
  RESULT_MAJOR_SUCCESS,
  RESULT_MINOR_STEPUP_CANCEL,
  RESULT_MINOR_STEPUP_TIMEOUT,
} from '../constants'

/**
 * AIS signs on behalf of a single signer per transaction — the Claimed
 * Identity, optionally bound to an end user via Mobile ID step-up. AIS does
 * NOT return an e-mail address (consent is Mobile ID / SMS-based), so we
 * synthesise a stable, syntactically-valid placeholder from the Mobile ID
 * serial number and surface the real identifiers under `metadata`.
 */

function mapStatus(raw: RawSwisscomSignResponse): SignerStatus {
  const major = raw.Result?.ResultMajor ?? ''
  const minor = raw.Result?.ResultMinor ?? ''
  if (major === RESULT_MAJOR_SUCCESS) return 'signed'
  if (minor === RESULT_MINOR_STEPUP_CANCEL) return 'declined'
  if (minor === RESULT_MINOR_STEPUP_TIMEOUT) return 'auto_responded'
  if (major === RESULT_MAJOR_PENDING) return 'sent'
  return 'created'
}

function stepUpSerial(raw: RawSwisscomSignResponse): string | undefined {
  return pickStr(raw.OptionalOutputs?.['sc.StepUpAuthorisationInfo']?.['sc.Result']?.['sc.SerialNumber'])
}

export function transformSigner(raw: RawSwisscomSignResponse, envelopeId: string): Signer {
  const { customerName, keyEntity } = splitClaimedIdentity(raw.claimedIdentity)
  const serial = stepUpSerial(raw)
  const externalId = keyEntity ?? customerName ?? envelopeId
  // Placeholder e-mail (RFC-2606 .invalid TLD) — AIS supplies no signer e-mail.
  const localPart = (serial ?? externalId).replace(/[^a-zA-Z0-9._-]/g, '_') || 'signer'
  const status = mapStatus(raw)
  const signedAt = status === 'signed' ? toIso(raw.requestedAt) : undefined
  const declinedAt = status === 'declined' ? toIso(raw.requestedAt) : undefined

  return {
    id: `${envelopeId}:${externalId}`,
    externalId,
    envelopeId,
    email: `${localPart}@swisscom-trust-services.invalid`,
    name: customerName ?? externalId,
    role: 'signer',
    status,
    sentAt: toIso(raw.requestedAt),
    signedAt,
    declinedAt,
    declineReason:
      status === 'declined'
        ? (typeof raw.Result?.ResultMessage === 'string'
            ? raw.Result.ResultMessage
            : pickStr((raw.Result?.ResultMessage as { $?: string } | undefined)?.$))
        : undefined,
    platform: 'swisscom-trust-services',
    metadata: strMap({
      claimedIdentity: raw.claimedIdentity,
      keyEntity,
      mobileIdSerialNumber: serial,
    }),
    raw,
  }
}
