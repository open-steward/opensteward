import type { Signer, SignerStatus } from '../../../schema/signer'
import { pickNum, pickStr, strMap, toIso } from './shared'
import { SIGNER_STATUS } from '../constants'

/** A LibreSign identify-method (how a signer proves who they are). */
export interface RawLibreSignIdentifyMethod {
  method?: string
  mandatory?: number | boolean
  identifiedAtDate?: string | null
  [key: string]: unknown
}

/**
 * A LibreSign sign-request — one signer's relationship to a file. Shared by
 * the `SignerSummary` (list) and `SignerDetail` (validate) shapes; the richer
 * fields are optional.
 */
export interface RawLibreSignSigner {
  signRequestId?: number
  sign_request_uuid?: string
  displayName?: string
  email?: string | null
  userId?: string
  /** 0 = pending, 1 = signed, 2 = declined. */
  status?: number
  statusText?: string
  /** True when this signer is the authenticated caller. */
  me?: boolean
  /** ISO-8601 date the signer signed (SignerSummary). */
  signed?: string | null
  /** ISO-8601 date the signer signed (SignerDetail). */
  sign_date?: string | null
  /** ISO-8601 date the signature was requested. */
  request_sign_date?: string
  signingOrder?: number
  description?: string | null
  remote_address?: string
  user_agent?: string
  identifyMethods?: RawLibreSignIdentifyMethod[]
  [key: string]: unknown
}

/**
 * Map a LibreSign sign-request status integer to the canonical signer status.
 *   0 pending → sent (invited, not yet signed)
 *   1 signed → signed
 *   2 declined → declined
 *   anything else → unknown
 */
function mapStatus(status: number | undefined): SignerStatus {
  switch (status) {
    case SIGNER_STATUS.SIGNED:
      return 'signed'
    case SIGNER_STATUS.DECLINED:
      return 'declined'
    case SIGNER_STATUS.PENDING:
      return 'sent'
    default:
      // SignerSummary.status documents enum [0,1,2,3,4] but gives no meaning
      // for 3 or 4, so anything past 0..2 is not guessed.
      return 'unknown'
  }
}

export function transformSigner(raw: RawLibreSignSigner, envelopeId: string): Signer {
  // `signRequestId` is required on SignerSummary and SignerDetail (openapi.json).
  const id = pickStr(raw.signRequestId)
  if (id === undefined)
    throw new Error(`LibreSign signer on file ${envelopeId} has no signRequestId`)
  const methods = (raw.identifyMethods ?? [])
    .map((m) => pickStr(m.method))
    .filter((m): m is string => typeof m === 'string')
  return {
    id,
    externalId: id,
    envelopeId,
    // `email` is nullable upstream; the canonical field is omitted, never ''.
    email: pickStr(raw.email),
    name: pickStr(raw.displayName) ?? '',
    role: 'signer',
    status: mapStatus(raw.status),
    routingOrder: pickNum(raw.signingOrder),
    sentAt: toIso(raw.request_sign_date),
    signedAt: toIso(raw.sign_date ?? raw.signed),
    platform: 'libresign',
    metadata: strMap({
      statusText: raw.statusText,
      userId: raw.userId,
      me: raw.me,
      signRequestUuid: raw.sign_request_uuid,
      remoteAddress: raw.remote_address,
      identifyMethods: methods.length > 0 ? methods.join(',') : undefined,
      description: raw.description,
    }),
    raw,
  }
}
