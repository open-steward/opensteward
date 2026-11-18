/**
 * Paydock charge → canonical Charge.
 *
 * Fields from the "Charge resource" table of Paydock's API reference
 * (https://documenter.getpostman.com/view/6912944/Uyr5my5q, folder "charges"):
 * `amount` ("+ float Amount of payment", major units), `currency`
 * ("+ string (iso4217 alpha-3) Currency code"), `status` (see the Status
 * table), `subscription_id`, `customer.customer_id`, `description`,
 * `created_at`, `updated_at`. Paydock documents no metadata field on a charge.
 */
import { majorToMinor } from '@opensteward/shared'
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { optStr, requireId } from './shared'

export interface RawPaydockCharge {
  [k: string]: unknown
}

/**
 * The charge "Status" table, verbatim values. Each `*_requested` or
 * `refund_declined` status describes a pending or refused follow-up on a charge
 * that itself went through, so it stays `succeeded`.
 */
const STATUS: Record<string, ChargeStatus> = {
  complete: 'succeeded',
  pending: 'pending',
  requested: 'pending',
  inprogress: 'pending',
  held: 'pending',
  inreview: 'pending',
  pre_authenticated: 'pending',
  pre_authentication_pending: 'pending',
  capture_requested: 'pending',
  void_requested: 'pending',
  failed: 'failed',
  declined: 'failed',
  not_authenticated: 'failed',
  authentication_not_supported: 'failed',
  refunded: 'refunded',
  refund_requested: 'succeeded',
  refund_void_requested: 'succeeded',
  refund_declined: 'succeeded',
  cancelled: 'cancelled',
}

export function mapChargeStatus(s: unknown): ChargeStatus {
  return (typeof s === 'string' && STATUS[s]) || 'unknown'
}

export function transformCharge(raw: RawPaydockCharge): Charge {
  const id = requireId(raw['_id'], 'charge')
  const currency = optStr(raw['currency'])
  const amount = raw['amount']
  if (currency === undefined || typeof amount !== 'number')
    throw new Error(`Paydock charge ${id} has no documented amount/currency`)
  const cur = currency.toUpperCase()
  const customer = raw['customer'] as Record<string, unknown> | undefined
  return {
    id,
    externalId: id,
    amount: majorToMinor(amount, cur),
    currency: cur,
    status: mapChargeStatus(raw['status']),
    customerId: optStr(customer?.['customer_id']),
    subscriptionId: optStr(raw['subscription_id']),
    description: optStr(raw['description']),
    gateway: 'paydock',
    metadata: {},
    createdAt: optStr(raw['created_at']),
    updatedAt: optStr(raw['updated_at']),
    raw,
  }
}
