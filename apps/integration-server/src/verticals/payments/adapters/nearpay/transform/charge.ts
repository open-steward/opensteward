import { majorToMinor } from '@opensteward/shared'
import type { Charge, ChargeStatus } from '../../../schema/charge'

/**
 * A receipt nested in a NearPay transaction. Fields as documented in the
 * List Transactions / Find Transaction examples
 * (https://docs.nearpay.io/sa/en/api-endpoints/accounts-api, "Transactions"):
 * `"amount_authorized": { "label": {...}, "value": "0.01" }`,
 * `"currency": { "arabic": "", "english": "SAR" }`,
 * `"is_approved": false, "is_refunded": false, "is_reversed": false`.
 */
export interface RawNearpayReceipt {
  id?: string
  /** Documented example value: `"type" : "purchase"`. */
  type?: string | null
  amount_authorized?: { value?: string | null; [k: string]: unknown }
  currency?: { english?: string | null; [k: string]: unknown }
  is_approved?: boolean
  is_refunded?: boolean
  is_reversed?: boolean
  updated_at?: string | null
  [k: string]: unknown
}

/** A NearPay transaction, as documented (`id`, `created_at`, `receipts[]`, `customer_reference_number`). */
export interface RawNearpayTransaction {
  id?: string
  created_at?: string | null
  receipts?: RawNearpayReceipt[]
  customer_reference_number?: string | null
  [k: string]: unknown
}

function mapStatus(r: RawNearpayReceipt): ChargeStatus {
  if (r.is_refunded === true) return 'refunded'
  if (r.is_reversed === true) return 'cancelled'
  return r.is_approved === true ? 'succeeded' : 'failed'
}

/**
 * Whether a transaction is a purchase. `GET /transactions` has no documented
 * type filter, and a terminal session's "type" can be either "purchase" or
 * "refund" (accounts-api, POST /terminals/{terminal_id}/sessions). Each
 * receipt carries that `type`; only "purchase" is a charge. Serving a refund
 * as a charge would count money that went out as money that came in.
 */
export function isPurchase(raw: RawNearpayTransaction): boolean {
  const receipt = raw.receipts?.[0]
  if (!receipt) return true // transformCharge refuses it with a clear error
  if (typeof receipt.type !== 'string') {
    throw new Error(`NearPay transaction ${String(raw.id)} has no receipt type`)
  }
  return receipt.type === 'purchase'
}

export function transformCharge(raw: RawNearpayTransaction): Charge {
  const id = raw.id
  if (typeof id !== 'string' || id === '') {
    throw new Error('NearPay transaction has no id')
  }
  const receipt = raw.receipts?.[0]
  if (!receipt) {
    throw new Error(`NearPay transaction ${id} has no receipt to read its amount from`)
  }
  const currency = receipt.currency?.english
  if (typeof currency !== 'string' || currency === '') {
    throw new Error(`NearPay transaction ${id} has no receipt currency`)
  }
  const value = receipt.amount_authorized?.value
  const major = typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN
  const amount = majorToMinor(Number.isFinite(major) ? major : null, currency)
  if (amount === undefined) {
    throw new Error(`NearPay transaction ${id} has no receipt amount_authorized.value`)
  }
  const metadata: Record<string, string> = {}
  if (typeof raw.customer_reference_number === 'string' && raw.customer_reference_number !== '') {
    metadata.customer_reference_number = raw.customer_reference_number
  }
  return {
    id,
    externalId: id,
    amount,
    currency,
    status: mapStatus(receipt),
    gateway: 'nearpay',
    metadata,
    createdAt: raw.created_at ?? undefined,
    updatedAt: receipt.updated_at ?? undefined,
    raw,
  }
}
