import type { Payout, PayoutStatus } from '../../../schema/payout'
import { pickCurrency, strMap, toIsoDatetime, toMinorUnits, type ScalapayMoney } from './shared'

/**
 * Scalapay payout record returned by `GET /v1/reporting/payouts`.
 *
 * Scalapay's payout reporting API groups settled amounts into payout batches
 * that merchants can reconcile against their bank statements. The merchant
 * API key (`Authorization: Bearer <key>`) is used; pagination follows the
 * same `page` (0-based) + `size` convention as the other reporting endpoints.
 *
 * Docs: https://developers.scalapay.com/reference/get_v1-reporting-payouts
 *
 * The public docs do not publish a full JSON schema for the response; these
 * fields are derived from Scalapay's BNPL reporting conventions and match
 * the patterns used by /v1/reporting/orders and /v1/reporting/refunds.
 */
export interface RawScalapayPayout {
  /** Unique identifier for this payout batch. */
  token?: string
  payoutToken?: string
  /** Settlement amount (decimal major-unit string, e.g. "1250.00"). */
  amount?: ScalapayMoney | string | number
  totalAmount?: ScalapayMoney
  currency?: string
  status?: string
  /** ISO date-time when the payout was initiated / settled. */
  payoutDate?: string
  settlementDate?: string
  createdAt?: string
  paidAt?: string
  /** Bank reference or description on the merchant's statement. */
  reference?: string
  description?: string
  [k: string]: unknown
}

function mapStatus(raw: RawScalapayPayout): PayoutStatus {
  switch ((raw.status ?? '').toUpperCase()) {
    case 'PAID':
    case 'SETTLED':
    case 'COMPLETED':
      return 'paid'
    case 'PENDING':
    case 'PROCESSING':
      return 'pending'
    case 'IN_TRANSIT':
    case 'INTRANSIT':
      return 'in_transit'
    case 'FAILED':
    case 'REJECTED':
      return 'failed'
    case 'CANCELLED':
    case 'CANCELED':
      return 'cancelled'
    default:
      // Payouts that appear in the reporting list are generally settled; treat
      // an unknown/absent status as paid rather than emitting a bad value.
      return raw.status ? 'pending' : 'paid'
  }
}

function amountOf(raw: RawScalapayPayout): { value: string | number | undefined; currency: string | undefined } {
  if (raw.totalAmount && typeof raw.totalAmount === 'object') {
    return { value: raw.totalAmount.amount, currency: raw.totalAmount.currency ?? raw.currency }
  }
  if (raw.amount && typeof raw.amount === 'object') {
    const m = raw.amount as ScalapayMoney
    return { value: m.amount, currency: m.currency ?? raw.currency }
  }
  return { value: raw.amount as string | number | undefined, currency: raw.currency }
}

export function transformPayout(raw: RawScalapayPayout): Payout {
  const { value, currency: rawCurrency } = amountOf(raw)
  const currency = pickCurrency(rawCurrency)
  const amount = toMinorUnits(value, currency)

  const payoutId = String(raw.token ?? raw.payoutToken ?? '')
  const dateStr = raw.payoutDate ?? raw.settlementDate ?? raw.paidAt ?? raw.createdAt

  return {
    id: payoutId,
    externalId: payoutId,
    amount,
    currency: currency ?? 'EUR',
    status: mapStatus(raw),
    arrivalDate: toIsoDatetime(dateStr),
    statementDescriptor: raw.reference ?? raw.description ?? undefined,
    gateway: 'scalapay',
    metadata: strMap({
      scalapayStatus: raw.status,
      reference: raw.reference,
    }),
    createdAt: toIsoDatetime(dateStr),
    updatedAt: toIsoDatetime(dateStr),
    raw,
  }
}
