import type { BalanceTransaction, BalanceTransactionType } from '../../../schema/balance-transaction'
import { decimalToMinor, pickCurrency, strMap } from './shared'

/**
 * Flutterwave v3 settlement object from GET /v3/settlements
 */
export interface RawFlutterwaveSettlement {
  id?: string | number
  net_amount?: number
  gross_amount?: number
  currency?: string
  status?: string
  due_datetime?: string
  destination?: string
  charge_count?: string | number
  created_datetime?: string
  fees?: Array<{ type?: string; amount?: number }>
  [k: string]: unknown
}

function mapType(): BalanceTransactionType {
  // Flutterwave settlements are always aggregated payout settlements
  return 'payout'
}

export function transformBalanceTransaction(raw: RawFlutterwaveSettlement): BalanceTransaction {
  const gross = decimalToMinor(raw.gross_amount)
  const net = decimalToMinor(raw.net_amount)
  const fee = gross - net >= 0 ? gross - net : undefined

  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    type: mapType(),
    amount: gross,
    currency: pickCurrency(raw.currency),
    fee,
    net: net || undefined,
    description: raw.destination ? `Settlement to ${raw.destination}` : undefined,
    availableOn: raw.due_datetime,
    gateway: 'flutterwave',
    metadata: strMap({ charge_count: raw.charge_count, destination: raw.destination }),
    createdAt: raw.created_datetime,
    raw,
  }
}
