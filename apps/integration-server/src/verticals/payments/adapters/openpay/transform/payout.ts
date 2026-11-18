/**
 * Openpay payout transaction → canonical Payout.
 *
 * A payout is a transaction ("transaction_type" : "payout") read from
 * GET /v1/{MERCHANT_ID}/payouts ("Obtiene un listado de los pagos realizados a
 * nivel comercio o cliente.", https://documents.openpay.co/docs/api/index.html#pagos-o-retiros).
 * Fields are the "Objeto Transacción" ones: id, amount ("Cantidad de la
 * transacción a dos decimales."), currency, status, creation_date,
 * operation_date, description, error_message, bank_account.
 *
 * Status: "Todas las transacciones de pago se regresarán en status
 * **in_progress** lo cual significa que se programó para el día siguiente,
 * cuando se efectúe la operación se cambiará el estado a **completed**", and
 * the object documents "completed, in_progress, failed".
 */
import type { Payout, PayoutStatus } from '../../../schema/payout'
import { optString, requireCurrency, requireId, requireMinorAmount } from './shared'

export interface RawOpenpayPayout {
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

function mapStatus(s: unknown): PayoutStatus {
  switch (typeof s === 'string' ? s.toLowerCase() : '') {
    case 'completed':
      return 'paid'
    case 'in_progress':
      return 'pending'
    case 'failed':
      return 'failed'
    default:
      return 'unknown'
  }
}

export function transformPayout(raw: RawOpenpayPayout): Payout {
  const id = requireId(raw, 'payout')
  const currency = requireCurrency(raw, 'payout')
  const metadata: Record<string, string> = {}
  const orderId = optString(raw.order_id)
  if (orderId) metadata['order_id'] = orderId
  const customerId = optString(raw.customer_id)
  if (customerId) metadata['customer_id'] = customerId
  return {
    id,
    externalId: id,
    amount: requireMinorAmount(raw, currency, 'payout'),
    currency,
    status: mapStatus(raw.status),
    statementDescriptor: optString(raw.description),
    failureMessage: optString(raw.error_message),
    gateway: 'openpay',
    metadata,
    createdAt: optString(raw.creation_date),
    raw,
  }
}
