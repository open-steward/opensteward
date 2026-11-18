/**
 * GoCardless `Mandate` is the canonical PaymentMethod for direct-debit
 * semantics. We surface them through the canonical PaymentMethod schema
 * with `type = 'mandate'`.
 */
import type { PaymentMethod } from '../../../schema/payment-method'
import { strMap } from './shared'

export interface RawGCMandate {
  id?: string
  status?: string
  scheme?: string
  reference?: string
  next_possible_charge_date?: string
  payments_require_approval?: boolean
  links?: { customer?: string; customer_bank_account?: string }
  created_at?: string
  [k: string]: unknown
}

export function transformMandate(raw: RawGCMandate): PaymentMethod {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    customerId: raw.links?.customer,
    type: 'mandate',
    brand: raw.scheme,
    gateway: 'gocardless',
    metadata: strMap({
      status: raw.status,
      reference: raw.reference,
      bankAccount: raw.links?.customer_bank_account,
    }),
    createdAt: raw.created_at,
    raw,
  }
}
