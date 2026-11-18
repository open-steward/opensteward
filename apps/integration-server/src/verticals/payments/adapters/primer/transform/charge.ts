/**
 * Primer is payment-centric: a **Payment** carries the amount, currency,
 * customer, payment method and overall status, so it maps onto the canonical
 * **Charge**. The embedded `customer` / `paymentMethod` objects surface the
 * customer id, receipt email and payment-method hints.
 *
 * Money is already in integer **minor units** (`amount: 700` = $7.00), so no
 * scaling is applied. Timestamps (`date`, `dateCreated`, `dateUpdated`) are
 * ISO-8601 and are coerced to strict ISO-8601 via `toIsoDatetime`.
 *
 * Status enum: PENDING, AUTHORIZED, SETTLING, PARTIALLY_SETTLED, SETTLED,
 * DECLINED, FAILED, CANCELLED. We refine settled payments into
 * partially_refunded / refunded using `amountRefunded`.
 *
 * Refs:
 *   https://primer.io/docs/payments/payments-api
 *   https://apiref.primer.io/reference/get_payment_payments__id__get
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { pickCurrency, strMap } from './shared'

export interface RawPrimerCustomerSummary {
  emailAddress?: string
  firstName?: string
  lastName?: string
  [k: string]: unknown
}

export interface RawPrimerPaymentMethod {
  analyticsId?: string
  paymentMethodType?: string
  paymentType?: string
  descriptor?: string
  last4Digits?: string
  network?: string
  [k: string]: unknown
}

export interface RawPrimerProcessor {
  name?: string
  processorMerchantId?: string
  [k: string]: unknown
}

export interface RawPrimerPayment {
  id?: string
  date?: string
  dateCreated?: string
  dateUpdated?: string
  status?: string
  orderId?: string
  currencyCode?: string
  amount?: number
  amountRefunded?: number
  amountCaptured?: number
  customerId?: string
  customer?: RawPrimerCustomerSummary
  paymentMethod?: RawPrimerPaymentMethod
  paymentMethodToken?: string
  processor?: RawPrimerProcessor
  statementDescriptor?: string
  metadata?: Record<string, unknown>
  transactions?: Array<Record<string, unknown>>
  [k: string]: unknown
}

function mapStatus(raw: RawPrimerPayment): ChargeStatus {
  const status = (raw.status ?? '').toUpperCase()
  const amount = raw.amount ?? 0
  const refunded = raw.amountRefunded ?? 0
  if (status === 'SETTLED' || status === 'PARTIALLY_SETTLED' || status === 'SETTLING') {
    if (refunded > 0 && amount > 0 && refunded >= amount) return 'refunded'
    if (refunded > 0) return 'partially_refunded'
    return 'succeeded'
  }
  switch (status) {
    case 'AUTHORIZED':
    case 'PENDING':
      return 'pending'
    case 'DECLINED':
    case 'FAILED':
      return 'failed'
    case 'CANCELLED':
      return 'cancelled'
    default:
      return 'pending'
  }
}

export function transformCharge(raw: RawPrimerPayment): Charge {
  const status = (raw.status ?? '').toUpperCase()
  const created = raw.date ?? raw.dateCreated
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    amount: raw.amount ?? 0,
    currency: pickCurrency(raw.currencyCode),
    amountRefunded: raw.amountRefunded ?? undefined,
    amountCaptured: raw.amountCaptured ?? undefined,
    status: mapStatus(raw),
    captured: status === 'SETTLED' || status === 'SETTLING' || status === 'PARTIALLY_SETTLED'
      ? true
      : undefined,
    customerId: raw.customerId ?? undefined,
    paymentMethodId: raw.paymentMethod?.analyticsId ?? raw.paymentMethodToken ?? undefined,
    statementDescriptor: raw.statementDescriptor ?? raw.paymentMethod?.descriptor ?? undefined,
    receiptEmail: raw.customer?.emailAddress ?? undefined,
    gateway: 'primer',
    metadata: strMap({
      ...raw.metadata,
      orderId: raw.orderId,
      processor: raw.processor?.name,
    }),
    createdAt: toIsoDatetime(created),
    updatedAt: toIsoDatetime(raw.dateUpdated),
    raw,
  }
}
