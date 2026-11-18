/**
 * Maps a HyperPay (OPPWA) **payment** onto the canonical `Charge`.
 *
 * HyperPay models a single payment object created with `paymentType` DB (debit)
 * or PA (preauthorization) and later acted on by reference (CP capture, RF
 * refund, RV reversal). The lifecycle status is derived from `paymentType` plus
 * the `result.code` outcome (success / pending / rejected).
 *
 * Money arrives as a decimal string (`"92.00"`) which we convert to integer
 * minor units for the canonical schema.
 *
 * Docs: https://hyperpay.docs.oppwa.com/reference/parameters
 */
import type { Charge, ChargeStatus } from '../../../schema/charge'
import {
  classifyResult,
  pickCurrency,
  strMap,
  toIsoDatetime,
  toMinorUnits,
  type HyperpayResult,
} from './shared'

export interface RawHyperpayCard {
  bin?: string
  last4Digits?: string
  holder?: string
  expiryMonth?: string
  expiryYear?: string
}

export interface RawHyperpayCustomer {
  email?: string
  givenName?: string
  surname?: string
  merchantCustomerId?: string
}

export interface RawHyperpayPayment {
  id?: string
  paymentType?: string
  paymentBrand?: string
  amount?: string
  currency?: string
  descriptor?: string
  merchantTransactionId?: string
  result?: HyperpayResult
  resultDetails?: Record<string, unknown>
  card?: RawHyperpayCard
  customer?: RawHyperpayCustomer
  timestamp?: string
  ndc?: string
  buildNumber?: string
  [k: string]: unknown
}

/**
 * Derive the canonical lifecycle status from the result outcome + paymentType.
 *   rejected result            → failed
 *   pending result             → pending
 *   RV (reversal) success      → cancelled
 *   RF (refund) success        → refunded
 *   PA (preauth) success       → pending (funds reserved, not yet captured)
 *   DB / CP success            → succeeded
 */
function mapStatus(raw: RawHyperpayPayment): ChargeStatus {
  const outcome = classifyResult(raw.result?.code)
  if (outcome === 'rejected') return 'failed'
  if (outcome === 'pending') return 'pending'
  switch ((raw.paymentType ?? '').toUpperCase()) {
    case 'RV':
      return 'cancelled'
    case 'RF':
      return 'refunded'
    case 'PA':
      return 'pending'
    default:
      return 'succeeded'
  }
}

function customerName(c: RawHyperpayCustomer | undefined): string | undefined {
  if (!c) return undefined
  const name = [c.givenName, c.surname].filter(Boolean).join(' ').trim()
  return name || undefined
}

export function transformCharge(raw: RawHyperpayPayment): Charge {
  const id = raw.id ?? ''
  const type = (raw.paymentType ?? '').toUpperCase()
  const captured = type === 'DB' || type === 'CP'
  const rejected = classifyResult(raw.result?.code) === 'rejected'
  const amount = toMinorUnits(raw.amount)

  const meta: Record<string, unknown> = {
    paymentType: raw.paymentType,
    paymentBrand: raw.paymentBrand,
    resultCode: raw.result?.code,
    resultDescription: raw.result?.description,
    merchantTransactionId: raw.merchantTransactionId,
    cardBin: raw.card?.bin,
    cardLast4: raw.card?.last4Digits,
    cardHolder: raw.card?.holder,
    customerName: customerName(raw.customer),
    ndc: raw.ndc,
  }

  return {
    id: String(id),
    externalId: String(id),
    amount,
    currency: pickCurrency(raw.currency),
    amountCaptured: captured && !rejected ? amount : 0,
    status: mapStatus(raw),
    captured: captured && !rejected,
    capturedAt: captured && !rejected ? toIsoDatetime(raw.timestamp) : undefined,
    description: raw.descriptor ?? raw.merchantTransactionId,
    statementDescriptor: raw.descriptor ?? undefined,
    failureCode: rejected ? raw.result?.code : undefined,
    failureMessage: rejected ? raw.result?.description : undefined,
    receiptEmail: raw.customer?.email,
    gateway: 'hyperpay',
    metadata: strMap(meta),
    createdAt: toIsoDatetime(raw.timestamp),
    updatedAt: toIsoDatetime(raw.timestamp),
    raw,
  }
}
