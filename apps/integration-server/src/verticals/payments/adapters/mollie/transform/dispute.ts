import type { Dispute, DisputeReason, DisputeStatus } from '../../../schema/dispute'
import { decimalToMinor, pickCurrency, strMap } from './shared'

/** Mollie surfaces disputes as "chargebacks". */
export interface RawMollieChargeback {
  id?: string
  paymentId?: string
  amount?: { value?: string; currency?: string }
  settlementAmount?: { value?: string; currency?: string }
  reason?: { code?: string; description?: string }
  createdAt?: string
  reversedAt?: string
  [k: string]: unknown
}

function mapStatus(raw: RawMollieChargeback): DisputeStatus {
  if (raw.reversedAt) return 'won'
  return 'needs_response'
}

function mapReason(raw: RawMollieChargeback): DisputeReason | undefined {
  const code = (raw.reason?.code ?? '').toUpperCase()
  if (!code) return undefined
  if (code.startsWith('FR') || code.includes('FRAUD')) return 'fraudulent'
  if (code.includes('NOT_RECEIVED')) return 'product_not_received'
  if (code.includes('DUPLICATE')) return 'duplicate'
  return 'other'
}

export function transformDispute(raw: RawMollieChargeback): Dispute {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    chargeId: String(raw.paymentId ?? ''),
    amount: decimalToMinor(raw.amount?.value),
    currency: pickCurrency(raw.amount?.currency),
    status: mapStatus(raw),
    reason: mapReason(raw),
    gateway: 'mollie',
    metadata: strMap({ reasonDescription: raw.reason?.description }),
    createdAt: raw.createdAt,
    raw,
  }
}
