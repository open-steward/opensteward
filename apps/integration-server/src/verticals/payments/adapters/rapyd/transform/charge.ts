import type { Charge, ChargeStatus } from '../../../schema/charge'
import { pickCurrency, pickStr, strMap, toIsoDatetime, toMinorUnits } from './shared'

/**
 * Rapyd Payment object (subset). Amounts are decimal major units; `status` is
 * a 3-letter code (ACT/CLO/ERR/EXP/REV); timestamps are Unix seconds.
 * Docs: https://docs.rapyd.net/en/list-payments.html
 */
export interface RawRapydPayment {
  id?: string
  amount?: number | string
  original_amount?: number | string
  currency_code?: string
  status?: string
  paid?: boolean
  captured?: boolean
  refunded?: boolean
  refunded_amount?: number | string
  customer_token?: string
  payment_method?: string
  invoice?: string
  description?: string
  statement_descriptor?: string
  failure_code?: string
  failure_message?: string
  receipt_email?: string
  receipt_number?: string
  paid_at?: number
  created_at?: number
  updated_at?: number
  metadata?: Record<string, unknown>
  [k: string]: unknown
}

function mapStatus(raw: RawRapydPayment): ChargeStatus {
  const refundedAmount = toMinorUnits(raw.refunded_amount)
  const amount = toMinorUnits(raw.amount)
  if (raw.refunded === true || (refundedAmount > 0 && refundedAmount >= amount && amount > 0)) {
    return 'refunded'
  }
  if (refundedAmount > 0 && refundedAmount < amount) return 'partially_refunded'

  switch ((raw.status ?? '').toUpperCase()) {
    case 'CLO':
      return raw.paid === false ? 'failed' : 'succeeded'
    case 'ACT':
      return 'pending'
    case 'ERR':
      return 'failed'
    case 'EXP':
      return 'cancelled'
    case 'REV':
      return 'refunded'
    default:
      return raw.paid === true ? 'succeeded' : 'pending'
  }
}

export function transformCharge(raw: RawRapydPayment): Charge {
  const id = pickStr(raw.id) ?? ''
  return {
    id,
    externalId: id,
    amount: toMinorUnits(raw.amount),
    currency: pickCurrency(raw.currency_code),
    amountRefunded: raw.refunded_amount != null ? toMinorUnits(raw.refunded_amount) : undefined,
    status: mapStatus(raw),
    captured: typeof raw.captured === 'boolean' ? raw.captured : undefined,
    capturedAt: toIsoDatetime(raw.paid_at),
    customerId: pickStr(raw.customer_token),
    paymentMethodId: pickStr(raw.payment_method),
    invoiceId: pickStr(raw.invoice),
    description: pickStr(raw.description),
    statementDescriptor: pickStr(raw.statement_descriptor),
    failureCode: pickStr(raw.failure_code),
    failureMessage: pickStr(raw.failure_message),
    receiptEmail: pickStr(raw.receipt_email),
    gateway: 'rapyd',
    metadata: strMap(raw.metadata),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at ?? raw.paid_at),
    raw,
  }
}
