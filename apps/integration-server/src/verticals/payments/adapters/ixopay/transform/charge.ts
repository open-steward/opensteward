import type { Charge, ChargeStatus } from '../../../schema/charge'
import { toIsoDatetime } from '@opensteward/shared'
import { fromMinorUnits, pickCurrency, pickStr, strMap, toMinorUnits } from './shared'

/**
 * An IXOPAY transaction result — the shape returned by a debit/capture/void
 * call and by the status endpoint. Money rides as a major-unit decimal plus an
 * ISO-4217 currency; the gateway identifier is `uuid` (a.k.a. referenceId).
 */
export interface RawIxopayTransaction {
  success?: boolean
  /** FINISHED | PENDING | ERROR | REDIRECT */
  returnType?: string
  /** Status endpoint reports a richer lifecycle (PENDING, FINISHED, ERROR, …). */
  transactionStatus?: string
  /** DEBIT | PREAUTHORIZE | CAPTURE | VOID | REFUND | REGISTER | DEREGISTER | PAYOUT */
  transactionType?: string
  uuid?: string
  purchaseId?: string
  merchantTransactionId?: string
  amount?: string | number
  currency?: string
  paymentMethod?: string
  customer?: { identification?: string; email?: string } & Record<string, unknown>
  redirectUrl?: string
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

/**
 * Map IXOPAY's transaction lifecycle onto the canonical ChargeStatus. The
 * status endpoint's `transactionStatus` is authoritative when present; a fresh
 * transaction result only carries `returnType` + `success`.
 */
function mapStatus(raw: RawIxopayTransaction): ChargeStatus {
  const lifecycle = (raw.transactionStatus ?? '').toUpperCase()
  switch (lifecycle) {
    case 'FINISHED':
      return 'succeeded'
    case 'PENDING':
      return 'pending'
    case 'ERROR':
      return 'failed'
    case 'VOIDED':
    case 'CANCELLED':
      return 'cancelled'
    case 'REFUNDED':
      return 'refunded'
    case 'PARTIALLY-REFUNDED':
      return 'partially_refunded'
    case 'CHARGEBACK':
      return 'disputed'
  }
  const returnType = (raw.returnType ?? '').toUpperCase()
  if (returnType === 'FINISHED') return raw.success === false ? 'failed' : 'succeeded'
  if (returnType === 'ERROR') return 'failed'
  if (returnType === 'PENDING' || returnType === 'REDIRECT') return 'pending'
  if (raw.success === true) return 'succeeded'
  if (raw.success === false) return 'failed'
  return 'pending'
}

export function transformCharge(raw: RawIxopayTransaction): Charge {
  const currency = pickCurrency(raw.currency)
  const firstError = raw.errors?.[0]
  return {
    id: String(raw.uuid ?? raw.merchantTransactionId ?? ''),
    externalId: String(raw.uuid ?? ''),
    amount: toMinorUnits(raw.amount, currency) ?? 0,
    currency,
    status: mapStatus(raw),
    customerId: pickStr(raw.customer?.identification),
    receiptEmail: pickStr(raw.customer?.email),
    failureCode: firstError?.code != null ? String(firstError.code) : undefined,
    failureMessage: pickStr(firstError?.adapterMessage ?? firstError?.message),
    gateway: 'ixopay',
    metadata: strMap({
      merchantTransactionId: raw.merchantTransactionId,
      purchaseId: raw.purchaseId,
      transactionType: raw.transactionType,
      paymentMethod: raw.paymentMethod,
      ...raw.extraData,
    }),
    createdAt: toIsoDatetime(
      raw.returnData?.['createdAt'] ?? raw.returnData?.['timestamp'] ?? raw.extraData?.['createdAt'],
    ),
    raw,
  }
}

/** Canonical Charge → IXOPAY debit request body (camelCase JSON on the wire). */
export function untransformCharge(c: Partial<Charge>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (c.amount !== undefined && c.currency) {
    // Canonical amount is minor units; IXOPAY wants a major-unit decimal string.
    out.amount = fromMinorUnits(c.amount, c.currency)
  }
  if (c.currency !== undefined) out.currency = c.currency.toUpperCase()
  if (c.customerId !== undefined) out.customer = { identification: c.customerId }
  if (c.description !== undefined) out.description = c.description
  if (c.metadata && Object.keys(c.metadata).length) out.extraData = c.metadata
  return out
}
