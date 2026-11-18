import type { Refund, RefundStatus } from '../../../schema/refund'
import { toIsoDatetime } from '@opensteward/shared'
import { pickCurrency, pickStr, strMap, toMinorUnits } from './shared'

/**
 * An IXOPAY refund transaction result. A refund references the original
 * debit/capture by its gateway `uuid` (echoed back in `referenceId`); the
 * refund itself gets a fresh `uuid`.
 */
export interface RawIxopayRefund {
  success?: boolean
  returnType?: string
  transactionStatus?: string
  uuid?: string
  /** The uuid of the original transaction being refunded. */
  referenceId?: string
  merchantTransactionId?: string
  purchaseId?: string
  amount?: string | number
  currency?: string
  returnData?: Record<string, unknown>
  extraData?: Record<string, unknown>
  errors?: Array<{ message?: string; code?: number | string; adapterMessage?: string }>
  [k: string]: unknown
}

function mapStatus(raw: RawIxopayRefund): RefundStatus {
  const lifecycle = (raw.transactionStatus ?? '').toUpperCase()
  if (lifecycle === 'FINISHED') return 'succeeded'
  if (lifecycle === 'ERROR') return 'failed'
  if (lifecycle === 'PENDING') return 'pending'
  if (lifecycle === 'VOIDED' || lifecycle === 'CANCELLED') return 'cancelled'
  const returnType = (raw.returnType ?? '').toUpperCase()
  if (returnType === 'FINISHED') return raw.success === false ? 'failed' : 'succeeded'
  if (returnType === 'ERROR') return 'failed'
  if (returnType === 'PENDING') return 'pending'
  if (raw.success === true) return 'succeeded'
  if (raw.success === false) return 'failed'
  return 'pending'
}

export function transformRefund(raw: RawIxopayRefund): Refund {
  const currency = pickCurrency(raw.currency)
  const firstError = raw.errors?.[0]
  return {
    id: String(raw.uuid ?? ''),
    externalId: String(raw.uuid ?? ''),
    chargeId: String(raw.referenceId ?? ''),
    amount: toMinorUnits(raw.amount, currency) ?? 0,
    currency,
    status: mapStatus(raw),
    failureReason: pickStr(firstError?.adapterMessage ?? firstError?.message),
    gateway: 'ixopay',
    metadata: strMap({
      merchantTransactionId: raw.merchantTransactionId,
      purchaseId: raw.purchaseId,
      ...raw.extraData,
    }),
    createdAt: toIsoDatetime(raw.returnData?.['createdAt'] ?? raw.returnData?.['timestamp']),
    raw,
  }
}
