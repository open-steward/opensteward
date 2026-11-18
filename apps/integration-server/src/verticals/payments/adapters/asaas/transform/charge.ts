/**
 * Asaas Payment ↔ canonical Charge.
 *
 * In Asaas a **Payment** is the unit that carries the amount, customer, due
 * date and settlement status — so it maps onto the canonical **Charge**.
 *
 * Money: Asaas returns `value` as a **decimal of reais** (e.g. `129.9`); we
 * convert to integer centavos. Currency is always BRL. Timestamps are ISO
 * date / date-time strings and pass through `toIsoDatetime`.
 *
 * Refs:
 *   https://docs.asaas.com/reference/list-payments
 *   https://docs.asaas.com/reference/create-new-payment
 */
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { ASAAS_CURRENCY, strMap, toIsoDatetime, toMinorUnits } from './shared'

export interface RawAsaasPayment {
  object?: string
  id?: string
  dateCreated?: string
  customer?: string
  subscription?: string
  installment?: string
  value?: number
  netValue?: number
  originalValue?: number
  description?: string
  billingType?: string
  status?: string
  dueDate?: string
  originalDueDate?: string
  paymentDate?: string
  clientPaymentDate?: string
  invoiceUrl?: string
  invoiceNumber?: string
  transactionReceiptUrl?: string
  externalReference?: string
  deleted?: boolean
  refunds?: unknown[]
  [k: string]: unknown
}

/**
 * Asaas payment `status` values: PENDING, RECEIVED, CONFIRMED, OVERDUE,
 * REFUNDED, RECEIVED_IN_CASH, REFUND_REQUESTED, REFUND_IN_PROGRESS,
 * CHARGEBACK_REQUESTED, CHARGEBACK_DISPUTE, AWAITING_CHARGEBACK_REVERSAL,
 * DUNNING_REQUESTED, DUNNING_RECEIVED, AWAITING_RISK_ANALYSIS.
 */
function mapStatus(raw: RawAsaasPayment): ChargeStatus {
  switch ((raw.status ?? '').toUpperCase()) {
    case 'CONFIRMED':
    case 'RECEIVED':
    case 'RECEIVED_IN_CASH':
    case 'DUNNING_RECEIVED':
      return 'succeeded'
    case 'REFUNDED':
    case 'REFUND_REQUESTED':
    case 'REFUND_IN_PROGRESS':
      return 'refunded'
    case 'CHARGEBACK_REQUESTED':
    case 'CHARGEBACK_DISPUTE':
    case 'AWAITING_CHARGEBACK_REVERSAL':
      return 'disputed'
    case 'OVERDUE':
      return 'failed'
    case 'PENDING':
    case 'DUNNING_REQUESTED':
    case 'AWAITING_RISK_ANALYSIS':
      return 'pending'
    default:
      return 'pending'
  }
}

export function transformCharge(raw: RawAsaasPayment): Charge {
  const status = (raw.status ?? '').toUpperCase()
  const settled = status === 'CONFIRMED' || status === 'RECEIVED' || status === 'RECEIVED_IN_CASH'
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    amount: toMinorUnits(raw.value) ?? 0,
    currency: ASAAS_CURRENCY,
    amountCaptured: settled ? toMinorUnits(raw.value) : undefined,
    status: mapStatus(raw),
    captured: settled ? true : undefined,
    capturedAt: settled
      ? toIsoDatetime(raw.clientPaymentDate ?? raw.paymentDate)
      : undefined,
    customerId: raw.customer ?? undefined,
    subscriptionId: raw.subscription ?? undefined,
    description: raw.description ?? undefined,
    receiptUrl: raw.transactionReceiptUrl ?? raw.invoiceUrl ?? undefined,
    gateway: 'asaas',
    metadata: strMap({
      billingType: raw.billingType,
      invoiceNumber: raw.invoiceNumber,
      externalReference: raw.externalReference,
      netValue: raw.netValue,
    }),
    createdAt: toIsoDatetime(raw.dateCreated),
    updatedAt: toIsoDatetime(raw.clientPaymentDate ?? raw.paymentDate ?? raw.dateCreated),
    raw,
  }
}

/** Map a canonical Charge patch onto an Asaas create-payment body. */
export function untransformCharge(c: Partial<Charge>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (c.customerId !== undefined) out.customer = c.customerId
  // Canonical amount is minor units; Asaas expects reais.
  if (typeof c.amount === 'number') out.value = c.amount / 100
  if (c.description !== undefined) out.description = c.description
  const billingType = c.metadata?.billingType
  out.billingType = billingType ?? 'UNDEFINED'
  const externalReference = c.metadata?.externalReference
  if (externalReference) out.externalReference = externalReference
  return out
}
