/**
 * Interswitch transaction -> canonical Charge.
 *
 * Source: the rows of GET /paymentgateway/api/v1/transactions
 * (https://docs.interswitchgroup.com/reference/get-transactions.md). Every
 * field read below appears in that page's response schema and example.
 *
 * - `amount` is read as minor units. That is an inference: the docs state the
 *   unit only for request amounts (docs/frequently-asked-questions.md, "When
 *   passing an amount in the create transaction endpoint, should it be in
 *   minor or major currency?" answered "The amount should  always be passed
 *   in minor currency." [sic]; docs/hosted-fields.md, "amount … amount in
 *   minor"), and the transactions list types `amount` only as an integer.
 * - `currencyCode` is ISO 4217 numeric ("currencyCode … ISO currency code",
 *   docs/hosted-fields.md; example "566"), mapped through the documented table
 *   in constants.ts. An unmapped code throws rather than guessing.
 * - `status` values are the ones the same endpoint filters on: "the
 *   transaction status: ALL, SUCCESS, FAILED, INCOMPLETE" (example value
 *   "Incomplete").
 * - `dateOfPayment` is an epoch-milliseconds string (example "1685460429590").
 */

import type { Charge, ChargeStatus } from '../../../schema/charge'
import { NUMERIC_CURRENCIES } from '../constants'

export interface RawInterswitchTransaction {
  id: number
  amount: number
  transactionReference: string
  responseCode?: string | null
  responseDescription?: string | null
  merchantCode?: string | null
  currencyCode: string
  paymentCancelled?: boolean | null
  merchantCustomerId?: string | null
  channel?: string | null
  dateOfPayment?: string | null
  status?: string | null
  [key: string]: unknown
}

function mapStatus(raw: RawInterswitchTransaction): ChargeStatus {
  if (raw.paymentCancelled === true) return 'cancelled'
  switch ((raw.status ?? '').toUpperCase()) {
    case 'SUCCESS':
      return 'succeeded'
    case 'FAILED':
      return 'failed'
    default:
      // INCOMPLETE ("Transaction not Completed") says nothing about whether the
      // payment is still in flight or was abandoned.
      return 'unknown'
  }
}

function epochMsToIso(value: string | null | undefined): string | undefined {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return undefined
  return new Date(Number(value)).toISOString()
}

export function transformCharge(raw: RawInterswitchTransaction): Charge {
  const currency = NUMERIC_CURRENCIES[raw.currencyCode]
  if (!currency) {
    throw new Error(
      `Interswitch transaction ${raw.id} has currencyCode ${JSON.stringify(raw.currencyCode)}, which the docs do not map to an ISO 4217 code.`,
    )
  }
  const status = mapStatus(raw)
  const metadata: Record<string, string> = { transactionReference: raw.transactionReference }
  if (raw.responseCode) metadata.responseCode = raw.responseCode
  if (raw.channel) metadata.channel = raw.channel
  if (raw.merchantCode) metadata.merchantCode = raw.merchantCode
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    amount: raw.amount,
    currency,
    status,
    customerId: raw.merchantCustomerId ?? null,
    failureCode: status === 'failed' ? (raw.responseCode ?? null) : null,
    failureMessage: status === 'failed' ? (raw.responseDescription ?? null) : null,
    gateway: 'interswitch',
    metadata,
    createdAt: epochMsToIso(raw.dateOfPayment),
    raw,
  }
}
