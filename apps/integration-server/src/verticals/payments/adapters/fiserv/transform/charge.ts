import { toIsoDatetime } from '@opensteward/shared'
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { pickCurrency, strMap, toMinorUnits } from './shared'

/**
 * Shape of a Commerce Hub charge / capture / cancel response (the relevant
 * subset). Commerce Hub nests transaction outcome under `gatewayResponse` and
 * the processor verdict under `paymentReceipt.processorResponseDetails`. All
 * fields are optional — transforms never throw and tolerate partial payloads.
 */
export interface RawFiservTransaction {
  gatewayResponse?: {
    transactionType?: string
    transactionState?: string
    transactionProcessingDetails?: {
      transactionId?: string
      orderId?: string
      transactionTimestamp?: string
      clientRequestId?: string
      apiTraceId?: string
    }
  }
  transactionDetails?: {
    captureFlag?: boolean
    merchantTransactionId?: string
    merchantOrderId?: string
    captureFlagReason?: string
  }
  amount?: { total?: number; currency?: string }
  approvedAmount?: { total?: number; currency?: string }
  source?: {
    sourceType?: string
    card?: { last4?: string; scheme?: string; bin?: string }
  }
  transactionReceipts?: Array<{ merchantId?: string }>
  paymentReceipt?: {
    approvedAmount?: { total?: number; currency?: string }
    processorResponseDetails?: {
      approvalStatus?: string
      approvalCode?: string
      responseCode?: string
      responseMessage?: string
      hostResponseCode?: string
      hostResponseMessage?: string
    }
  }
  error?: Array<{ type?: string; code?: string; message?: string }>
  [k: string]: unknown
}

function processorDetails(raw: RawFiservTransaction) {
  return raw.paymentReceipt?.processorResponseDetails ?? {}
}

/**
 * Map Commerce Hub's `transactionState` + processor `approvalStatus` onto the
 * canonical `ChargeStatus`. State drives the verdict; for ambiguous states we
 * fall back to the processor approval status.
 */
function mapStatus(raw: RawFiservTransaction): ChargeStatus {
  const state = (raw.gatewayResponse?.transactionState ?? '').toUpperCase()
  switch (state) {
    case 'CAPTURED':
    case 'SETTLED':
    case 'COMPLETED':
    case 'APPROVED':
      return 'succeeded'
    case 'AUTHORIZED':
    case 'WAITING':
    case 'INITIALIZED':
      return 'pending'
    case 'DECLINED':
    case 'FAILED':
      return 'failed'
    case 'VOIDED':
    case 'CANCELLED':
    case 'AUTHENTICATION_FAILED':
      return 'cancelled'
    default:
      break
  }
  const approval = (processorDetails(raw).approvalStatus ?? '').toUpperCase()
  if (approval === 'APPROVED') return 'succeeded'
  if (approval === 'DECLINED' || approval === 'WAITING') return 'failed'
  return 'pending'
}

/**
 * Commerce Hub returns the approved amount in `paymentReceipt.approvedAmount`
 * (or top-level `approvedAmount`); the requested amount in `amount`. Prefer
 * approved, fall back to requested.
 */
function amountBlock(raw: RawFiservTransaction): { total?: number; currency?: string } {
  return raw.paymentReceipt?.approvedAmount ?? raw.approvedAmount ?? raw.amount ?? {}
}

export function transformCharge(raw: RawFiservTransaction): Charge {
  const details = raw.gatewayResponse?.transactionProcessingDetails ?? {}
  const amt = amountBlock(raw)
  const requested = raw.amount ?? {}
  const currency = pickCurrency(amt.currency ?? requested.currency)
  const proc = processorDetails(raw)
  const captured = raw.transactionDetails?.captureFlag

  return {
    id: String(details.transactionId ?? details.orderId ?? ''),
    externalId: String(details.transactionId ?? details.orderId ?? ''),
    amount: toMinorUnits(amt.total ?? requested.total, currency),
    currency,
    amountCaptured:
      captured === true ? toMinorUnits(amt.total ?? requested.total, currency) : undefined,
    status: mapStatus(raw),
    captured,
    failureCode: proc.responseCode ?? proc.hostResponseCode,
    failureMessage:
      proc.approvalStatus === 'DECLINED'
        ? (proc.responseMessage ?? proc.hostResponseMessage)
        : raw.error?.[0]?.message,
    gateway: 'fiserv',
    metadata: strMap({
      transactionType: raw.gatewayResponse?.transactionType,
      transactionState: raw.gatewayResponse?.transactionState,
      orderId: details.orderId,
      merchantTransactionId: raw.transactionDetails?.merchantTransactionId,
      merchantOrderId: raw.transactionDetails?.merchantOrderId,
      apiTraceId: details.apiTraceId,
      approvalStatus: proc.approvalStatus,
      approvalCode: proc.approvalCode,
      sourceType: raw.source?.sourceType,
      cardLast4: raw.source?.card?.last4,
      cardScheme: raw.source?.card?.scheme,
    }),
    createdAt: toIsoDatetime(details.transactionTimestamp),
    raw,
  }
}
