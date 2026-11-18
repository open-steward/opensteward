import type { Charge, ChargeStatus } from '../../../schema/charge'
import { toIsoDatetime } from '@opensteward/shared'
import { amountMinor, pickCurrency, strMap, type TipaltiAmount } from './shared'

/**
 * A Tipalti **payment** (an outbound disbursement to a payee) maps onto the
 * canonical **Charge** — the money-movement object carrying amount, currency,
 * status, and the linked payee (`customerId`). Amounts arrive as decimal
 * major units under `amountSubmitted`.
 */
export interface RawTipaltiPayment {
  id?: string
  refCode?: string
  payeeId?: string
  status?: string
  paymentMethod?: string
  batchId?: string
  payerEntityId?: string
  providerTransactionRefCode?: string
  amountSubmitted?: TipaltiAmount
  payeePaidAmount?: TipaltiAmount
  payerWithdrawAmount?: TipaltiAmount
  submissionDate?: string
  scheduledDate?: string
  valueDate?: string
  transactionCompletionDate?: string
  fees?: Array<{ amount?: TipaltiAmount; description?: string }>
  [k: string]: unknown
}

/**
 * Map Tipalti's payment lifecycle onto the canonical charge status set.
 *   PAID / CLEARED              → succeeded (funds reached the payee)
 *   REJECTED                    → failed
 *   CANCELED                    → cancelled
 *   everything in-flight        → pending
 */
function mapStatus(status: string | undefined): ChargeStatus {
  switch ((status ?? '').toUpperCase()) {
    case 'PAID':
    case 'CLEARED':
      return 'succeeded'
    case 'REJECTED':
      return 'failed'
    case 'CANCELED':
      return 'cancelled'
    case 'SCHEDULED':
    case 'SUBMITTED':
    case 'DEFERRED':
    case 'DEFERRED_INTERNAL':
    case 'FRAUD_REVIEW':
    case 'PENDING_PAYER_FUNDS':
      return 'pending'
    default:
      return 'pending'
  }
}

export function transformCharge(raw: RawTipaltiPayment): Charge {
  const status = mapStatus(raw.status)
  const completedAt = toIsoDatetime(raw.transactionCompletionDate)
  return {
    id: String(raw.id ?? raw.refCode ?? ''),
    externalId: String(raw.refCode ?? raw.id ?? ''),
    amount: amountMinor(raw.amountSubmitted),
    currency: pickCurrency(raw.amountSubmitted?.currency),
    status,
    captured: status === 'succeeded',
    capturedAt: status === 'succeeded' ? completedAt : undefined,
    customerId: raw.payeeId ? String(raw.payeeId) : undefined,
    gateway: 'tipalti',
    metadata: strMap({
      payment_method: raw.paymentMethod,
      batch_id: raw.batchId,
      payer_entity_id: raw.payerEntityId,
      provider_transaction_ref_code: raw.providerTransactionRefCode,
      status: raw.status,
      value_date: raw.valueDate,
    }),
    createdAt: toIsoDatetime(raw.submissionDate ?? raw.scheduledDate),
    updatedAt: completedAt ?? toIsoDatetime(raw.submissionDate),
    raw,
  }
}
