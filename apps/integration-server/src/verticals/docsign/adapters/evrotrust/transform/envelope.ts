import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickNum, pickStr, strMap, toIso } from './shared'
import {
  STATUS_SIGNED,
  STATUS_REJECTED,
  STATUS_EXPIRED,
  STATUS_WITHDRAWN,
} from '../constants'

/**
 * Evrotrust group/thread status response. An Evrotrust signing operation is
 * identified by a `threadID`; `/document/group/status` returns the collapsed
 * status of the whole thread. The status response carries no subject /
 * created / sender metadata, so most canonical envelope fields stay
 * undefined.
 */
export interface RawEvrotrustThreadStatus {
  threadID?: string
  transactionID?: string
  status?: number
  isProcessing?: number
  rejectReason?: string
  automatedSignError?: string
  registerCheck?: unknown
  dateExpire?: string
  description?: string
  [key: string]: unknown
}

function mapStatus(code: number | undefined): EnvelopeStatus {
  switch (code) {
    case STATUS_SIGNED:
      return 'completed'
    case STATUS_REJECTED:
      return 'declined'
    case STATUS_WITHDRAWN:
      return 'voided'
    case STATUS_EXPIRED:
      return 'expired'
    default:
      // Pending, On hold, Failed, Undeliverable, Failed face recognition —
      // still in flight / sent for signature.
      return 'sent'
  }
}

export function transformEnvelope(
  raw: RawEvrotrustThreadStatus,
  threadId: string,
): Envelope {
  const id = pickStr(raw.threadID) ?? threadId
  const transactionId = pickStr(raw.transactionID)
  return {
    id,
    externalId: id,
    status: mapStatus(pickNum(raw.status)),
    subject: pickStr(raw.description) ?? '',
    signingOrder: 'parallel',
    signerIds: [],
    documentIds: transactionId ? [transactionId] : [],
    expiresAt: toIso(raw.dateExpire),
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
