/**
 * Nuvei payout.do / getPayoutStatus.do response → canonical Payout.
 *
 * Nuvei's `payout.do` initiates a push payment to a stored UPO and immediately
 * returns a transaction response. `getPayoutStatus.do` returns the current
 * status of a previously created payout. Both share the same response envelope:
 * `transactionId`, `transactionStatus`, `amount`, `currency`, `userTokenId`,
 * `userPaymentOptionId`, `errCode`, `reason`.
 *
 * `transactionStatus` values: APPROVED, DECLINED, ERROR, PENDING.
 *
 * Transforms never throw — missing optionals collapse to `undefined`.
 */
import type { Payout, PayoutStatus } from '../../../schema/payout'
import { toIsoDatetime } from '@opensteward/shared'
import { pickCurrency, pickStr, strMap, toMinorUnits } from './shared'

export interface RawNuveiPayout {
  transactionId?: string
  internalRequestId?: string
  clientUniqueId?: string
  clientRequestId?: string
  transactionStatus?: string  // "APPROVED" | "DECLINED" | "ERROR" | "PENDING"
  status?: string             // request-level: "SUCCESS" | "ERROR"
  amount?: string | number
  currency?: string
  userTokenId?: string
  userPaymentOptionId?: string
  errCode?: number
  reason?: string
  gwErrorCode?: number
  gwExtendedErrorCode?: number
  externalTransactionId?: string
  cardData?: {
    last4Digits?: string
    [k: string]: unknown
  }
  createdDate?: string
  updatedDate?: string
  [k: string]: unknown
}

function mapStatus(raw: RawNuveiPayout): PayoutStatus {
  switch ((raw.transactionStatus ?? '').toUpperCase()) {
    case 'APPROVED':
      return 'paid'
    case 'DECLINED':
    case 'ERROR':
      return 'failed'
    case 'PENDING':
      return 'pending'
    default:
      return (raw.status ?? '').toUpperCase() === 'SUCCESS' ? 'paid' : 'pending'
  }
}

export function transformPayout(raw: RawNuveiPayout): Payout {
  const id = raw.transactionId ?? raw.clientUniqueId ?? raw.internalRequestId ?? ''
  const status = mapStatus(raw)
  const failed = status === 'failed'

  return {
    id: String(id),
    externalId: String(id),
    amount: toMinorUnits(raw.amount) ?? 0,
    currency: pickCurrency(raw.currency),
    status,
    method: 'standard',
    arrivalDate: undefined,
    destinationLast4: pickStr(raw.cardData?.last4Digits),
    statementDescriptor: undefined,
    failureCode: failed ? pickStr(raw.errCode) : undefined,
    failureMessage: failed ? (raw.reason ?? undefined) : undefined,
    gateway: 'nuvei',
    metadata: strMap({
      userTokenId: raw.userTokenId,
      userPaymentOptionId: raw.userPaymentOptionId,
      externalTransactionId: raw.externalTransactionId,
      clientUniqueId: raw.clientUniqueId,
    }),
    createdAt: toIsoDatetime(raw.createdDate),
    updatedAt: toIsoDatetime(raw.updatedDate),
    raw,
  }
}
