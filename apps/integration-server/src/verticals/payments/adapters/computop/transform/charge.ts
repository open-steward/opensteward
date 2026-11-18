import type { Charge, ChargeStatus } from '../../../schema/charge'
import { pickAmount, pickCurrency, pickStr, strMap, toIso } from './shared'

/**
 * Computop payment object (subset). A payment is identified by `payId`
 * (Paygate-assigned, stable across the lifecycle) with the merchant's own
 * `transId` as a secondary reference. Money lives under `amount`, where
 * `capturedValue` / `refundedValue` track partial settlement.
 */
export interface RawComputopPayment {
  payId?: string
  transId?: string
  refNr?: string
  xId?: string
  status?: string
  responseCode?: string
  responseDescription?: string
  statementDescriptor?: string
  amount?: {
    value?: number
    currency?: string
    capturedValue?: number
    refundedValue?: number
  }
  customerInfo?: {
    gatewayCustomerId?: string
    merchantCustomerId?: string
    email?: string
  }
  order?: { creationDate?: string; merchantReference?: string }
  metadata?: Record<string, unknown>
  [k: string]: unknown
}

function mapStatus(raw: RawComputopPayment): ChargeStatus {
  const captured = raw.amount?.capturedValue ?? 0
  const refunded = raw.amount?.refundedValue ?? 0
  const total = raw.amount?.value ?? 0
  switch ((raw.status ?? '').toUpperCase()) {
    case 'OK':
    case 'CAPTURED':
    case 'SUCCESS':
      if (refunded > 0 && refunded < total) return 'partially_refunded'
      return 'succeeded'
    case 'AUTHORIZED':
    case 'AUTHORIZE_REQUEST':
    case 'AUTHORISED':
      return 'pending'
    case 'REFUNDED':
      return refunded > 0 && refunded < total ? 'partially_refunded' : 'refunded'
    case 'FAILED':
    case 'ERROR':
      return 'failed'
    case 'VOID':
    case 'CANCELLED':
    case 'CANCELED':
      return 'cancelled'
    case 'PENDING':
      return 'pending'
    default:
      if (refunded > 0 && refunded >= total) return 'refunded'
      if (refunded > 0) return 'partially_refunded'
      if (captured > 0) return 'succeeded'
      return 'pending'
  }
}

export function transformCharge(raw: RawComputopPayment): Charge {
  const id = pickStr(raw.payId) ?? pickStr(raw.transId) ?? ''
  const failure =
    (raw.status ?? '').toUpperCase() === 'FAILED' ? pickStr(raw.responseDescription) : undefined
  return {
    id,
    externalId: id,
    amount: pickAmount(raw.amount?.value),
    currency: pickCurrency(raw.amount?.currency),
    amountCaptured: raw.amount?.capturedValue ?? undefined,
    amountRefunded: raw.amount?.refundedValue ?? undefined,
    status: mapStatus(raw),
    customerId: pickStr(raw.customerInfo?.gatewayCustomerId),
    receiptEmail: pickStr(raw.customerInfo?.email),
    statementDescriptor: pickStr(raw.statementDescriptor),
    failureCode: pickStr(raw.responseCode),
    failureMessage: failure,
    gateway: 'computop',
    metadata: strMap({
      ...raw.metadata,
      transId: raw.transId,
      refNr: raw.refNr,
      status: raw.status,
    }),
    createdAt: toIso(raw.order?.creationDate),
    raw,
  }
}
