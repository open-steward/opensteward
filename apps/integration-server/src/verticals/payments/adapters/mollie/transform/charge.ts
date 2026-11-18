import type { Charge, ChargeStatus } from '../../../schema/charge'
import { decimalToMinor, pickCurrency, strMap } from './shared'

export interface RawMolliePayment {
  id?: string
  status?: string
  amount?: { value?: string; currency?: string }
  amountRefunded?: { value?: string; currency?: string }
  description?: string
  customerId?: string
  mandateId?: string
  method?: string
  subscriptionId?: string
  createdAt?: string
  paidAt?: string
  failedAt?: string
  expiresAt?: string
  metadata?: Record<string, unknown>
  [k: string]: unknown
}

function mapStatus(raw: RawMolliePayment): ChargeStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'paid':
      return 'succeeded'
    case 'open':
    case 'pending':
    case 'authorized':
      return 'pending'
    case 'failed':
    case 'expired':
      return 'failed'
    case 'canceled':
      return 'cancelled'
    default:
      return 'pending'
  }
}

export function transformCharge(raw: RawMolliePayment): Charge {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    amount: decimalToMinor(raw.amount?.value),
    currency: pickCurrency(raw.amount?.currency),
    amountRefunded: decimalToMinor(raw.amountRefunded?.value),
    status: mapStatus(raw),
    customerId: raw.customerId,
    paymentMethodId: raw.mandateId,
    subscriptionId: raw.subscriptionId,
    description: raw.description,
    gateway: 'mollie',
    metadata: strMap(raw.metadata),
    createdAt: raw.createdAt,
    raw,
  }
}
