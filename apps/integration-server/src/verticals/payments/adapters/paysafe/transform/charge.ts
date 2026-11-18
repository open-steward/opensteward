import type { Charge, ChargeStatus } from '../../../schema/charge'
import { toIsoDatetime } from '@opensteward/shared'
import { pickCurrency, pickStr, strMap } from './shared'

/**
 * A Paysafe **Payment** (paymenthub/v1) carries the amount, currency, customer
 * reference and overall status, so it maps onto the canonical **Charge**.
 *
 * `settleWithAuth: true` (the common case) auto-creates a settlement; the
 * embedded `settlements[]` array reports `availableToRefund` per settlement,
 * which we surface as the captured amount.
 */
export interface RawPaysafeSettlement {
  id?: string
  status?: string
  amount?: number
  availableToRefund?: number
  txnTime?: string
  [k: string]: unknown
}

export interface RawPaysafePayment {
  id?: string
  merchantRefNum?: string
  amount?: number
  currencyCode?: string
  status?: string
  settleWithAuth?: boolean
  availableToSettle?: number
  paymentHandleToken?: string
  description?: string
  customerIp?: string
  txnTime?: string
  updatedTime?: string
  dupCheck?: boolean
  profile?: { id?: string; email?: string; merchantCustomerId?: string }
  settlements?: RawPaysafeSettlement[]
  error?: { code?: string; message?: string }
  gatewayResponse?: { code?: string; description?: string; processor?: string }
  [k: string]: unknown
}

/**
 * Map Paysafe Payment status → canonical ChargeStatus.
 * Payments API states: RECEIVED, PENDING, COMPLETED, HELD, FAILED, CANCELLED.
 */
function mapStatus(raw: RawPaysafePayment): ChargeStatus {
  switch ((raw.status ?? '').toUpperCase()) {
    case 'COMPLETED':
      return 'succeeded'
    case 'PENDING':
    case 'RECEIVED':
    case 'PROCESSING':
    case 'INITIATED':
      return 'pending'
    case 'HELD':
      return 'disputed'
    case 'FAILED':
    case 'DECLINED':
    case 'ERROR':
      return 'failed'
    case 'CANCELLED':
    case 'EXPIRED':
    case 'VOIDED':
      return 'cancelled'
    default:
      return 'pending'
  }
}

/** Sum settled amounts across the embedded settlements. */
function capturedAmount(raw: RawPaysafePayment): number | undefined {
  if (!Array.isArray(raw.settlements) || raw.settlements.length === 0) return undefined
  const total = raw.settlements.reduce((acc, s) => acc + (s.amount ?? 0), 0)
  return total > 0 ? total : undefined
}

export function transformCharge(raw: RawPaysafePayment): Charge {
  const captured = capturedAmount(raw)
  const failureCode = raw.error?.code ?? raw.gatewayResponse?.code
  const failureMessage = raw.error?.message ?? raw.gatewayResponse?.description
  return {
    id: String(raw.id ?? raw.merchantRefNum ?? ''),
    externalId: String(raw.id ?? raw.merchantRefNum ?? ''),
    amount: raw.amount ?? 0,
    currency: pickCurrency(raw.currencyCode) ?? 'USD',
    amountCaptured: captured,
    status: mapStatus(raw),
    captured: captured != null ? captured > 0 : raw.settleWithAuth === true || undefined,
    customerId: pickStr(raw.profile?.id ?? raw.profile?.merchantCustomerId),
    paymentMethodId: pickStr(raw.paymentHandleToken),
    description: pickStr(raw.description),
    receiptEmail: pickStr(raw.profile?.email),
    failureCode: pickStr(failureCode),
    failureMessage: pickStr(failureMessage),
    gateway: 'paysafe',
    metadata: strMap({
      merchantRefNum: raw.merchantRefNum,
      paymentHandleToken: raw.paymentHandleToken,
      customerIp: raw.customerIp,
      processor: raw.gatewayResponse?.processor,
    }),
    createdAt: toIsoDatetime(raw.txnTime),
    updatedAt: toIsoDatetime(raw.updatedTime ?? raw.txnTime),
    raw,
  }
}
