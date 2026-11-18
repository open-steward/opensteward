import { toIsoDatetime } from '@opensteward/shared'
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { strMap } from './shared'

/**
 * A Moyasar payment, as GET /payments and GET /payments/:id return it
 * (https://docs.moyasar.com/api/payments/03-list-payments). Only the fields
 * this transform reads are typed; the docs mark id, status, amount, currency,
 * refunded, captured, created_at and updated_at required.
 */
export interface RawMoyasarPayment {
  id?: string
  status?: string
  /** "amount integer required"; the example pairs 100 with "1.00 SAR", so minor units. */
  amount?: number
  /** "ISO-4217 three-letter currency code." */
  currency?: string
  /** "Refunded amount. Less than or equal to the payment amount." */
  refunded?: number
  /** "Captured amount. Less than or equal to the payment amount." */
  captured?: number
  captured_at?: string | null
  description?: string | null
  /** "Invoice ID that this payment is used to pay." */
  invoice_id?: string | null
  created_at?: string
  updated_at?: string
  /** "A set of key-value pairs where both key and value are strings." */
  metadata?: Record<string, string> | null
  [k: string]: unknown
}

/**
 * https://docs.moyasar.com/api/payments/payment-status-reference documents
 * exactly these eight statuses. `verified` is "when the cardholder verifies his
 * card in the tokenization process", which is not a charge outcome, so it maps
 * to 'unknown' along with anything undocumented.
 */
function mapStatus(s: unknown): ChargeStatus {
  switch (s) {
    case 'initiated': // "the payment has been created but the cardholder did not pay yet"
    case 'authorized': // "the cardholder is not charged yet"
      return 'pending'
    case 'paid':
    case 'captured':
      return 'succeeded'
    case 'failed':
      return 'failed'
    case 'refunded':
      return 'refunded'
    case 'voided': // "the merchant cancels a paid, authorized, or captured payment"
      return 'cancelled'
    default:
      return 'unknown'
  }
}

function required<T>(value: T | undefined | null, ok: (v: unknown) => boolean, field: string): T {
  if (value === undefined || value === null || !ok(value)) {
    throw new Error(`Moyasar payment is missing its documented required field "${field}"`)
  }
  return value
}

const isInt = (v: unknown): boolean => typeof v === 'number' && Number.isInteger(v)
const isNonEmptyString = (v: unknown): boolean => typeof v === 'string' && v.length > 0

export function transformCharge(raw: RawMoyasarPayment): Charge {
  const id = required(raw.id, isNonEmptyString, 'id')
  return {
    id,
    externalId: id,
    amount: required(raw.amount, isInt, 'amount'),
    currency: required(raw.currency, isNonEmptyString, 'currency').toUpperCase(),
    amountRefunded: isInt(raw.refunded) ? raw.refunded : undefined,
    amountCaptured: isInt(raw.captured) ? raw.captured : undefined,
    status: mapStatus(raw.status),
    capturedAt: toIsoDatetime(raw.captured_at),
    invoiceId: raw.invoice_id ?? undefined,
    description: raw.description ?? undefined,
    gateway: 'moyasar',
    metadata: strMap(raw.metadata),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    raw,
  }
}
