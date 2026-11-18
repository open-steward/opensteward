/**
 * Rebill payment → canonical Charge.
 *
 * The payment object (https://docs.rebill.com/api/reference/payments):
 * - `amount`: "Payment amount as a decimal in the currency's major unit"
 * - `currency`: "ISO 4217 currency code, uppercase."
 * - `status`: "One of `pending`, `approved`, `rejected`, `refunded`,
 *   `partially_refunded`, `cancelled`, or `chargeback`."
 * - `customer.id`, `subscriptionId`, `description`, `errorDetail`,
 *   `card.id`, `metadata`, `createdAt`, `updatedAt`.
 */
import { majorToMinor } from '@opensteward/shared'
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { strMap } from './shared'

export interface RawRebillPayment {
  id: string
  createdAt?: string | null
  updatedAt?: string | null
  amount: number
  currency: string
  customer?: { id?: string | null; email?: string | null } | null
  status: string
  metadata?: Record<string, unknown> | null
  card?: { id?: string | null } | null
  description?: string | null
  errorDetail?: string | null
  subscriptionId?: string | null
  [k: string]: unknown
}

const STATUS: Record<string, ChargeStatus> = {
  pending: 'pending',
  approved: 'succeeded',
  rejected: 'failed',
  refunded: 'refunded',
  partially_refunded: 'partially_refunded',
  cancelled: 'cancelled',
  chargeback: 'disputed',
}

export function transformCharge(raw: RawRebillPayment): Charge {
  if (typeof raw.id !== 'string' || raw.id === '') {
    throw new Error('Rebill payment has no id')
  }
  if (typeof raw.currency !== 'string' || raw.currency === '') {
    throw new Error(`Rebill payment ${raw.id} has no currency`)
  }
  const amount = majorToMinor(typeof raw.amount === 'number' ? raw.amount : undefined, raw.currency)
  if (amount === undefined) {
    throw new Error(`Rebill payment ${raw.id} has no amount`)
  }
  return {
    id: raw.id,
    externalId: raw.id,
    amount,
    currency: raw.currency,
    status: STATUS[raw.status] ?? 'unknown',
    customerId: raw.customer?.id ?? undefined,
    paymentMethodId: raw.card?.id ?? undefined,
    subscriptionId: raw.subscriptionId ?? undefined,
    description: raw.description ?? undefined,
    failureMessage: raw.errorDetail ?? undefined,
    gateway: 'rebill',
    metadata: strMap(raw.metadata),
    createdAt: raw.createdAt ?? undefined,
    updatedAt: raw.updatedAt ?? undefined,
    raw,
  }
}
