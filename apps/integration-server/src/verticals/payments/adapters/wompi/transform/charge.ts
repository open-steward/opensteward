import { toIsoDatetime } from '@opensteward/shared'
import type { Charge, ChargeStatus } from '../../../schema/charge'

/**
 * A Wompi Transaction, as documented by the Transaction schema of
 * https://api.swaggerhub.com/apis/waybox/wompi/1.2.0 and the examples on
 * https://docs.wompi.co/docs/colombia/transacciones/.
 */
export interface RawWompiTransaction {
  id?: string
  created_at?: string
  amount_in_cents?: number
  status?: string
  status_message?: string
  reference?: string
  customer_email?: string
  currency?: string
  payment_method_type?: string
  [k: string]: unknown
}

// Documented enum: PENDING | APPROVED | DECLINED | ERROR | VOIDED.
function mapStatus(s: string | undefined): ChargeStatus {
  switch (s) {
    case 'PENDING':
      return 'pending'
    case 'APPROVED':
      return 'succeeded'
    case 'DECLINED':
    case 'ERROR':
      return 'failed'
    case 'VOIDED':
      return 'cancelled'
    default:
      return 'unknown'
  }
}

// created_at: the spec example is "2018-07-01 23:49:45 UTC", the docs pages
// show "2024-01-15T14:30:45.000Z"; toIsoDatetime reads both as UTC.
export function transformCharge(raw: RawWompiTransaction): Charge {
  if (typeof raw.id !== 'string' || raw.id === '') {
    throw new Error('Wompi transaction has no id')
  }
  if (typeof raw.amount_in_cents !== 'number') {
    throw new Error(`Wompi transaction ${raw.id} has no amount_in_cents`)
  }
  if (typeof raw.currency !== 'string' || raw.currency === '') {
    throw new Error(`Wompi transaction ${raw.id} has no currency`)
  }
  const status = mapStatus(raw.status)
  const failed = raw.status === 'DECLINED' || raw.status === 'ERROR'
  return {
    id: raw.id,
    externalId: raw.id,
    amount: raw.amount_in_cents,
    currency: raw.currency,
    status,
    receiptEmail: typeof raw.customer_email === 'string' ? raw.customer_email : undefined,
    failureMessage:
      failed && typeof raw.status_message === 'string' ? raw.status_message : undefined,
    gateway: 'wompi',
    metadata: typeof raw.reference === 'string' ? { reference: raw.reference } : {},
    createdAt: toIsoDatetime(raw.created_at),
    raw,
  }
}
