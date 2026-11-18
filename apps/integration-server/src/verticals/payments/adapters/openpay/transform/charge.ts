/**
 * Openpay charge transaction → canonical Charge.
 *
 * Fields from "Objeto Transacción" (https://documents.openpay.mx/docs/api/index.html):
 * id, transaction_type, operation_type, method, creation_date ("Fecha de
 * creación de la transacción en formato ISO 8601."), order_id, status,
 * amount ("Cantidad de la transacción a dos decimales."), description,
 * error_message ("Si la transacción está en status: failed, en este campo se
 * mostrará la razón del fallo."), customer_id, currency, bank_account, card.
 *
 * Status values: the object documents "completed, in_progress, failed"; the
 * charge list filter documents "(IN_PROGRESS,COMPLETED,REFUNDED,
 * CHARGEBACK_PENDING,CHARGEBACK_ACCEPTED,CHARGEBACK_ADJUSTMENT,CHARGE_PENDING,
 * CANCELLED,FAILED)". Anything else maps to 'unknown'.
 */
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { optString, requireCurrency, requireId, requireMinorAmount } from './shared'

export interface RawOpenpayCharge {
  id?: string
  amount?: number
  currency?: string
  status?: string
  creation_date?: string
  operation_date?: string
  description?: string | null
  error_message?: string | null
  order_id?: string | null
  customer_id?: string | null
  [k: string]: unknown
}

function mapStatus(s: unknown): ChargeStatus {
  switch (typeof s === 'string' ? s.toLowerCase() : '') {
    case 'completed':
      return 'succeeded'
    case 'in_progress':
    case 'charge_pending':
      return 'pending'
    case 'failed':
      return 'failed'
    case 'refunded':
      return 'refunded'
    case 'cancelled':
      return 'cancelled'
    case 'chargeback_pending':
    case 'chargeback_accepted':
    case 'chargeback_adjustment':
      return 'disputed'
    default:
      return 'unknown'
  }
}

export function transformCharge(raw: RawOpenpayCharge): Charge {
  const id = requireId(raw, 'charge')
  const currency = requireCurrency(raw, 'charge')
  const orderId = optString(raw.order_id)
  return {
    id,
    externalId: id,
    amount: requireMinorAmount(raw, currency, 'charge'),
    currency,
    status: mapStatus(raw.status),
    customerId: optString(raw.customer_id),
    description: optString(raw.description),
    failureMessage: optString(raw.error_message),
    gateway: 'openpay',
    metadata: orderId ? { order_id: orderId } : {},
    createdAt: optString(raw.creation_date),
    raw,
  }
}
