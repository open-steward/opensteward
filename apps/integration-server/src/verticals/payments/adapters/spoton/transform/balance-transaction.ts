import type {
  BalanceTransaction,
  BalanceTransactionType,
  Fee,
} from '../../../schema/balance-transaction'
import { toIso, strMap } from './shared'

export interface RawStripeBalanceTransaction {
  id: string
  object: 'balance_transaction'
  type: string
  amount: number
  currency: string
  fee?: number
  fee_details?: Array<{ amount: number; currency: string; type: string; description?: string }>
  net?: number
  source?: string | null
  description?: string | null
  available_on?: number
  created?: number
  [key: string]: unknown
}

function mapType(stripeType: string): BalanceTransactionType {
  if (stripeType.startsWith('charge')) return 'charge'
  if (stripeType.startsWith('refund')) return 'refund'
  if (stripeType.startsWith('payout')) return 'payout'
  if (stripeType.startsWith('adjustment')) return 'adjustment'
  if (stripeType.startsWith('application_fee')) return 'application_fee'
  if (stripeType.startsWith('transfer')) return 'transfer'
  if (stripeType.includes('fee')) return 'fee'
  if (stripeType.startsWith('dispute')) return 'dispute'
  return 'other'
}

function mapFees(raw: RawStripeBalanceTransaction): Fee[] | undefined {
  if (!raw.fee_details?.length) return undefined
  return raw.fee_details.map((f) => ({
    amount: f.amount,
    currency: f.currency.toUpperCase(),
    type: f.type,
    description: f.description,
  }))
}

export function transformBalanceTransaction(
  raw: RawStripeBalanceTransaction,
): BalanceTransaction {
  return {
    id: raw.id,
    externalId: raw.id,
    type: mapType(raw.type),
    amount: raw.amount,
    currency: raw.currency.toUpperCase(),
    fee: raw.fee,
    feeDetails: mapFees(raw),
    net: raw.net,
    sourceId: raw.source ?? undefined,
    sourceType: raw.type,
    availableOn: toIso(raw.available_on),
    description: raw.description ?? undefined,
    gateway: 'stripe',
    metadata: strMap((raw as Record<string, unknown>)['metadata']),
    createdAt: toIso(raw.created),
    raw,
  }
}
