/**
 * Dodo Payments balance ledger entry → canonical `BalanceTransaction`.
 *
 * Endpoint: GET /balances/ledger
 * Returns a paginated `{ items: [...] }` list. Each entry records a credit or
 * debit on the account balance — payments, refunds, fees, disputes, and
 * payouts all produce ledger lines.
 *
 * Positive `is_credit=true` amounts are credits (money in); `is_credit=false`
 * are debits. The canonical schema stores the signed amount: we negate for
 * debits to match the convention used by Stripe balance transactions.
 *
 * Docs: https://docs.dodopayments.com/api-reference/balance-ledger/list-ledger-entries
 */
import type {
  BalanceTransaction,
  BalanceTransactionType,
} from '../../../schema/balance-transaction'
import { toIsoDatetime } from '@opensteward/shared'
import { pickCurrency, strMap } from './shared'

export interface RawDodoLedgerEntry {
  id?: string
  business_id?: string
  event_type?: string
  amount?: number
  currency?: string
  is_credit?: boolean
  created_at?: string
  usd_equivalent_amount?: number
  after_balance?: number | null
  before_balance?: number | null
  description?: string | null
  reference_object_id?: string | null
  [k: string]: unknown
}

function mapType(eventType: string | undefined): BalanceTransactionType {
  const t = (eventType ?? '').toLowerCase()
  if (t.includes('payment') || t.includes('charge')) return 'charge'
  if (t.includes('refund')) return 'refund'
  if (t.includes('payout')) return 'payout'
  if (t.includes('dispute') || t.includes('chargeback')) return 'dispute'
  if (t.includes('fee')) return 'fee'
  if (t.includes('adjustment')) return 'adjustment'
  if (t.includes('transfer')) return 'transfer'
  return 'other'
}

export function transformBalanceTransaction(raw: RawDodoLedgerEntry): BalanceTransaction {
  const gross = raw.amount ?? 0
  // Canonical amount is signed: positive = credit, negative = debit
  const signedAmount = raw.is_credit === false ? -gross : gross
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    type: mapType(raw.event_type),
    amount: signedAmount,
    currency: pickCurrency(raw.currency),
    fee: undefined,
    feeDetails: undefined,
    net: signedAmount,
    sourceId: raw.reference_object_id ?? undefined,
    sourceType: raw.event_type ?? undefined,
    availableOn: undefined,
    description: raw.description ?? undefined,
    gateway: 'dodo-payments',
    metadata: strMap({
      business_id: raw.business_id,
      usd_equivalent_amount: raw.usd_equivalent_amount,
      after_balance: raw.after_balance,
      before_balance: raw.before_balance,
    }),
    createdAt: toIsoDatetime(raw.created_at),
    raw,
  }
}
