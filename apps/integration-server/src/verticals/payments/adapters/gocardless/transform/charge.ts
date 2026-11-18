import type { Charge, ChargeStatus } from '../../../schema/charge'
import { pickCurrency, strMap } from './shared'

export interface RawGCPayment {
  id?: string
  amount?: number
  currency?: string
  status?: string
  description?: string
  reference?: string
  charge_date?: string
  links?: { mandate?: string; customer?: string; subscription?: string }
  created_at?: string
  [k: string]: unknown
}

function mapStatus(raw: RawGCPayment): ChargeStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'paid_out':
    case 'confirmed':
    case 'submitted':
      return 'succeeded'
    case 'pending_customer_approval':
    case 'pending_submission':
      return 'pending'
    case 'failed':
      return 'failed'
    case 'cancelled':
    case 'customer_approval_denied':
      return 'cancelled'
    case 'charged_back':
      return 'disputed'
    default:
      return 'pending'
  }
}

export function transformCharge(raw: RawGCPayment): Charge {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    amount: raw.amount ?? 0,
    currency: pickCurrency(raw.currency),
    status: mapStatus(raw),
    customerId: raw.links?.customer,
    paymentMethodId: raw.links?.mandate,
    subscriptionId: raw.links?.subscription,
    description: raw.description,
    gateway: 'gocardless',
    metadata: strMap({ reference: raw.reference, charge_date: raw.charge_date }),
    createdAt: raw.created_at,
    raw,
  }
}
