import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, splitClaimedIdentity, strMap, toIso } from './shared'
import {
  RESULT_MAJOR_PENDING,
  RESULT_MAJOR_SUCCESS,
  RESULT_MINOR_STEPUP_CANCEL,
  RESULT_MINOR_STEPUP_TIMEOUT,
} from '../constants'

/**
 * AIS DSS SignResponse (JSON binding). A signing *transaction* is the closest
 * thing AIS has to a canonical envelope: one request signs one (or a batch of)
 * document hash(es) for one Claimed Identity. The transaction is addressable by
 * its async `ResponseID`; its lifecycle is Pending → Success | error.
 */
export interface RawSwisscomSignResponse {
  '@RequestID'?: string
  '@Profile'?: string
  Result?: {
    ResultMajor?: string
    ResultMinor?: string
    ResultMessage?: { $?: string; '@lang'?: string } | string
  }
  OptionalOutputs?: {
    'async.ResponseID'?: string
    'sc.APTransID'?: string
    'sc.StepUpAuthorisationInfo'?: {
      'sc.Result'?: {
        'sc.SerialNumber'?: string
        'sc.ConsentURL'?: string
      }
      'sc.ConsentURL'?: string
    }
    'sc.RevocationInformation'?: {
      'sc.CRLs'?: { 'sc.CRL'?: string }
      'sc.OCSPs'?: { 'sc.OCSP'?: string }
    }
  }
  SignatureObject?: {
    Other?: {
      'sc.SignatureObjects'?: {
        'sc.ExtendedSignatureObject'?: Array<{
          '@WhichDocument'?: string
          Base64Signature?: { '@Type'?: string; $?: string }
        }>
      }
    }
  }
  /** Carried by the adapter — not part of the wire SignResponse. */
  claimedIdentity?: string
  /** Carried by the adapter — request timestamp (ISO). */
  requestedAt?: string
  [key: string]: unknown
}

function resultMessage(result: RawSwisscomSignResponse['Result']): string | undefined {
  const m = result?.ResultMessage
  if (!m) return undefined
  if (typeof m === 'string') return m
  return pickStr(m.$)
}

function mapStatus(result: RawSwisscomSignResponse['Result']): EnvelopeStatus {
  const major = result?.ResultMajor ?? ''
  const minor = result?.ResultMinor ?? ''
  if (major === RESULT_MAJOR_SUCCESS) return 'completed'
  if (major === RESULT_MAJOR_PENDING) {
    // A pending transaction is awaiting the signer's step-up consent: "sent".
    return 'sent'
  }
  if (minor === RESULT_MINOR_STEPUP_CANCEL) return 'declined'
  if (minor === RESULT_MINOR_STEPUP_TIMEOUT) return 'expired'
  // Any other result-major is a requester/responder/subsystem error → voided.
  if (major) return 'voided'
  return 'draft'
}

/** Document ids referenced by the signature objects in a completed response. */
function signedDocumentIds(raw: RawSwisscomSignResponse): string[] {
  const objs =
    raw.SignatureObject?.Other?.['sc.SignatureObjects']?.['sc.ExtendedSignatureObject'] ?? []
  return objs
    .map((o) => pickStr(o['@WhichDocument']))
    .filter((id): id is string => typeof id === 'string')
}

function consentUrl(raw: RawSwisscomSignResponse): string | undefined {
  const info = raw.OptionalOutputs?.['sc.StepUpAuthorisationInfo']
  return pickStr(info?.['sc.Result']?.['sc.ConsentURL'] ?? info?.['sc.ConsentURL'])
}

export function transformEnvelope(raw: RawSwisscomSignResponse): Envelope {
  const responseId = pickStr(raw.OptionalOutputs?.['async.ResponseID'])
  const requestId = pickStr(raw['@RequestID'])
  const id = responseId ?? requestId ?? ''
  const { customerName, keyEntity } = splitClaimedIdentity(raw.claimedIdentity)
  const status = mapStatus(raw.Result)
  const completedAt = status === 'completed' ? toIso(raw.requestedAt) : undefined

  return {
    id,
    externalId: responseId ?? requestId ?? id,
    status,
    subject: customerName ? `AIS signing transaction — ${customerName}` : 'AIS signing transaction',
    message: resultMessage(raw.Result),
    senderName: customerName,
    signingOrder: 'parallel',
    signerIds: keyEntity ? [keyEntity] : customerName ? [customerName] : [],
    documentIds: signedDocumentIds(raw),
    createdAt: toIso(raw.requestedAt),
    sentAt: toIso(raw.requestedAt),
    completedAt,
    updatedAt: toIso(raw.requestedAt),
    platform: 'swisscom-trust-services',
    metadata: strMap({
      requestId,
      responseId,
      profile: raw['@Profile'],
      resultMajor: raw.Result?.ResultMajor,
      resultMinor: raw.Result?.ResultMinor,
      apTransactionId: raw.OptionalOutputs?.['sc.APTransID'],
      consentUrl: consentUrl(raw),
      serialNumber: raw.OptionalOutputs?.['sc.StepUpAuthorisationInfo']?.['sc.Result']?.['sc.SerialNumber'],
    }),
    raw,
  }
}
