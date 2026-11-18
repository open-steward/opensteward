/**
 * Belvo transaction → canonical BalanceTransaction.
 *
 * The same Belvo transaction object also fits the canonical
 * BalanceTransaction (a signed ledger entry). Unlike the Charge mapping —
 * which keeps `amount` positive — the BalanceTransaction `amount` is SIGNED:
 * OUTFLOW becomes negative, INFLOW stays positive, matching Belvo's
 * `type`-carried direction. Money is scaled from major to minor units.
 *
 * Docs: https://developers.belvo.com/apis/belvoopenapispec/transactions
 */
import { toIsoDatetime } from '@opensteward/shared'
import type {
  BalanceTransaction,
  BalanceTransactionType,
} from '../../../schema/balance-transaction'
import { pickCurrency, pickStr, strMap, toMinorUnits } from './shared'
import type { RawBelvoTransaction } from './charge'

/** Belvo only distinguishes direction (INFLOW/OUTFLOW); there is no fee /
 *  payout / dispute taxonomy, so every entry classifies as a generic
 *  ledger movement. */
function mapType(): BalanceTransactionType {
  return 'other'
}

export function transformBalanceTransaction(raw: RawBelvoTransaction): BalanceTransaction {
  const magnitude = toMinorUnits(raw.amount) ?? 0
  const signed = (raw.type ?? '').toUpperCase() === 'OUTFLOW' ? -magnitude : magnitude
  const acct =
    typeof raw.account === 'object' && raw.account ? raw.account : undefined
  return {
    id: pickStr(raw.id) ?? '',
    externalId: pickStr(raw.id) ?? '',
    type: mapType(),
    amount: signed,
    currency: pickCurrency(raw.currency ?? acct?.currency),
    sourceId: pickStr(raw.id),
    sourceType: 'transaction',
    description: raw.description ?? undefined,
    gateway: 'belvo',
    metadata: strMap({
      direction: raw.type,
      status: raw.status,
      category: raw.category,
      subcategory: raw.subcategory,
      value_date: raw.value_date,
      accounting_date: raw.accounting_date,
      balance: raw.balance,
    }),
    availableOn: toIsoDatetime(raw.value_date ?? raw.accounting_date),
    createdAt: toIsoDatetime(raw.collected_at ?? raw.value_date),
    raw,
  }
}
