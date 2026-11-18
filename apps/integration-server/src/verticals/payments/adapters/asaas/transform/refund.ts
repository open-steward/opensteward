/**
 * Asaas refund ↔ canonical Refund.
 *
 * Asaas has no standalone refund resource. A refund is created with
 * `POST /payments/{id}/refund`, and the response is the full Payment object
 * carrying a `refunds[]` array. Each entry has `dateCreated`, `status`,
 * `value` (reais), `description`, `effectiveDate` and `transactionReceiptUrl`.
 * The refund therefore inherits its `chargeId` from the parent payment.
 *
 * Money is decimal reais → integer centavos; currency is always BRL.
 *
 * Refs: https://docs.asaas.com/reference/refund-payment
 */
import type { Refund, RefundStatus } from '../../../schema/refund'
import { ASAAS_CURRENCY, strMap, toIsoDatetime, toMinorUnits } from './shared'

export interface RawAsaasRefund {
  dateCreated?: string
  status?: string
  value?: number
  description?: string
  effectiveDate?: string
  transactionReceiptUrl?: string
  [k: string]: unknown
}

/** Asaas refund `status`: PENDING, AWAITING_*, CANCELLED, DONE. */
function mapStatus(raw: RawAsaasRefund): RefundStatus {
  switch ((raw.status ?? '').toUpperCase()) {
    case 'DONE':
      return 'succeeded'
    case 'CANCELLED':
      return 'cancelled'
    case 'PENDING':
    case 'AWAITING_CRITICAL_ACTION_AUTHORIZATION':
    case 'AWAITING_CUSTOMER_EXTERNAL_AUTHORIZATION':
      return 'pending'
    default:
      return 'pending'
  }
}

/**
 * @param raw      one entry from the payment's `refunds[]` array
 * @param chargeId the parent Asaas payment id (refunds carry no own id)
 * @param index    position in the refunds array, used to synthesise a stable id
 */
export function transformRefund(raw: RawAsaasRefund, chargeId: string, index = 0): Refund {
  const id = `${chargeId}-refund-${index}`
  return {
    id,
    externalId: id,
    chargeId: String(chargeId ?? ''),
    amount: toMinorUnits(raw.value) ?? 0,
    currency: ASAAS_CURRENCY,
    status: mapStatus(raw),
    gateway: 'asaas',
    metadata: strMap({
      description: raw.description,
      transactionReceiptUrl: raw.transactionReceiptUrl,
    }),
    createdAt: toIsoDatetime(raw.dateCreated),
    updatedAt: toIsoDatetime(raw.effectiveDate ?? raw.dateCreated),
    raw,
  }
}

/**
 * Pull the most-recently-created refund off a refunded Payment response and
 * return it alongside its position. Returns `undefined` when the payment has
 * no refunds (so callers can fall back without throwing).
 */
export function extractLatestRefund(
  payment: { id?: string; refunds?: RawAsaasRefund[] } & Record<string, unknown>,
): { refund: RawAsaasRefund; chargeId: string; index: number } | undefined {
  const refunds = Array.isArray(payment.refunds) ? payment.refunds : []
  if (refunds.length === 0) return undefined
  const index = refunds.length - 1
  return { refund: refunds[index], chargeId: String(payment.id ?? ''), index }
}
