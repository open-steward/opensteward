/**
 * Conekta `Transaction` — available at `GET /transactions`. Each transaction
 * represents a financial movement (charge, refund, commission deduction) with
 * an amount, fee, net, and type. Amounts are in centavos (minor units already).
 * Timestamps are Unix epoch seconds.
 *
 * Refs:
 *   https://developers.conekta.com/reference/gettransactions
 *   https://developers.conekta.com/reference/gettransaction
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { BalanceTransaction, BalanceTransactionType } from '../../../schema/balance-transaction'
import { pickCurrency, strMap } from './shared'

export interface RawConektaTransaction {
  id?: string
  object?: string
  type?: string
  amount?: number
  currency?: string
  fee?: number
  net?: number
  status?: string
  /** The charge id associated with this transaction. */
  charge?: string
  livemode?: boolean
  created_at?: number
  [k: string]: unknown
}

function mapType(raw: RawConektaTransaction): BalanceTransactionType {
  switch ((raw.type ?? '').toLowerCase()) {
    case 'charge':
      return 'charge'
    case 'refund':
      return 'refund'
    case 'payout':
    case 'transfer':
      return 'payout'
    case 'fee':
    case 'commission':
      return 'fee'
    case 'dispute':
    case 'chargeback':
      return 'dispute'
    case 'adjustment':
      return 'adjustment'
    default:
      return 'other'
  }
}

export function transformBalanceTransaction(raw: RawConektaTransaction): BalanceTransaction {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    type: mapType(raw),
    amount: raw.amount ?? 0,
    currency: pickCurrency(raw.currency),
    fee: raw.fee ?? undefined,
    net: raw.net ?? undefined,
    sourceId: raw.charge ? String(raw.charge) : undefined,
    sourceType: raw.type ?? undefined,
    description: raw.status ? `status:${raw.status}` : undefined,
    gateway: 'conekta',
    metadata: strMap({ livemode: raw.livemode, status: raw.status }),
    createdAt: toIsoDatetime(raw.created_at),
    raw,
  }
}
