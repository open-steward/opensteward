import type { Payout, PayoutStatus } from '../../../schema/payout'
import { toIsoDatetime } from '@opensteward/shared'
import { pickCurrency, pickStr, strMap, toMinorUnits } from './shared'

/**
 * IXOPAY payout transaction result.
 *
 * A payout is submitted via `POST /transaction/{apiKey}/payout` and credits the
 * customer's account with the given amount. The response shape is the same
 * TransactionResponse envelope as debit / refund. There is no separate list or
 * get endpoint for payouts; status is queried via the standard status endpoints
 * (`/status/{apiKey}/getByUuid/{uuid}`).
 *
 * Docs: https://documentation.ixopay.com/api/transaction/payout
 *       https://gateway.ixopay.com/Schema/V3/OpenApiSpecification.yml
 */
export interface RawIxopayPayout {
  success?: boolean
  /** FINISHED | PENDING | ERROR | REDIRECT */
  returnType?: string
  /** Status endpoint lifecycle value when retrieved via getByUuid. */
  transactionStatus?: string
  /** PAYOUT */
  transactionType?: string
  uuid?: string
  purchaseId?: string
  merchantTransactionId?: string
  amount?: string | number
  currency?: string
  paymentMethod?: string
  returnData?: Record<string, unknown>
  extraData?: Record<string, unknown>
  errors?: Array<{
    message?: string
    code?: number | string
    adapterMessage?: string
    adapterCode?: string
  }>
  [k: string]: unknown
}

function mapStatus(raw: RawIxopayPayout): PayoutStatus {
  const lifecycle = (raw.transactionStatus ?? '').toUpperCase()
  if (lifecycle === 'FINISHED') return 'paid'
  if (lifecycle === 'PENDING') return 'in_transit'
  if (lifecycle === 'ERROR') return 'failed'
  if (lifecycle === 'CANCELLED' || lifecycle === 'VOIDED') return 'cancelled'
  const returnType = (raw.returnType ?? '').toUpperCase()
  if (returnType === 'FINISHED') return raw.success === false ? 'failed' : 'paid'
  if (returnType === 'ERROR') return 'failed'
  if (returnType === 'PENDING' || returnType === 'REDIRECT') return 'in_transit'
  if (raw.success === true) return 'paid'
  if (raw.success === false) return 'failed'
  return 'pending'
}

export function transformPayout(raw: RawIxopayPayout): Payout {
  const currency = pickCurrency(raw.currency)
  const firstError = raw.errors?.[0]
  return {
    id: String(raw.uuid ?? raw.merchantTransactionId ?? ''),
    externalId: String(raw.uuid ?? ''),
    amount: toMinorUnits(raw.amount, currency) ?? 0,
    currency,
    status: mapStatus(raw),
    failureCode: firstError?.code != null ? String(firstError.code) : undefined,
    failureMessage: pickStr(firstError?.adapterMessage ?? firstError?.message),
    gateway: 'ixopay',
    metadata: strMap({
      merchantTransactionId: raw.merchantTransactionId,
      purchaseId: raw.purchaseId,
      paymentMethod: raw.paymentMethod,
      transactionType: raw.transactionType,
      ...raw.extraData,
    }),
    createdAt: toIsoDatetime(
      raw.returnData?.['createdAt'] ?? raw.returnData?.['timestamp'] ?? raw.extraData?.['createdAt'],
    ),
    raw,
  }
}
