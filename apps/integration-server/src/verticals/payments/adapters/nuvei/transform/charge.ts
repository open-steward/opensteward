/**
 * Nuvei transaction → canonical Charge.
 *
 * A Nuvei "charge" is a Sale/Auth transaction surfaced by `payment.do` or
 * `getPaymentStatus.do`. The financial outcome lives in `transactionStatus`
 * (APPROVED / DECLINED / ERROR / PENDING); `transactionType` distinguishes
 * Sale (captured) from Auth (not yet captured). Amounts arrive as decimal
 * major-unit strings and are converted to integer minor units.
 *
 * Transforms never throw — missing optionals collapse to `undefined`.
 */
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { toIsoDatetime } from '@opensteward/shared'
import { pickCurrency, pickStr, strMap, toMinorUnits } from './shared'

export interface RawNuveiTransaction {
  transactionId?: string
  orderId?: string
  clientUniqueId?: string
  clientRequestId?: string
  transactionStatus?: string
  transactionType?: string
  status?: string
  amount?: string | number
  currency?: string
  authCode?: string
  userPaymentOptionId?: string
  paymentMethodName?: string
  errCode?: number
  reason?: string
  gwErrorReason?: string
  merchantDetails?: { customField1?: string; [k: string]: unknown }
  paymentOption?: {
    userPaymentOptionId?: string
    card?: { last4Digits?: string; cardBrand?: string; cardHolderName?: string }
  }
  createdDate?: string
  updatedDate?: string
  [k: string]: unknown
}

function mapStatus(raw: RawNuveiTransaction): ChargeStatus {
  const txStatus = (raw.transactionStatus ?? '').toUpperCase()
  switch (txStatus) {
    case 'APPROVED':
      return 'succeeded'
    case 'DECLINED':
    case 'ERROR':
      return 'failed'
    case 'PENDING':
      return 'pending'
    default:
      // Fall back to the request-level status if the financial one is absent.
      return (raw.status ?? '').toUpperCase() === 'SUCCESS' ? 'succeeded' : 'pending'
  }
}

/** Auth (DEPOSIT-less) transactions are not yet captured; Sales are. */
function isCaptured(raw: RawNuveiTransaction): boolean | undefined {
  const type = (raw.transactionType ?? '').toUpperCase()
  if (!type) return undefined
  return type === 'SALE' || type === 'SETTLE'
}

export function transformCharge(raw: RawNuveiTransaction): Charge {
  const id = raw.transactionId ?? raw.orderId ?? raw.clientUniqueId ?? ''
  const card = raw.paymentOption?.card
  const failure =
    mapStatus(raw) === 'failed'
      ? raw.gwErrorReason ?? raw.reason
      : undefined

  return {
    id: String(id),
    externalId: String(id),
    amount: toMinorUnits(raw.amount) ?? 0,
    currency: pickCurrency(raw.currency),
    status: mapStatus(raw),
    captured: isCaptured(raw),
    paymentMethodId: pickStr(raw.paymentOption?.userPaymentOptionId ?? raw.userPaymentOptionId),
    failureCode: failure ? pickStr(raw.errCode) : undefined,
    failureMessage: failure,
    gateway: 'nuvei',
    metadata: strMap({
      orderId: raw.orderId,
      clientUniqueId: raw.clientUniqueId,
      transactionType: raw.transactionType,
      authCode: raw.authCode,
      paymentMethodName: raw.paymentMethodName ?? card?.cardBrand,
      cardLast4: card?.last4Digits,
    }),
    createdAt: toIsoDatetime(raw.createdDate),
    updatedAt: toIsoDatetime(raw.updatedDate),
    raw,
  }
}
