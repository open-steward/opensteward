/**
 * Recurly `Transaction` → canonical Charge. Same indirection convention as
 * Chargebee: `Charge.gateway = 'recurly'`, `metadata.processor` = the
 * underlying payment gateway.
 */
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { decimalToMinor, pickCurrency, strMap } from './shared'

export interface RawRecurlyTransaction {
  id?: string
  uuid?: string
  type?: string
  status?: string
  amount?: number
  currency?: string
  account?: { id?: string }
  invoice?: { id?: string }
  subscription_ids?: string[]
  payment_method?: { gateway_code?: string }
  gateway_transaction_id?: string
  collected_at?: string
  created_at?: string
  error?: { code?: string; message?: string }
  [k: string]: unknown
}

function mapStatus(raw: RawRecurlyTransaction): ChargeStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'success':
      return raw.type === 'refund' ? 'refunded' : 'succeeded'
    case 'declined':
    case 'error':
    case 'failure':
      return 'failed'
    case 'voided':
      return 'cancelled'
    case 'pending':
    case 'scheduled':
      return 'pending'
    default:
      return 'pending'
  }
}

export function transformCharge(raw: RawRecurlyTransaction): Charge {
  return {
    id: String(raw.id ?? raw.uuid ?? ''),
    externalId: String(raw.uuid ?? raw.id ?? ''),
    amount: decimalToMinor(raw.amount),
    currency: pickCurrency(raw.currency),
    status: mapStatus(raw),
    customerId: raw.account?.id,
    invoiceId: raw.invoice?.id,
    subscriptionId: raw.subscription_ids?.[0],
    failureCode: raw.error?.code,
    failureMessage: raw.error?.message,
    gateway: 'recurly',
    metadata: strMap({
      processor: raw.payment_method?.gateway_code,
      gateway_transaction_id: raw.gateway_transaction_id,
      type: raw.type,
    }),
    createdAt: raw.created_at,
    updatedAt: raw.collected_at,
    raw,
  }
}
